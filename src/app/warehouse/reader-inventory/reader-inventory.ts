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

  private dashService = inject(DashInventoryServices);
  private modalService = inject(NgbModal);
  private authService = inject(AuthService);

  // Modo de lectura
  readingMode: 'simple' | 'regleta' = 'simple';

  // Código de barras actual
  barcodeInput: string = '';
  private scanTimer: any;

  // Lista de códigos leídos
  scannedCodes: string[] = [];

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

  // ─────────────────────────────────────────────────────────────────────────────
  //  Cola offline-first (SOLO modo simple; regleta no se toca)
  // ─────────────────────────────────────────────────────────────────────────────
  private readonly QUEUE_KEY = 'inventory-reader.pending-queue.v1';

  /** Lecturas de modo simple retenidas hasta poder cargarlas al servidor. */
  pendingQueue: PendingReading[] = [];

  /** true mientras se está vaciando la cola (evita envíos concurrentes). */
  flushing = false;

  /** Estado de conectividad del navegador (para la UI y los reintentos). */
  online: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;

  /** Resumen del último intento de sincronización. */
  lastSyncMessage = '';

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

  /** Lecturas rechazadas por el servidor que requieren revisión manual. */
  get errorCount(): number {
    return this.pendingQueue.filter((i) => i.status === 'error' && i.errorKind === 'permanent').length;
  }

  constructor() {}

  ngOnInit(): void {
    this.loadQueue();

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

  onModeChange(mode: 'simple' | 'regleta') {
    this.readingMode = mode;
    this.statusMessage = `Modo cambiado a ${mode === 'simple' ? 'Lectura Simple' : 'Regleta'}`;
    if (mode === 'simple') {
      this.regletaProducts = [];
      if (this.online && this.pendingCount > 0) {
        this.flushQueue();
      }
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

    this.statusMessage = `Usuario guardado: ${this.currentUserName} - Área: ${this.inventoryArea.trim()}`;
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

          if (this.readingMode === 'simple') {
            const item: StorageItem = data[0];
            this.currentProduct = this.mapStorageItemToProduct(item);
            this.statusMessage = `Producto encontrado: ${this.currentProduct.productName}`;
          } else {
            const mapped = data.map((d: StorageItem) => this.mapStorageItemToProduct(d));
            for (const p of mapped) {
              const exists = this.regletaProducts.some((r) => r.consecutivo === p.consecutivo || r.barcode === p.barcode);
              if (!exists) this.regletaProducts.push(p);
            }
            if (this.regletaProducts.length > 5) {
              this.regletaProducts = this.regletaProducts.slice(-5);
            }
            this.statusMessage = `Regleta actualizada (${this.regletaProducts.length}/5)`;
          }
        },
        error: (err) => {
          console.error('Error al consultar getStorage:', err);
          this.statusMessage = err?.message ? `Error: ${err.message}` : 'Error al consultar el backend.';
        }
      });
  }

  clearData() {
    this.barcodeInput = '';
    this.scannedCodes = [];
    this.currentProduct = null;
    this.regletaProducts = [];
    // IMPORTANTE: "Limpiar" NO borra la cola de lecturas pendientes (this.pendingQueue).
    // Esos datos solo salen de la cola cuando se cargan al servidor o se eliminan uno a uno.
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

    // Código válido: si había una alerta de lectura incorrecta previa, se limpia.
    this.serverSuccess = null;
    this.serverResponse = null;
    this.duplicateBarcode = null;

    // Limpiar temporizadores activos
    if (this.scanTimer) clearTimeout(this.scanTimer);

    if (!this.scannedCodes.includes(code)) {
      this.scannedCodes.push(code);
    }

    if (this.readingMode === 'simple') {
      // Modo simple: NO se envía al servidor de inmediato. Se guarda en la cola local
      // (offline-first) y se carga cuando haya conexión.
      this.enqueueReading(code);
    } else {
      // Modo regleta: comportamiento original sin cambios.
      this.fetchProductInfo(code);
    }

    // Limpieza importante
    this.barcodeInput = '';
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  Cola offline-first (SOLO modo simple)
  // ─────────────────────────────────────────────────────────────────────────────

  /** Añade una lectura a la cola local y la persiste de inmediato (no se puede perder). */
  private enqueueReading(code: string): void {
    if (!this.inventoryArea.trim()) {
      this.statusMessage = 'Configure el Área (botón "Usuario Inventario") antes de escanear.';
      return;
    }
    if (!this.currentUserName) {
      this.statusMessage = 'No se pudo obtener el usuario del token. Vuelva a iniciar sesión.';
      return;
    }

    const area = this.inventoryArea.trim();
    const alreadyQueued = this.pendingQueue.some((i) => i.barcode === code && i.area === area && i.status !== 'error');
    if (alreadyQueued) {
      this.statusMessage = `El código ${code} ya está en la cola pendiente.`;
      this.barcodeInput = '';
      this.refocusBarcodeInput();
      return;
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
  }

  /** Botón "Cargar al servidor": intenta vaciar la cola manualmente. */
  onUploadClick(): void {
    if (this.readingMode !== 'simple') return;

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
      } else {
        failed++;
      }
      this.persistQueue();
    }

    this.flushing = false;

    const remaining = this.pendingCount;
    this.lastSyncMessage =
      failed === 0
        ? `✔ ${sent} lectura(s) cargada(s) al servidor.`
        : `${sent} enviada(s), ${failed} sin enviar. Quedan ${remaining} pendiente(s).`;
    this.statusMessage = this.lastSyncMessage;

    // Cargue explícito ("Cargar al servidor"): alertar la cantidad enviada (para que el
    // usuario la relacione con el lote que acaba de escanear) y, si no quedó nada
    // pendiente, limpiar el listado de códigos escaneados para el siguiente lote.
    if (notifyUser && sent > 0) {
      if (remaining === 0) {
        this.scannedCodes = [];
      }
      if (typeof window !== 'undefined') {
        window.alert(
          remaining === 0
            ? `✔ Se enviaron ${sent} producto(s) al inventario correctamente.`
            : `Se enviaron ${sent} producto(s) al inventario. ${failed} no se pudieron enviar y quedan pendientes de revisión.`
        );
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

  registerInventory() {
    // En modo simple el registro va por la cola offline (no envío directo).
    if (this.readingMode === 'simple') {
      this.onUploadClick();
      return;
    }

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
      this.scannedCodes.push(barcode);
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
