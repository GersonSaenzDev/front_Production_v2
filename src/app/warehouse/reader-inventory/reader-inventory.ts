// src/app/warehouse/reader-inventory/reader-inventory.ts
import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { HttpErrorResponse } from '@angular/common/http';
import { NgbModal, NgbModalModule } from '@ng-bootstrap/ng-bootstrap';

import { DashInventoryServices } from '../../services/dashInventory-services';
import { AuthService } from '../../services/auth-services';
import { Product, StorageItem } from '../../interfaces/dashInventory.interface';

import { firstValueFrom, throwError } from 'rxjs';

/** Estado de una lectura mientras espera ser cargada al servidor. */
type PendingStatus = 'pending' | 'sending' | 'error';

/**
 * Lectura de modo simple retenida localmente (offline-first).
 * Se persiste en localStorage para no perder datos si no hay wifi / se recarga la página.
 */
export interface PendingReading {
  id: string;
  barcode: string;
  area: string;
  operatorName: string;
  operatorId: string;
  createdAt: string;
  attempts: number;
  status: PendingStatus;
  /** transient = se reintenta (red/5xx); permanent = requiere revisión manual (validación / no encontrado). */
  errorKind?: 'transient' | 'permanent';
  lastError?: string;
  /** Producto resuelto vía getStorage; se completa al momento de sincronizar. */
  product?: Product;
}

@Component({
  selector: 'app-inventory-reader',
  standalone: true,
  imports: [CommonModule, FormsModule, NgbModalModule],
  templateUrl: './reader-inventory.html',
  styleUrls: ['./reader-inventory.scss']
})
export class InventoryReader implements OnInit, OnDestroy {
  /** Longitud exacta de un barcode válido de Indusel (ver seeSearchReferenceStorageDAO en el backend). */
  private static readonly BARCODE_LENGTH = 27;

  /**
   * Prefijo GS1 fijo de todo EAN-128 de Indusel: AI (01) + GTIN con indicador `0` y
   * prefijo de compañía `7706060`. Un serial válido SIEMPRE arranca EXACTAMENTE con estos
   * 10 dígitos y a continuación trae los 6 dígitos de la referencia (posiciones 11-16).
   * Si una lectura trae 27 dígitos pero NO empieza así, es un código de otra empresa o lo
   * decodificó mal la pistola (p. ej. `0121316060…` en vez de `0107706060…`): se alerta
   * como mala lectura y se descarta. Mantener sincronizado con barcode-reader.ts.
   */
  private static readonly BARCODE_PREFIX = '0107706060';

  /**
   * Tamaño exacto de un palet en modo Regleta: 10 unidades de la MISMA referencia con
   * consecutivos que forman un rango contiguo (sin huecos, sin sobrantes). Antes se
   * manejaban grupos de 4 o 5; el de 4 ya no se empaca así, esos productos ahora se
   * registran individualmente en modo Lectura Simple.
   */
  private static readonly PALLET_SIZE = 10;

  /**
   * Referencias que se empacan como REGLETA / palet de 10 unidades con consecutivos
   * contiguos. NO es una sola referencia: varias líneas se despachan así. El sistema lo
   * detecta SOLO a partir del código escaneado — el operario no elige ningún modo: según
   * la referencia, el código pasa por la validación de palet (antes "Regleta") o se
   * registra de inmediato en la cola individual (antes "Lectura Simple"). Así una
   * referencia que no va en regleta nunca se queda esperando un palet que jamás se completa.
   *
   * Formato de la llave = lo que devuelve `extractReference()`: los 7 dígitos que van en
   * las posiciones 10-16 del código de 27 (últimos 7 del GTIN-14 = `0` + los 6 dígitos de
   * la referencia). Para sumar otra, agrega aquí su valor de 7 dígitos y mantén esta lista
   * sincronizada con barcode-reader.ts. Referencias confirmadas contra etiqueta física:
   *   0014171  (referencia previa)
   *   0312093  MAJESTIC SE 200-1 MOTEADO       -> GTIN (01) 07706060312093
   *   0033028  SE 200-1 (gas, POT 4,06 kW)     -> GTIN (01) 07706060033028
   *   0034025  SE 200-1 GN 17-25 mbar          -> GTIN (01) 07706060034025
   *   0011170  SE 200-1 ABBA MOTEADO (GLP)     -> GTIN (01) 07706060011170
   *   0012092  SE 200-1 AZUL MOTEADO           -> GTIN (01) 07706060012092
   */
  private static readonly PALLET_REFERENCES = new Set<string>(['0014171', '0312093', '0033028', '0034025', '0011170', '0012092']);
  private static readonly REF_START = 9;
  private static readonly REF_LEN = 7;

  private dashService = inject(DashInventoryServices);
  private modalService = inject(NgbModal);
  private authService = inject(AuthService);

  /**
   * Última detección automática (solo informativa, para que el operario/soporte pueda
   * confirmar en campo que el sistema está reconociendo bien la referencia). Ya NO es
   * un modo que el operario elija: se recalcula en cada escaneo válido según
   * PALLET_REFERENCES. "individual" = cola de envío (antes "Lectura Simple");
   * "palet" = validación de palet de 10 (antes "Regleta").
   */
  lastDetectedMode: 'individual' | 'palet' | null = null;
  lastDetectedReference: string | null = null;

  // Código de barras actual
  barcodeInput: string = '';
  private scanTimer: any;

  // Lista de códigos leídos
  scannedCodes: string[] = [];

  /** Cuántos de los códigos escaneados (del lote actual) ya se confirmaron en el servidor. */
  sentCount: number = 0;

  // Producto actual (modo simple)
  currentProduct: Product | null = null;

  // Productos en la regleta (modo regleta)
  regletaProducts: Product[] = [];

  // Mensaje de estado
  statusMessage: string = '';

  // Campos del formulario (ahora en modal): solo el Área se diligencia manualmente.
  inventoryArea: string = '';

  // Identidad del operario tomada del token (solo lectura, no se pide en el formulario).
  get currentUserName(): string {
    return this.authService.userData()?.full_name?.trim() || '';
  }

  get currentUserId(): string {
    const user = this.authService.userData();
    return (user?.uid || user?.userApp || '').trim();
  }

  // Añadir en la clase (propiedades)
  serverResponse: any = null;
  duplicateBarcode: string | null = null;
  serverSuccess: boolean | null = null;

  // Indica si hay una carga en curso para bloquear múltiples peticiones
  loading: boolean = false;

  /** Evita repetir el alert bloqueante de "sin Área" en cada lectura (solo la 1ª vez). */
  private missingAreaAlerted = false;

  // ─────────────────────────────────────────────────────────────────────────────
  //  Cola offline-first (SOLO modo simple; regleta no se toca)
  // ─────────────────────────────────────────────────────────────────────────────
  private readonly QUEUE_KEY = 'inventory-reader.pending-queue.v1';
  /** Contadores del lote actual (escaneados / enviados), para sobrevivir un recargo accidental de la página. */
  private readonly SESSION_KEY = 'inventory-reader.session-counters.v1';
  /**
   * Área de inventario en curso. Se persiste APARTE de la cola para que una recarga de
   * la página (sueño/despertar de la tablet, actualización de la PWA, refresh accidental)
   * NO borre el Área. Si el Área queda vacía, `enqueueReading()` aborta cada lectura y el
   * operario sigue escaneando "al vacío": así se perdían lecturas y el contador marcaba
   * "Escaneados" muy por encima de "Enviados al servidor".
   */
  private readonly AREA_KEY = 'inventory-reader.area.v1';
  /**
   * Registro POR-CÓDIGO de lo que el servidor ya confirmó (insertado o rechazado por
   * duplicado). Antes solo existía el número `sentCount`, así que era imposible saber
   * QUÉ lectura llegó y cuál no. Con este Set "Enviados" es exacto y se puede reenviar
   * SOLO lo que quedó sin confirmar (ver `resyncUnconfirmed()`). Crece indefinidamente,
   * igual que `historicItems` en barcode-reader.ts.
   */
  private readonly SENT_KEY = 'inventory-reader.sent-barcodes.v1';

  /** Lecturas de modo simple retenidas hasta poder cargarlas al servidor. */
  pendingQueue: PendingReading[] = [];

  /** Códigos ya confirmados por el servidor (ver SENT_KEY). */
  private sentBarcodes = new Set<string>();

  /** true mientras se está vaciando la cola (evita envíos concurrentes). */
  flushing = false;

  /** Estado de conectividad del navegador (para la UI y los reintentos). */
  online: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;

  /** Resumen del último intento de sincronización. */
  lastSyncMessage = '';
  /** Tipo del último resumen, para darle color a `lastSyncMessage` (éxito total vs. con pendientes/errores). */
  lastSyncKind: 'success' | 'warning' | null = null;

  private readonly onlineHandler = () => this.onConnectivityChange(true);
  private readonly offlineHandler = () => this.onConnectivityChange(false);
  private readonly focusHandler = () => {
    if (typeof navigator !== 'undefined' && navigator.onLine && this.pendingCount > 0) {
      this.flushQueue();
    }
  };
  private retryTimer: ReturnType<typeof setInterval> | null = null;

  /** Lecturas que todavía deben enviarse (pendientes + errores transitorios). */
  get pendingCount(): number {
    return this.pendingQueue.filter((i) => i.status !== 'error' || i.errorKind === 'transient').length;
  }

  /**
   * Igual que `pendingQueue` pero con la lectura más reciente primero, para que el
   * usuario vea de inmediato lo que acaba de escanear sin desplazar la pantalla
   * (mismo criterio aplicado en barcode-reader.ts). El orden interno de `pendingQueue`
   * NO se toca: el envío al servidor sigue siendo FIFO (primero en llegar, primero en salir).
   */
  get pendingQueueDisplay(): PendingReading[] {
    return [...this.pendingQueue].reverse();
  }

  /** Lecturas rechazadas por el servidor que requieren revisión manual. */
  get errorCount(): number {
    return this.pendingQueue.filter((i) => i.status === 'error' && i.errorKind === 'permanent').length;
  }

  /**
   * Códigos escaneados en este lote que el servidor NO confirmó y que tampoco están en
   * la cola. Normalmente 0. Un número > 0 = lecturas que se registraron en pantalla
   * pero nunca llegaron al inventario (típicamente por escanear con el Área vacía tras
   * una recarga). Se recuperan con `resyncUnconfirmed()`.
   */
  get unconfirmedCodes(): string[] {
    return this.scannedCodes.filter((c) => !this.sentBarcodes.has(c) && !this.pendingQueue.some((i) => i.barcode === c));
  }

  get unconfirmedCount(): number {
    return this.unconfirmedCodes.length;
  }

  /**
   * De lo escaneado en este lote, cuánto está realmente confirmado por el servidor.
   * Reemplaza al viejo contador `sentCount` en la UI: este NO cuenta de más por
   * reintentos ni reenvíos, y baja a la realidad si una lectura no llegó al inventario.
   */
  get confirmedScannedCount(): number {
    return this.scannedCodes.filter((c) => this.sentBarcodes.has(c)).length;
  }

  constructor() {}

  ngOnInit(): void {
    this.loadArea();
    this.loadSentBarcodes();
    this.loadQueue();
    this.loadSession();

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onlineHandler);
      window.addEventListener('offline', this.offlineHandler);
      window.addEventListener('focus', this.focusHandler);

      // Red de seguridad: el evento 'online' no siempre es fiable en la bodega.
      this.retryTimer = setInterval(() => {
        if (this.pendingCount > 0 && navigator.onLine && !this.flushing) {
          this.flushQueue();
        }
      }, 60000);
    }

    if (this.online && this.pendingCount > 0) {
      this.flushQueue();
    }
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onlineHandler);
      window.removeEventListener('offline', this.offlineHandler);
      window.removeEventListener('focus', this.focusHandler);
    }
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }

  openUserModal(content: any) {
    const modalRef = this.modalService.open(content, { centered: true, backdrop: 'static', size: 'md' });

    // esperar un momento y luego enfocar el input del modal
    setTimeout(() => {
      const el = document.getElementById('modalArea') as HTMLInputElement | null;
      if (el) el.focus();
    }, 150);

    // Opcional: manejar resultado si quieres
    modalRef.result.then(
      (res) => {
        /* cerrado con resultado */
      },
      (reason) => {
        /* dismissed */
      }
    );
  }

  saveUserInfo(modal: any, userForm: any) {
    if (!this.inventoryArea.trim()) {
      this.statusMessage = 'Ingrese el Área antes de guardar.';
      return;
    }

    if (!this.currentUserName) {
      this.statusMessage = 'No se pudo obtener el usuario del token. Vuelva a iniciar sesión.';
      return;
    }

    // Normaliza y PERSISTE el Área: este es "el último que el usuario ingresó" y es el
    // que se reutiliza tras recargar la página (ver loadArea()). Se puede volver a
    // cambiar en cualquier momento reabriendo este mismo modal.
    this.inventoryArea = this.inventoryArea.trim();
    this.persistArea();
    this.missingAreaAlerted = false;

    this.statusMessage = `Usuario guardado: ${this.currentUserName} - Área: ${this.inventoryArea}`;
    modal.close('saved');
  }

  private mapStorageItemToProduct(item: StorageItem): Product {
    return {
      EAN: item.EAN ?? '',
      productCode: item.productCode ?? '',
      productName: item.productName ?? 'Sin nombre',
      reference: item.reference ?? '',
      barcode: item.barcode ?? '',
      consecutivo: item.consecutivo ?? ''
    };
  }

  private fetchProductInfo(barcode: string) {
    if (this.loading) {
      this.statusMessage = 'Espere, consulta en curso...';
      return;
    }

    this.loading = true;
    this.statusMessage = 'Consultando producto...';

    this.dashService
      .getStorage({ barcode })
      .pipe(
        finalize(() => {
          this.loading = false;
        })
      )
      .subscribe({
        next: (resp: any) => {
          if (!resp || resp.ok !== true) {
            this.statusMessage = 'Respuesta inválida del servidor.';
            return;
          }

          const data = resp.msg;
          if (!Array.isArray(data) || data.length === 0) {
            this.statusMessage = 'No se encontró información para el código proporcionado.';
            return;
          }

          // fetchProductInfo() solo se invoca para referencias de palet (ver readBarcode()):
          // las individuales se registran directo en la cola, sin consultar el backend aquí.
          const product = this.mapStorageItemToProduct(data[0]);
          this.tryAddToPallet(product);
        },
        error: (err) => {
          console.error('Error al consultar getStorage:', err);
          this.statusMessage = err?.message ? `Error: ${err.message}` : 'Error al consultar el backend.';
        }
      });
  }

  /**
   * Intenta agregar un producto al palet en curso (modo Regleta). Reglas estrictas:
   * - Las PALLET_SIZE (10) unidades deben ser de la MISMA referencia (productCode). Se puede
   *   leer en cualquier orden, pero un código de otra referencia se rechaza sin tocar el palet.
   * - Los consecutivos deben terminar formando un rango contiguo de EXACTAMENTE 10 números
   *   (sin huecos, sin repetidos, sin sobrantes): un código que ensancharía el rango actual
   *   a más de 10 posiciones se rechaza de inmediato, para detectar el error de lectura ahí
   *   mismo en vez de dejar "completar" 10 unidades sueltas que no correspondan a un mismo palet.
   * - Con el palet ya completo (10/10) no se aceptan más lecturas hasta enviarlo o limpiarlo.
   */
  private tryAddToPallet(product: Product): void {
    if (this.regletaProducts.length >= InventoryReader.PALLET_SIZE) {
      this.statusMessage = `El palet ya tiene los ${InventoryReader.PALLET_SIZE} códigos completos. Envíelo o presione "Limpiar" antes de escanear el siguiente.`;
      return;
    }

    const alreadyScanned = this.regletaProducts.some((r) => r.barcode === product.barcode || r.consecutivo === product.consecutivo);
    if (alreadyScanned) {
      this.statusMessage = 'Este código ya fue escaneado en el palet actual.';
      return;
    }

    if (this.regletaProducts.length > 0 && this.regletaProducts[0].productCode !== product.productCode) {
      this.statusMessage = `Referencia distinta: el palet en curso es "${this.regletaProducts[0].productCode}" y este código es "${product.productCode}". Las ${InventoryReader.PALLET_SIZE} unidades deben ser de la misma referencia.`;
      return;
    }

    const newNum = parseInt(product.consecutivo, 10);
    if (isNaN(newNum)) {
      this.statusMessage = 'No se pudo interpretar el consecutivo de este código. Vuelva a escanearlo.';
      return;
    }

    const existingNums = this.regletaProducts.map((r) => parseInt(r.consecutivo, 10)).filter((n) => !isNaN(n));
    const allNums = [...existingNums, newNum];
    const span = Math.max(...allNums) - Math.min(...allNums) + 1;
    if (span > InventoryReader.PALLET_SIZE) {
      this.statusMessage = `Este consecutivo (${product.consecutivo}) no es consecutivo con el palet en curso (rango actual ${Math.min(...existingNums)}–${Math.max(...existingNums)}). Verifique que sea del mismo palet.`;
      return;
    }

    this.regletaProducts.push(product);

    this.statusMessage =
      this.regletaProducts.length === InventoryReader.PALLET_SIZE
        ? `✔ Palet completo (${InventoryReader.PALLET_SIZE}/${InventoryReader.PALLET_SIZE}) — referencia ${product.productCode}. Ya puede enviarlo al inventario.`
        : `Palet en progreso: ${this.regletaProducts.length}/${InventoryReader.PALLET_SIZE} — referencia ${product.productCode}.`;
  }

  clearData() {
    this.barcodeInput = '';
    this.scannedCodes = [];
    this.sentCount = 0;
    this.currentProduct = null;
    this.regletaProducts = [];
    // IMPORTANTE: "Limpiar" NO borra la cola de lecturas pendientes (this.pendingQueue).
    // Esos datos solo salen de la cola cuando se cargan al servidor o se eliminan uno a uno.
    // Sí reinicia el contador de "Escaneados / Enviados" del lote: es la forma explícita
    // que tiene el usuario de decir "empiezo a contar un lote nuevo".
    this.persistSession();
    // opcional: NO limpiar el Área aquí si quieres mantenerla
    // this.inventoryArea = '';
    this.statusMessage = 'Datos limpiados (la cola de pendientes se conserva)';
  }

  onKeyPress(event: KeyboardEvent) {
    // Las pistolas suelen terminar con 'Enter'
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation(); // Evita que el evento suba

      // Pequeño delay para asegurar que el ngModel capturó el último carácter
      setTimeout(() => {
        this.readBarcode();
      }, 50);
      return;
    }

    // OPCIONAL: Lógica de seguridad para móviles
    // Si el usuario deja de "escribir" (la pistola deja de mandar datos)
    // por más de 300ms, intentamos leer.
    if (this.scanTimer) clearTimeout(this.scanTimer);

    this.scanTimer = setTimeout(() => {
      const currentCode = (this.barcodeInput || '').trim();
      // Si tiene una longitud mínima razonable (ej. 10 para tus códigos de 20+)
      if (currentCode.length >= 10) {
        this.readBarcode();
      }
    }, 300); // 300ms es un tiempo seguro para esperar la ráfaga de la pistola
  }

  // onBarcodeChange(value: string) {
  //   if (value && value.length >= 8) {
  //     setTimeout(() => this.readBarcode(), 100);
  //   }
  // }

  readBarcode() {
    const code = (this.barcodeInput || '').trim();

    if (!code) return;

    // Si ya estamos procesando, evitamos duplicar la petición
    if (this.loading) return;

    // Validación: si el código está incompleto (ej. menos de 10 caracteres) no enviamos
    // Ajusta este número según el largo mínimo de tus códigos reales
    if (code.length < 5) {
      console.warn('Código demasiado corto, posible lectura errónea');
      return;
    }

    if (!/^\d+$/.test(code)) {
      this.statusMessage = 'El código debe contener solo números.';
      // No limpiamos el input inmediatamente para que el usuario vea qué falló
      return;
    }

    // Validación de longitud: todo barcode de Indusel tiene EXACTAMENTE 27 dígitos
    // (codRef en las posiciones 10-16, consecutivo en 18-27; ver seeSearchReferenceStorageDAO
    // en el backend). Si la pistola/lector entregó menos o más, la lectura quedó incompleta
    // o corrupta: se alerta y se descarta para que el usuario vuelva a escanear el producto
    // en vez de dejarlo pasar y que falle más adelante (producto no encontrado / sync fallida).
    if (code.length !== InventoryReader.BARCODE_LENGTH) {
      this.serverSuccess = false;
      this.serverResponse = null;
      this.duplicateBarcode = null;
      this.statusMessage = `Lectura incorrecta: el código tiene ${code.length} dígito(s) y debe tener ${InventoryReader.BARCODE_LENGTH}. Vuelva a escanear el producto.`;
      this.barcodeInput = '';
      this.refocusBarcodeInput();
      return;
    }

    // Validación de prefijo EAN-128: aunque tenga los 27 dígitos, todo serial de Indusel
    // empieza EXACTAMENTE por BARCODE_PREFIX (AI 01 + GTIN 0·7706060) seguido de los 6
    // dígitos de la referencia. Un código de 27 dígitos que arranca distinto (p. ej.
    // `0121316060…`) es de otra empresa o lo decodificó mal la pistola: se alerta y se
    // descarta para que el operario vuelva a escanear, en vez de dejarlo pasar y que falle
    // luego (producto no encontrado / referencia que no cruza).
    if (!code.startsWith(InventoryReader.BARCODE_PREFIX)) {
      this.serverSuccess = false;
      this.serverResponse = null;
      this.duplicateBarcode = null;
      this.statusMessage = `Lectura incorrecta: el código no es un serial de Indusel (debe iniciar con ${InventoryReader.BARCODE_PREFIX} seguido de los 6 dígitos de la referencia). Vuelva a escanear el producto.`;
      this.barcodeInput = '';
      this.refocusBarcodeInput();
      return;
    }

    // Código válido: si había una alerta de lectura incorrecta previa, se limpia.
    this.serverSuccess = null;
    this.serverResponse = null;
    this.duplicateBarcode = null;

    // Limpiar temporizadores activos
    if (this.scanTimer) clearTimeout(this.scanTimer);

    // Detección automática (sin pedirle nada al operario): la referencia embebida en el
    // propio código dice si esa unidad va en palet de 10 (antes "Regleta") o se registra
    // de inmediato en la cola individual (antes "Lectura Simple"). Ver PALLET_REFERENCES.
    const reference = this.extractReference(code);
    const isPalletReference = InventoryReader.PALLET_REFERENCES.has(reference);
    this.lastDetectedMode = isPalletReference ? 'palet' : 'individual';
    this.lastDetectedReference = reference;

    if (isPalletReference) {
      // Palet: la validación de referencia única + consecutivos contiguos ocurre en
      // tryAddToPallet(), una vez resuelto el producto.
      this.fetchProductInfo(code);
    } else {
      // Individual: NO se envía al servidor de inmediato. Se guarda en la cola local
      // (offline-first) y se sube cuando haya conexión.
      //
      // El código solo se cuenta como "Escaneado" si REALMENTE entró a la cola. Si
      // enqueueReading() aborta (típicamente porque el Área quedó vacía tras recargar
      // la página), la lectura NO se registra: así el contador deja de mentir — antes
      // marcaba p. ej. "373 escaneados / 156 enviados" con 217 lecturas perdidas.
      const queued = this.enqueueReading(code);
      if (queued && !this.scannedCodes.includes(code)) {
        // Más reciente primero, para verlo sin desplazar la pantalla (igual que en barcode-reader.ts).
        this.scannedCodes.unshift(code);
        this.persistSession();
      }
    }

    // Limpieza importante
    this.barcodeInput = '';
  }

  private extractReference(code: string): string {
    return code.substring(InventoryReader.REF_START, InventoryReader.REF_START + InventoryReader.REF_LEN);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  Cola offline-first (SOLO modo simple)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Añade una lectura a la cola local y la persiste de inmediato (no se puede perder).
   * Devuelve `true` solo si la lectura quedó realmente en la cola (o ya estaba): el
   * llamador usa eso para NO contar como "Escaneado" algo que en realidad se descartó.
   */
  private enqueueReading(code: string): boolean {
    if (!this.inventoryArea.trim()) {
      // Sin Área NO se puede encolar. Se avisa de forma imposible de ignorar (caja roja
      // + un alert la primera vez) para que el operario no siga escaneando "al vacío":
      // ese era el origen de "373 escaneados / 156 enviados" con lecturas perdidas.
      this.serverSuccess = false;
      this.serverResponse = null;
      this.duplicateBarcode = null;
      this.statusMessage =
        '⚠ NO HAY ÁREA CONFIGURADA: la lectura NO se guardó. Abra "Usuario Inventario", ingrese el Área y vuelva a escanear.';
      this.notifyMissingAreaOnce();
      this.barcodeInput = '';
      this.refocusBarcodeInput();
      return false;
    }
    if (!this.currentUserName) {
      this.statusMessage = 'No se pudo obtener el usuario del token. Vuelva a iniciar sesión.';
      return false;
    }

    const area = this.inventoryArea.trim();
    const alreadyQueued = this.pendingQueue.some((i) => i.barcode === code && i.area === area && i.status !== 'error');
    if (alreadyQueued) {
      this.statusMessage = `El código ${code} ya está en la cola pendiente.`;
      this.barcodeInput = '';
      this.refocusBarcodeInput();
      return true;
    }

    const item: PendingReading = {
      id: this.newId(),
      barcode: code,
      area,
      operatorName: this.currentUserName,
      operatorId: this.currentUserId,
      createdAt: new Date().toISOString(),
      attempts: 0,
      status: 'pending'
    };
    this.pendingQueue.push(item);
    this.persistQueue();

    this.statusMessage = this.online
      ? `Lectura #${this.pendingQueue.length} guardada. Sincronizando...`
      : `Lectura #${this.pendingQueue.length} guardada SIN conexión. Se enviará al recuperar la red.`;

    // Mantener el cursor en el campo para escanear seguido (pistola / tablet / móvil).
    this.refocusBarcodeInput();

    if (this.online && !this.flushing) {
      this.flushQueue();
    }

    return true;
  }

  /** Botón "Cargar al servidor": intenta vaciar la cola manualmente. */
  onUploadClick(): void {
    if (this.pendingCount === 0) {
      this.statusMessage = 'No hay lecturas pendientes por cargar.';
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.online = false;
      this.statusMessage = 'Sin conexión. Las lecturas quedan guardadas y se enviarán al recuperar la red.';
      return;
    }
    this.flushQueue(true);
  }

  /**
   * Botón "Reenviar lecturas sin confirmar". Reencola cada código de `scannedCodes` que
   * el servidor NO confirmó (ver `unconfirmedCodes`) y que no esté ya en la cola, y
   * dispara el envío. Los códigos que ya existan en el inventario los descarta el backend
   * como duplicados (ver `classifyQueueError`), así que es seguro re-ejecutarlo.
   *
   * Sirve para recuperar lecturas perdidas por escanear con el Área vacía. En una tablet
   * sin registro previo (`sentBarcodes` vacío) reenvía TODO lo escaneado y deja que el
   * backend deduplique; a partir de ahí `sentBarcodes` queda poblado y el conteo es exacto.
   */
  resyncUnconfirmed(): void {
    const missing = this.unconfirmedCodes;
    if (missing.length === 0) {
      this.statusMessage = 'No hay lecturas sin confirmar: todo lo escaneado ya está en el servidor o en la cola.';
      return;
    }
    if (!this.inventoryArea.trim()) {
      this.serverSuccess = false;
      this.serverResponse = null;
      this.duplicateBarcode = null;
      this.statusMessage = '⚠ Configure primero el Área (botón "Usuario Inventario"): debe ser la misma de estas lecturas.';
      this.notifyMissingAreaOnce();
      return;
    }
    if (!this.currentUserName) {
      this.statusMessage = 'No se pudo obtener el usuario del token. Vuelva a iniciar sesión.';
      return;
    }

    const area = this.inventoryArea.trim();
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Se reenviarán ${missing.length} lectura(s) escaneada(s) que el servidor no ha confirmado.\n\n` +
          `Área: ${area}\n\n` +
          `Los códigos que ya estén en el inventario se descartan como duplicados. ¿Continuar?`
      )
    ) {
      return;
    }

    for (const code of missing) {
      this.pendingQueue.push({
        id: this.newId(),
        barcode: code,
        area,
        operatorName: this.currentUserName,
        operatorId: this.currentUserId,
        createdAt: new Date().toISOString(),
        attempts: 0,
        status: 'pending'
      });
    }
    this.persistQueue();
    this.statusMessage = `${missing.length} lectura(s) sin confirmar reencolada(s). Enviando al servidor...`;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.online = false;
      this.statusMessage = 'Sin conexión: las lecturas quedaron en la cola y se enviarán al recuperar la red.';
      return;
    }
    this.flushQueue(true);
  }

  /**
   * Recorre la cola enviando cada lectura pendiente / con error transitorio.
   * @param notifyUser Solo debe ser `true` cuando lo dispara el botón "Cargar al
   * servidor" (acción explícita). Al terminar, avisa con una alerta cuántos productos
   * se enviaron y, si no queda nada pendiente, limpia el listado de códigos escaneados
   * para dejar la pantalla lista para el siguiente lote. Los flushes automáticos
   * (reconexión, temporizador de reintento, cambio de foco) NO deben alertar: eso
   * interrumpiría al usuario a mitad de un escaneo con la pistola.
   */
  async flushQueue(notifyUser: boolean = false): Promise<void> {
    if (this.flushing) return;

    const targets = this.pendingQueue.filter((i) => i.status === 'pending' || (i.status === 'error' && i.errorKind === 'transient'));
    if (targets.length === 0) return;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.online = false;
      this.statusMessage = 'Sin conexión. Los pendientes se enviarán automáticamente al recuperar la red.';
      return;
    }

    this.flushing = true;
    this.online = true;
    let sent = 0;
    let failed = 0;

    for (const item of targets) {
      if (item.status === 'sending') continue;
      const ok = await this.sendQueueItem(item);
      if (ok) {
        sent++;
        // Contador del lote (sobrevive a que el envío haya sido automático, uno por
        // escaneo, y no solo al hacer clic en "Cargar al servidor").
        this.sentCount++;
      } else {
        failed++;
      }
      this.persistQueue();
    }
    this.persistSession();

    this.flushing = false;

    const remaining = this.pendingCount;
    this.lastSyncMessage =
      failed === 0
        ? `✔ ${sent} lectura(s) cargada(s) al servidor.`
        : `${sent} enviada(s), ${failed} sin enviar. Quedan ${remaining} pendiente(s).`;
    this.lastSyncKind = failed === 0 ? 'success' : 'warning';
    this.statusMessage = this.lastSyncMessage;

    // Cargue explícito ("Cargar al servidor"): notificar el total del LOTE (escaneados vs.
    // confirmados en el servidor), no solo lo que envió esta pasada puntual — la mayoría de
    // las lecturas ya se auto-enviaron una a una al momento de escanear. Si no quedó nada
    // pendiente, se considera cerrado el lote y se reinicia el contador para el siguiente.
    if (notifyUser) {
      // Verdad POR-CÓDIGO (no el acumulador `sentCount`, que suma reintentos y reenvíos):
      // de lo escaneado en el lote, cuánto está hoy confirmado en el servidor.
      const scannedTotal = this.scannedCodes.length;
      const confirmedTotal = this.scannedCodes.filter((c) => this.sentBarcodes.has(c)).length;
      let alertMsg: string;

      if (sent === 0 && failed > 0) {
        alertMsg = `No se pudo enviar ningún registro (${failed} con error). Revise la conexión e intente de nuevo.`;
      } else if (remaining === 0) {
        alertMsg = `✔ ${confirmedTotal} de ${scannedTotal} lectura(s) escaneada(s) confirmadas en el inventario.`;
        this.scannedCodes = [];
        this.sentCount = 0;
        this.persistSession();
      } else {
        alertMsg = `${confirmedTotal} de ${scannedTotal} lectura(s) confirmada(s). ${failed} no se pudieron enviar y quedan pendientes de revisión.`;
      }

      if (typeof window !== 'undefined') {
        window.alert(alertMsg);
      }
    }

    // Si se envió algo y entraron lecturas nuevas durante el proceso, reintenta una vez.
    if (sent > 0 && this.pendingQueue.some((i) => i.status === 'pending') && typeof navigator !== 'undefined' && navigator.onLine) {
      setTimeout(() => this.flushQueue(), 0);
    }

    this.refocusBarcodeInput();
  }

  /** Envía una lectura: resuelve el producto (getStorage) y luego lo inserta. */
  private async sendQueueItem(item: PendingReading): Promise<boolean> {
    item.status = 'sending';
    item.attempts++;
    item.lastError = undefined;
    this.persistQueue();

    try {
      // 1. Resolver el producto si aún no se tiene (requiere red).
      // Se usa getStorageQueued (NO getStorage): necesitamos el HttpErrorResponse crudo
      // para que classifyQueueError pueda distinguir un rechazo real del backend (ej.
      // barcode con longitud inválida -> permanente) de una falla de red (transitoria).
      let product = item.product;
      if (!product) {
        const resp = await firstValueFrom(this.dashService.getStorageQueued({ barcode: item.barcode }));
        if (!resp || resp.ok !== true || !Array.isArray(resp.msg) || resp.msg.length === 0) {
          item.status = 'error';
          item.errorKind = 'permanent';
          item.lastError = 'No se encontró el producto para este código.';
          return false;
        }
        product = this.mapStorageItemToProduct(resp.msg[0]);
        item.product = product;
      }

      // 2. Insertar en inventario (endpoint sin transformación de error).
      const payload = this.buildInsertPayload([product], {
        area: item.area,
        operatorName: item.operatorName,
        operatorId: item.operatorId
      });
      const insert = await firstValueFrom(this.dashService.insertInventoryQueued(payload));

      if (insert && insert.ok === true) {
        this.markBarcodeSent(item.barcode);
        this.removeFromQueue(item.id);
        return true;
      }

      // 2xx con ok:false (poco habitual): rechazo permanente.
      item.status = 'error';
      item.errorKind = 'permanent';
      item.lastError = insert?.msg || 'El servidor rechazó el registro.';
      return false;
    } catch (err) {
      return this.classifyQueueError(item, err);
    }
  }

  /** Clasifica el fallo: duplicado (ya está), validación (revisar) o transitorio (reintentar). */
  private classifyQueueError(item: PendingReading, err: unknown): boolean {
    const httpErr = (err ?? {}) as {
      status?: number;
      error?: { msg?: string; duplicateBarcode?: string; validationError?: boolean };
    };
    const status = httpErr.status;
    const body = httpErr.error;

    // Duplicado: ya existe en el servidor. No es pérdida de datos -> sale de la cola.
    if (status === 409 || body?.duplicateBarcode || /duplicad/i.test(body?.msg || '')) {
      this.markBarcodeSent(item.barcode);
      this.removeFromQueue(item.id);
      this.statusMessage = `El código ${item.barcode} ya estaba registrado en el servidor (duplicado).`;
      return true;
    }

    // Validación (código mal formado, referencia que no coincide...): no se arregla reintentando.
    if (status === 400 || body?.validationError === true) {
      item.status = 'error';
      item.errorKind = 'permanent';
      item.lastError = body?.msg || 'El servidor rechazó el código (validación).';
      return false;
    }

    // Sin conexión / timeout / 5xx: transitorio -> se conserva y se reintenta.
    item.status = 'error';
    item.errorKind = 'transient';
    item.lastError = status === 0 || status === undefined ? 'Sin conexión con el servidor.' : `Error temporal del servidor (${status}).`;
    return false;
  }

  /** Reintento manual de una lectura marcada con error. */
  retryItem(item: PendingReading): void {
    item.status = 'pending';
    item.errorKind = undefined;
    item.lastError = undefined;
    this.persistQueue();
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      this.flushQueue();
    } else {
      this.statusMessage = 'Sin conexión. Se reintentará al recuperar la red.';
    }
  }

  /** Elimina una lectura de la cola (solo con confirmación explícita). */
  removeItem(item: PendingReading): void {
    const label = item.product?.productName ? `${item.product.productName} (${item.barcode})` : item.barcode;
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`¿Eliminar esta lectura de la cola?\n\n${label}\n\nEsta acción no se puede deshacer.`)
    ) {
      return;
    }
    this.removeFromQueue(item.id);
    this.statusMessage = 'Lectura eliminada de la cola.';
  }

  private removeFromQueue(id: string): void {
    this.pendingQueue = this.pendingQueue.filter((i) => i.id !== id);
    this.persistQueue();
  }

  private onConnectivityChange(isOnline: boolean): void {
    this.online = isOnline;
    if (isOnline) {
      this.statusMessage = 'Conexión recuperada. Sincronizando lecturas pendientes...';
      this.flushQueue();
    } else {
      this.statusMessage = 'Sin conexión. Las lecturas se guardan localmente y se enviarán al recuperar la red.';
    }
  }

  private loadQueue(): void {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(this.QUEUE_KEY) : null;
      const parsed = raw ? JSON.parse(raw) : [];
      this.pendingQueue = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('No se pudo leer la cola local de inventario:', e);
      this.pendingQueue = [];
    }

    // Un 'sending' persistido = se recargó a mitad de envío: vuelve a 'pending'.
    let changed = false;
    for (const item of this.pendingQueue) {
      if (item.status === 'sending') {
        item.status = 'pending';
        changed = true;
      }
    }
    if (changed) this.persistQueue();
  }

  private persistQueue(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.QUEUE_KEY, JSON.stringify(this.pendingQueue));
      }
    } catch (e) {
      console.error('No se pudo guardar la cola local de inventario:', e);
      this.statusMessage = '⚠ No se pudo guardar la lectura localmente (almacenamiento lleno). Sincronice cuanto antes.';
    }
  }

  /** Persiste el contador del lote actual (escaneados / enviados) para no perderlo si se recarga la página. */
  private persistSession(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.SESSION_KEY, JSON.stringify({ scannedCodes: this.scannedCodes, sentCount: this.sentCount }));
      }
    } catch (e) {
      console.error('No se pudo guardar el contador de sesión de inventario:', e);
    }
  }

  private loadSession(): void {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(this.SESSION_KEY) : null;
      const parsed = raw ? JSON.parse(raw) : null;
      this.scannedCodes = Array.isArray(parsed?.scannedCodes) ? parsed.scannedCodes : [];
      this.sentCount = typeof parsed?.sentCount === 'number' ? parsed.sentCount : 0;
    } catch (e) {
      console.error('No se pudo leer el contador de sesión de inventario:', e);
      this.scannedCodes = [];
      this.sentCount = 0;
    }
  }

  /** Reutiliza el Área de la sesión anterior tras recargar la página (ver AREA_KEY). */
  private loadArea(): void {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(this.AREA_KEY) : null;
      if (raw && raw.trim()) {
        this.inventoryArea = raw.trim();
        this.statusMessage = `Área recuperada: ${this.inventoryArea}. Puede cambiarla en "Usuario Inventario".`;
      }
    } catch (e) {
      console.error('No se pudo leer el Área guardada:', e);
    }
  }

  /** Carga el registro por-código de lo ya confirmado por el servidor (ver SENT_KEY). */
  private loadSentBarcodes(): void {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(this.SENT_KEY) : null;
      const parsed = raw ? JSON.parse(raw) : [];
      this.sentBarcodes = new Set(Array.isArray(parsed) ? parsed : []);
    } catch (e) {
      console.error('No se pudo leer los códigos confirmados de inventario:', e);
      this.sentBarcodes = new Set();
    }
  }

  /** Marca un código como confirmado por el servidor y lo persiste de inmediato. */
  private markBarcodeSent(barcode: string): void {
    if (!barcode || this.sentBarcodes.has(barcode)) return;
    this.sentBarcodes.add(barcode);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.SENT_KEY, JSON.stringify([...this.sentBarcodes]));
      }
    } catch (e) {
      console.error('No se pudo guardar los códigos confirmados de inventario:', e);
    }
  }

  /** Guarda el Área en curso (o la borra del almacenamiento si quedó vacía). */
  private persistArea(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const value = this.inventoryArea.trim();
      if (value) {
        localStorage.setItem(this.AREA_KEY, value);
      } else {
        localStorage.removeItem(this.AREA_KEY);
      }
    } catch (e) {
      console.error('No se pudo guardar el Área:', e);
    }
  }

  /**
   * Alerta bloqueante la PRIMERA vez que se intenta escanear sin Área configurada. No
   * se repite en cada lectura para no atrapar al operario en un bucle de `alert()` si
   * sigue disparando la pistola; la caja roja de estado sí se actualiza en cada intento.
   */
  private notifyMissingAreaOnce(): void {
    if (this.missingAreaAlerted || typeof window === 'undefined') return;
    this.missingAreaAlerted = true;
    window.alert(
      'NO HAY ÁREA CONFIGURADA.\n\n' +
        'Las lecturas NO se están guardando. Presione "Usuario Inventario", ingrese el Área y continúe escaneando.'
    );
  }

  private newId(): string {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
    } catch {
      /* sin crypto: se usa el fallback */
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  /** Devuelve el foco al campo de código para poder escanear seguido sin tocar la pantalla. */
  private refocusBarcodeInput(): void {
    if (typeof document === 'undefined') return;
    setTimeout(() => {
      const el = document.getElementById('codigoBarras') as HTMLInputElement | null;
      el?.focus();
    }, 30);
  }

  /**
   * Limpia el Área del inventario (los datos de la persona salen del token, no se limpian).
   * Si se recibe la referencia al formulario (NgForm), lo resetea visualmente.
   */
  clearUserFields(userForm?: NgForm) {
    this.inventoryArea = '';
    this.persistArea();
    this.missingAreaAlerted = false;
    this.statusMessage = 'Área limpiada';

    // Si se pasa el NgForm desde el template, reseteará también su estado (touched/pristine)
    try {
      if (userForm) {
        userForm.resetForm({ modalArea: '' });
      }
    } catch (err) {
      // no crítico si falla; sólo un intento de reset visual
      console.warn('No se pudo resetear el formulario del modal:', err);
    }
  }

  /**
   * Construye el payload que espera el backend para insertar en inventario.
   * Si hay varios productos (regleta) toma el nombre/referencia/codRef del primer producto.
   * `staff` permite usar el área / operario capturados al momento del escaneo (cola offline);
   * si no se pasa, usa los valores actuales del formulario (modo regleta).
   */
  private buildInsertPayload(productsToRegister: Product[], staff?: { area: string; operatorName: string; operatorId: string }) {
    // Asegurar valores únicos y no vacíos
    const barcodes = Array.from(new Set(productsToRegister.map((p) => (p.barcode || '').trim()).filter((b) => !!b)));
    const consecutives = Array.from(new Set(productsToRegister.map((p) => (p.consecutivo || '').trim()).filter((c) => !!c)));

    const firstProduct = productsToRegister.length > 0 ? productsToRegister[0] : null;

    return {
      inventoryStaff: {
        area: (staff?.area ?? this.inventoryArea).trim(),
        persons: [
          {
            // Identidad tomada del token: nombre completo + identificador único (uid / userApp).
            Person1: staff?.operatorName ?? this.currentUserName,
            Person2: staff?.operatorId ?? this.currentUserId
          }
        ]
      },
      inventory: {
        barcode: barcodes, // array de códigos de barras
        producto: firstProduct?.productName || '',
        referencia: firstProduct?.reference || '',
        codRef: firstProduct?.productCode || '',
        consecutive: consecutives, // array de consecutivos
        validate: true
      }
    };
  }

  /**
   * Envía al backend los productos seleccionados junto con los datos de usuario (área / nombres).
   */

  /** Botón "Registrar Palet al Inventario" (validación de palet de 10 — antes "Regleta"). */
  registerInventory() {
    if (!this.inventoryArea.trim()) {
      this.statusMessage = 'Ingrese el Área antes de registrar.';
      return;
    }

    if (!this.currentUserName) {
      this.statusMessage = 'No se pudo obtener el usuario del token. Vuelva a iniciar sesión.';
      return;
    }

    const productsToRegister: Product[] = this.regletaProducts;

    if (!productsToRegister || productsToRegister.length === 0) {
      this.statusMessage = 'No hay productos para registrar.';
      return;
    }

    // Envío bloqueado hasta completar EXACTAMENTE el palet (nunca 9, nunca 11): la validación
    // de referencia única y consecutivos contiguos ya ocurrió al escanear (tryAddToPallet), así
    // que llegar aquí con longitud distinta a PALLET_SIZE solo puede significar palet incompleto.
    if (productsToRegister.length !== InventoryReader.PALLET_SIZE) {
      this.statusMessage = `El palet debe tener exactamente ${InventoryReader.PALLET_SIZE} unidades antes de enviar (lleva ${productsToRegister.length}/${InventoryReader.PALLET_SIZE}). Complete la lectura o presione "Limpiar" para descartar este palet.`;
      return;
    }

    if (this.loading) {
      this.statusMessage = 'Espere, ya se está procesando otra petición...';
      return;
    }

    const payload = this.buildInsertPayload(productsToRegister);

    if (
      (!payload.inventory.barcode || payload.inventory.barcode.length === 0) &&
      (!payload.inventory.consecutive || payload.inventory.consecutive.length === 0)
    ) {
      this.statusMessage = 'Los productos no tienen códigos válidos para registrar.';
      return;
    }

    // preparar UI
    this.loading = true;
    this.statusMessage = 'Registrando en inventario...';
    this.serverResponse = null;
    this.duplicateBarcode = null;
    this.serverSuccess = null;

    this.dashService
      .getInsertInventory(payload)
      .pipe(
        finalize(() => {
          this.loading = false;
        })
      )
      .subscribe({
        next: (resp: any) => {
          this.serverResponse = resp;

          if (resp && resp.ok === true) {
            this.serverSuccess = true;
            this.statusMessage = resp.msg || 'Registrado correctamente en el inventario.';

            // limpiar productos (mantener usuario)
            this.currentProduct = null;
            this.regletaProducts = [];
            this.scannedCodes = [];

            setTimeout(() => document.getElementById('codigoBarras')?.focus(), 50);
          } else {
            // error del backend (ok === false)
            this.serverSuccess = false;
            this.statusMessage = resp?.msg || 'Error al registrar en el inventario.';
            this.duplicateBarcode = resp?.duplicateBarcode ?? null;
          }
        },
        error: (err) => {
          console.error('Error al insertar inventario:', err);
          this.serverSuccess = false;
          this.serverResponse = err;
          this.duplicateBarcode = null;
          this.statusMessage = err?.message ? `Error: ${err.message}` : 'Error al registrar inventario.';
        }
      });
  }

  /**
   * Añade el barcode duplicado a scannedCodes si no existe.
   */
  addDuplicateToScanned(barcode: string | null) {
    if (!barcode) {
      this.statusMessage = 'Barcode inválido.';
      return;
    }
    if (!this.scannedCodes.includes(barcode)) {
      this.scannedCodes.unshift(barcode);
      this.statusMessage = 'Barcode duplicado añadido a escaneados.';
    } else {
      this.statusMessage = 'El barcode ya está en la lista de escaneados.';
    }
    setTimeout(() => document.getElementById('codigoBarras')?.focus(), 50);
  }

  /**
   * Copia texto al portapapeles (usa navigator.clipboard si está disponible).
   */
  copyToClipboard(text: string | null) {
    if (!text) {
      this.statusMessage = 'Nada para copiar.';
      return;
    }

    if (navigator && typeof navigator.clipboard?.writeText === 'function') {
      navigator.clipboard.writeText(text).then(
        () => {
          this.statusMessage = 'Código copiado al portapapeles.';
        },
        (err) => {
          this.statusMessage = 'No se pudo copiar al portapapeles.';
          console.error(err);
        }
      );
    } else {
      // fallback
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        this.statusMessage = 'Código copiado (fallback).';
      } catch (err) {
        this.statusMessage = 'No se pudo copiar (fallback).';
        console.error(err);
      }
    }
  }

  private handleError(error: HttpErrorResponse) {
    console.error('DashInventoryServices: Error en la petición:', error);

    // 1. Revisa si el backend envió un objeto de error {ok, msg, ...}
    //    Esto es lo que ves en tu Imagen 2 (DevTools)
    if (error.error && typeof error.error === 'object' && error.error.msg) {
      // Devuelve el objeto de error del backend
      return throwError(() => error.error);
    }

    // 2. Si no, crea un objeto de error genérico que coincida con la interfaz
    //    Esto cubrirá errores de red, 500, etc.
    const genericErrorMessage = `Error ${error.status}: ${error.statusText}. Por favor, contacte a soporte.`;

    return throwError(() => ({
      ok: false,
      msg: genericErrorMessage,
      validationError: false // o la propiedad que necesites
    }));
  }
}
