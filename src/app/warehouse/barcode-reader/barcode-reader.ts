// src/app/warehouse/barcode-reader/barcode-reader.ts
import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { DashboardServices } from '../../services/dashboard-services';

type MessageColor = 'neutral' | 'red' | 'green' | 'orange';

/**
 * Lote pendiente de envío al servidor (offline-first).
 * Se persiste en localStorage para no perder el lote si no hay red o se recarga la página.
 */
interface PendingUpload {
  id: string;
  fileName: string;
  csvContent: string;
  createdAt: string;
}

/**
 * Lector de código de barras para Producción, migrado de la app Flutter
 * "control_inventario" (lib/pages/produccion_page.dart) porque la pistola Android
 * que la ejecutaba se dañó. Conserva el mismo comportamiento y el mismo formato de
 * envío al servidor (CSV con un barcode por línea, campo `resulBarcode`,
 * POST a /assembly/loadAssembly) para que el backend no requiera cambios.
 */
@Component({
  selector: 'app-barcode-reader',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './barcode-reader.html',
  styleUrl: './barcode-reader.scss'
})
export class BarcodeReader implements OnInit, OnDestroy {
  private static readonly HISTORIC_KEY = 'barcode-reader.historic-produccion.v1';
  private static readonly PENDING_KEY = 'barcode-reader.pending-uploads.v1';
  /** Borrador de ítems escaneados aún no guardados: sobrevive a un cierre/crash del navegador. */
  private static readonly DRAFT_KEY = 'barcode-reader.draft.v1';
  private static readonly INPUT_ID = 'barcodeReaderInput';

  /** Todo barcode de Indusel tiene EXACTAMENTE 27 dígitos (ver reader-inventory.ts). */
  private static readonly BARCODE_LENGTH = 27;

  /**
   * Un palet real está formado por 10 unidades consecutivas de la MISMA referencia
   * (antes se validaban grupos de 4 o 5 — el tamaño de una sola caja física — pero
   * el palet completo son 2 cajas). Posiciones dentro del código de 27 dígitos, igual
   * que en el backend (ver seeSearchReferenceStorageDAO / reader-inventory.ts):
   * dígitos 10-16 = referencia (codRef), dígitos 18-27 = consecutivo.
   */
  private static readonly PALLET_SIZE = 10;
  private static readonly REF_START = 9;
  private static readonly REF_LEN = 7;
  private static readonly SERIAL_START = 17;
  private static readonly SERIAL_LEN = 10;

  /**
   * Referencias que se empacan como REGLETA / palet de 10 unidades con consecutivos
   * contiguos. NO es una sola referencia: varias líneas se despachan así. Cualquier otra
   * se registra de inmediato, de forma individual — el operario NUNCA elige nada: el
   * propio código escaneado dice, por su referencia, si debe esperar a completar un palet
   * o no. Así una referencia que no va en regleta nunca se queda atascada esperando un
   * palet de 10 que jamás se va a completar.
   *
   * Formato de la llave = lo que devuelve `extractReference()`: los 7 dígitos de las
   * posiciones 10-16 del código de 27 (últimos 7 del GTIN-14 = `0` + los 6 dígitos de la
   * referencia). Para sumar otra, agrega aquí su valor de 7 dígitos y mantén esta lista
   * sincronizada con reader-inventory.ts. Referencias confirmadas contra etiqueta física:
   *   0014171  (referencia previa)
   *   0312093  MAJESTIC SE 200-1 MOTEADO       -> GTIN (01) 07706060312093
   *   0033028  SE 200-1 (gas, POT 4,06 kW)     -> GTIN (01) 07706060033028
   *   0034025  SE 200-1 GN 17-25 mbar          -> GTIN (01) 07706060034025
   *   0011170  SE 200-1 ABBA MOTEADO (GLP)     -> GTIN (01) 07706060011170
   *   0012092  SE 200-1 AZUL MOTEADO           -> GTIN (01) 07706060012092
   */
  private static readonly PALLET_REFERENCES = new Set<string>([
    '0014171',
    '0312093',
    '0033028',
    '0034025',
    '0011170',
    '0012092'
  ]);

  private dashboardService = inject(DashboardServices);

  barcodeInput = '';
  private scanTimer: ReturnType<typeof setTimeout> | null = null;

  uniqueItems: string[] = [];
  repeatedItems: string[] = [];

  /**
   * Códigos ya leídos del palet en curso, aún NO registrados en `uniqueItems`. Solo se
   * "confirman" (pasan a Únicos, quedan disponibles para "Guardar") cuando se completan
   * las PALLET_SIZE unidades — así nunca se envía un palet incompleto, y se pueden
   * completar varios palets antes de presionar "Guardar" (se van acumulando en Únicos).
   */
  currentPallet: string[] = [];

  message = '';
  messageColor: MessageColor = 'neutral';

  /** Códigos ya enviados alguna vez desde este navegador (persistido, crece indefinidamente). */
  private historicItems = new Set<string>();

  /** Lotes que no se pudieron enviar y se reintentan automáticamente. */
  pendingUploads: PendingUpload[] = [];

  sending = false;
  online: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;

  private readonly onlineHandler = () => this.onConnectivityChange(true);
  private readonly offlineHandler = () => this.onConnectivityChange(false);
  private retryTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Si la pestaña pasa a segundo plano (cambio de app, minimizar, cerrar) mientras
   * hay ítems escaneados sin guardar, se intenta guardar/enviar automáticamente,
   * igual que si se hubiera presionado "Guardar". `visibilitychange`/`pagehide` son
   * las señales más confiables para esto en navegadores (a diferencia de
   * `beforeunload`, que es poco confiable en móviles/tablets).
   */
  private readonly visibilityHandler = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      void this.autoSaveOnHide();
    }
  };
  private readonly pageHideHandler = () => void this.autoSaveOnHide();

  get pendingCount(): number {
    return this.pendingUploads.length;
  }

  ngOnInit(): void {
    this.loadHistoric();
    this.loadPendingQueue();
    this.loadDraft();

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onlineHandler);
      window.addEventListener('offline', this.offlineHandler);
      window.addEventListener('pagehide', this.pageHideHandler);

      this.retryTimer = setInterval(() => {
        if (this.pendingCount > 0 && navigator.onLine) {
          this.retryPending();
        }
      }, 60000);
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }

    if (this.online && this.pendingCount > 0) {
      this.retryPending();
    }

    this.refocusInput();
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onlineHandler);
      window.removeEventListener('offline', this.offlineHandler);
      window.removeEventListener('pagehide', this.pageHideHandler);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /**
   * Las pistolas de código de barras terminan la lectura enviando 'Enter'.
   *
   * IMPORTANTE: aquí NO se intercepta ningún otro carácter (nada de
   * `preventDefault()` ni de filtrar por `event.key`/`event.code`). Varios
   * lectores Android inyectan el texto vía IME/InputConnection y esperan que el
   * navegador procese el evento de forma completamente nativa; si el handler de
   * `keydown` cancela el evento por su cuenta, el lector interpreta que la
   * inyección falló, emite su tono de error ("doble bip") y el campo se queda
   * vacío. Ese fue exactamente el efecto de un ajuste anterior que intentaba
   * filtrar caracteres inválidos en este mismo punto.
   *
   * El filtrado de lecturas inválidas (símbolos del EAN-128 mal decodificados,
   * longitud incorrecta, etc.) se sigue haciendo en `processItem`, sobre el texto
   * ya recibido — igual que en reader-inventory.ts, que sí lee bien con pistola.
   */
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      // Pequeño margen para asegurar que ngModel capturó el último carácter antes
      // de procesar (mismo margen que reader-inventory.ts).
      setTimeout(() => this.processItem(this.barcodeInput), 50);
      return;
    }

    // Respaldo por si el lector no dispara Enter: si el campo deja de "escribir"
    // por 300ms con un código de longitud razonable, se procesa igual (mismo
    // mecanismo que reader-inventory.ts).
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.scanTimer = setTimeout(() => {
      const currentCode = (this.barcodeInput || '').trim();
      if (currentCode.length >= 10) {
        this.processItem(currentCode);
      }
    }, 300);
  }

  onSendClick(): void {
    this.processItem(this.barcodeInput);
  }

  private processItem(rawItem: string): void {
    const trimmedItem = (rawItem || '').trim();

    if (!trimmedItem) {
      this.message = 'Por favor, ingrese un número o escanee un código.';
      this.messageColor = 'neutral';
      this.barcodeInput = '';
      this.refocusInput();
      return;
    }

    if (!/^\d+$/.test(trimmedItem)) {
      this.message = 'LECTURA INVÁLIDA: EL CÓDIGO CONTIENE CARACTERES NO NUMÉRICOS. VUELVA A ESCANEAR.';
      this.messageColor = 'red';
      this.barcodeInput = '';
      this.refocusInput();
      return;
    }

    // Todo barcode de Indusel tiene EXACTAMENTE 27 dígitos (ver reader-inventory.ts).
    // Si el lector entregó menos o más, la lectura quedó incompleta/corrupta: se
    // descarta y se pide reescanear en vez de dejarla pasar como buena.
    if (trimmedItem.length !== BarcodeReader.BARCODE_LENGTH) {
      this.message =
        `LECTURA INCORRECTA: EL CÓDIGO TIENE ${trimmedItem.length} DÍGITO(S) Y DEBE TENER ${BarcodeReader.BARCODE_LENGTH}. VUELVA A ESCANEAR.`;
      this.messageColor = 'red';
      this.barcodeInput = '';
      this.refocusInput();
      return;
    }

    // Cancela el respaldo de 300ms armado por el último dígito de ESTE código (igual que
    // reader-inventory.ts en readBarcode()). Si no se cancela aquí, ese timer puede seguir
    // vivo y disparar 250ms más tarde en plena mitad del SIGUIENTE código que se esté
    // tecleando, procesándolo dos veces (una vez de más, aquí de forma anticipada y otra
    // por su propio Enter) y generando una relectura fantasma — no una repetición real.
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }

    let isRepeated = false;

    if (this.historicItems.has(trimmedItem)) {
      isRepeated = true;
      this.message = `REGISTRO EXISTENTE EN EL HISTORICO: "${trimmedItem}"`.toUpperCase();
      this.messageColor = 'red';
    } else if (this.uniqueItems.includes(trimmedItem) || this.currentPallet.includes(trimmedItem)) {
      isRepeated = true;
      this.message = `EL ÍTEM "${trimmedItem}" YA FUE ESCANEADO EN ESTA SESIÓN.`.toUpperCase();
      this.messageColor = 'red';
    }

    if (isRepeated) {
      if (!this.repeatedItems.includes(trimmedItem)) {
        this.repeatedItems.push(trimmedItem);
      }
    } else if (BarcodeReader.PALLET_REFERENCES.has(this.extractReference(trimmedItem))) {
      // Esta referencia SÍ va en palet: no se registra de inmediato, debe completar
      // las 10 unidades consecutivas antes de estar disponible para "Guardar".
      this.tryAddToPallet(trimmedItem);
    } else {
      // Referencia individual (no está en PALLET_REFERENCES): se registra de inmediato,
      // sin esperar a nada — así nunca se queda "atascada" esperando un palet que esa
      // referencia ya no forma.
      this.uniqueItems.unshift(trimmedItem);
      this.addUniqueItemToHistoric(trimmedItem);
      this.message = `Ítem "${trimmedItem}" registrado correctamente.`;
      this.messageColor = 'neutral';
    }

    this.persistDraft();
    this.barcodeInput = '';
    this.refocusInput();
  }

  private extractReference(code: string): string {
    return code.substring(BarcodeReader.REF_START, BarcodeReader.REF_START + BarcodeReader.REF_LEN);
  }

  private extractSerial(code: string): number {
    return parseInt(code.substring(BarcodeReader.SERIAL_START, BarcodeReader.SERIAL_START + BarcodeReader.SERIAL_LEN), 10);
  }

  /**
   * Agrega un código al palet en curso. Mismo criterio estricto que reader-inventory.ts
   * (modo Regleta): las PALLET_SIZE (10) unidades deben ser de la MISMA referencia
   * (dígitos 10-16) y sus consecutivos (dígitos 18-27) deben terminar formando un rango
   * contiguo de EXACTAMENTE 10 números — sin huecos, sin repetidos, sin sobrantes. Se
   * puede leer en cualquier orden; un código que no encaja se rechaza de inmediato sin
   * tocar el palet en curso, para detectar el error de lectura ahí mismo.
   *
   * Al completarse el palet, sus 10 códigos pasan a `uniqueItems` (quedan disponibles
   * para "Guardar") — así se pueden completar varios palets antes de enviar, sin que
   * ninguno se envíe incompleto.
   */
  private tryAddToPallet(code: string): void {
    const newRef = this.extractReference(code);
    const newSerial = this.extractSerial(code);

    if (isNaN(newSerial)) {
      this.message = `NO SE PUDO INTERPRETAR EL CONSECUTIVO DEL CÓDIGO "${code}". VUELVA A ESCANEARLO.`;
      this.messageColor = 'red';
      return;
    }

    if (this.currentPallet.length > 0) {
      const currentRef = this.extractReference(this.currentPallet[0]);
      if (currentRef !== newRef) {
        this.message =
          `REFERENCIA DISTINTA: EL PALET EN CURSO ES "${currentRef}" Y ESTE CÓDIGO ES "${newRef}". LAS ${BarcodeReader.PALLET_SIZE} UNIDADES DEBEN SER DE LA MISMA REFERENCIA.`;
        this.messageColor = 'red';
        return;
      }

      const existingSerials = this.currentPallet.map((c) => this.extractSerial(c));
      const span = Math.max(...existingSerials, newSerial) - Math.min(...existingSerials, newSerial) + 1;
      if (span > BarcodeReader.PALLET_SIZE) {
        this.message =
          `ESTE CONSECUTIVO NO ES CONSECUTIVO CON EL PALET EN CURSO (RANGO ACTUAL ${Math.min(...existingSerials)}–${Math.max(...existingSerials)}). VERIFIQUE QUE SEA DEL MISMO PALET.`;
        this.messageColor = 'red';
        return;
      }
    }

    this.currentPallet.push(code);

    if (this.currentPallet.length === BarcodeReader.PALLET_SIZE) {
      // Más reciente primero, igual que el resto de la lista de Únicos.
      for (const c of [...this.currentPallet].reverse()) {
        this.uniqueItems.unshift(c);
        this.addUniqueItemToHistoric(c);
      }
      this.message = `✔ PALET COMPLETO (${BarcodeReader.PALLET_SIZE}/${BarcodeReader.PALLET_SIZE}) — REFERENCIA ${newRef}. AGREGADO AL LOTE.`;
      this.messageColor = 'green';
      this.currentPallet = [];
    } else {
      this.message = `PALET EN PROGRESO: ${this.currentPallet.length}/${BarcodeReader.PALLET_SIZE} — REFERENCIA ${newRef}.`;
      this.messageColor = 'neutral';
    }
  }

  private addUniqueItemToHistoric(item: string): void {
    if (this.historicItems.has(item)) return;
    this.historicItems.add(item);
    this.persistHistoric();
  }

  /**
   * Guarda y envía el lote actual. Se usa tanto desde el botón "Guardar datos de
   * Producción" como automáticamente al ocultarse la pestaña (ver `autoSaveOnHide`).
   *
   * Guard de re-entrancia: `if (this.sending) return;` es la PRIMERA línea, antes de
   * cualquier `await`. Esto es inmune a la velocidad de los clics (a diferencia de
   * depender solo de `[disabled]="sending"` en el botón, cuyo repintado en pantalla
   * puede llegar tarde en una tablet si el usuario toca varias veces muy rápido):
   * como JS ejecuta cada handler de forma síncrona hasta su primer `await`, para
   * cuando el 2do/3er/... clic empieza a ejecutarse `sending` ya es `true`.
   */
  async saveUniqueItemsToFile(): Promise<void> {
    if (this.sending) return;

    // Foto del lote actual: lo que se escanee DESPUÉS de este punto (p.ej. mientras
    // se espera la respuesta del servidor) no se toca ni se pierde en este guardado.
    const snapshotUnique = [...this.uniqueItems];
    const snapshotRepeated = [...this.repeatedItems];

    if (snapshotUnique.length === 0) {
      this.message = 'No hay ítems únicos para guardar.'.toUpperCase();
      this.messageColor = 'orange';
      return;
    }

    this.sending = true;

    // Un código presente en AMBAS listas se leyó más de una vez en esta sesión, pero su
    // PRIMERA lectura (la que quedó en Únicos) ya pasó la validación del palet y
    // corresponde a una unidad física real: SÍ se envía. "Repetidos" es solo un aviso
    // para el operario (relectura del mismo código, gatillo repetido, glitch del
    // lector, etc.) — NUNCA debe hacer que se pierda el registro original; eso fue lo
    // que causaba que unidades realmente escaneadas no llegaran al ERP.
    //
    // Esto no puede generar un duplicado real en el servidor: un código que YA se envió
    // en un "Guardar" anterior queda marcado en `historicItems` y `processItem` jamás
    // vuelve a dejarlo entrar a `uniqueItems`, sin importar cuántas veces se relea.
    const repeatedInSession = snapshotUnique.filter((item) => snapshotRepeated.includes(item));
    const itemsToSend = snapshotUnique;

    // Se retira del working set exactamente lo que se tomó en esta foto, dejando
    // intacto cualquier ítem escaneado después de tomarla.
    this.uniqueItems = this.uniqueItems.filter((item) => !snapshotUnique.includes(item));
    this.repeatedItems = this.repeatedItems.filter((item) => !snapshotRepeated.includes(item));
    this.persistDraft();

    const fileName = this.buildFileName();
    const csvContent = itemsToSend.join('\n') + '\n';
    const repeatedNote =
      repeatedInSession.length > 0 ? ` (${repeatedInSession.length} CON RELECTURA EN LA SESIÓN, SE ENVÍAN IGUAL)` : '';

    this.message = `Archivo "${fileName}" guardado${repeatedNote}. Enviando al servidor...`.toUpperCase();
    this.messageColor = 'neutral';

    // Se encola ANTES de intentar enviar: si el navegador se cierra o el envío se
    // interrumpe a mitad de camino, el lote ya quedó persistido en localStorage y se
    // reintentará automáticamente en cuanto vuelva a haber conexión (ver ngOnInit).
    const pendingId = this.enqueuePending(fileName, csvContent);

    const sent = await this.sendFile(fileName, csvContent);

    if (sent) {
      this.removePendingById(pendingId);
      this.message = `Archivo "${fileName}" guardado y enviado al servidor${repeatedNote}.`.toUpperCase();
      this.messageColor = 'green';
    } else {
      this.message =
        `Archivo "${fileName}" guardado${repeatedNote}. Sin conexión con el servidor: se reenviará automáticamente.`.toUpperCase();
      this.messageColor = 'orange';
    }

    this.sending = false;
    this.refocusInput();
  }

  /**
   * Intento automático de guardado al ocultarse la pestaña (cambio de app, minimizar,
   * cerrar), para no perder ítems escaneados si el navegador se cierra de forma
   * abrupta antes de que el operario presione "Guardar" manualmente.
   */
  private async autoSaveOnHide(): Promise<void> {
    if (this.uniqueItems.length === 0 || this.sending) return;
    await this.saveUniqueItemsToFile();
  }

  /** Reintento manual: botón "Reintentar envíos pendientes". */
  retryPendingClick(): void {
    if (this.pendingCount === 0) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.online = false;
      return;
    }
    this.retryPending();
  }

  private async retryPending(): Promise<void> {
    if (this.pendingUploads.length === 0) return;

    const stillPending: PendingUpload[] = [];
    for (const item of this.pendingUploads) {
      const sent = await this.sendFile(item.fileName, item.csvContent);
      if (!sent) {
        stillPending.push(item);
      }
    }
    this.pendingUploads = stillPending;
    this.persistPending();
  }

  private async sendFile(fileName: string, csvContent: string): Promise<boolean> {
    try {
      const file = this.buildCsvFile(fileName, csvContent);
      const response = await firstValueFrom(this.dashboardService.loadAssembly(file));
      return !!response?.ok;
    } catch (err) {
      console.error('Error al enviar archivo de producción al servidor:', err);
      return false;
    }
  }

  private buildCsvFile(fileName: string, content: string): File {
    const blob = new Blob([content], { type: 'text/csv' });
    return new File([blob], fileName, { type: 'text/csv' });
  }

  private buildFileName(): string {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return (
      `Produccion_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_` +
      `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.csv`
    );
  }

  private enqueuePending(fileName: string, csvContent: string): string {
    const id = this.newId();
    this.pendingUploads.push({
      id,
      fileName,
      csvContent,
      createdAt: new Date().toISOString()
    });
    this.persistPending();
    return id;
  }

  private removePendingById(id: string): void {
    this.pendingUploads = this.pendingUploads.filter((item) => item.id !== id);
    this.persistPending();
  }

  private onConnectivityChange(isOnline: boolean): void {
    this.online = isOnline;
    if (isOnline && this.pendingCount > 0) {
      this.retryPending();
    }
  }

  private loadHistoric(): void {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(BarcodeReader.HISTORIC_KEY) : null;
      const parsed = raw ? JSON.parse(raw) : [];
      this.historicItems = new Set(Array.isArray(parsed) ? parsed : []);
    } catch (err) {
      console.error('No se pudo leer el histórico de producción:', err);
      this.historicItems = new Set();
    }
  }

  private persistHistoric(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(BarcodeReader.HISTORIC_KEY, JSON.stringify(Array.from(this.historicItems)));
      }
    } catch (err) {
      console.error('No se pudo guardar el histórico de producción:', err);
    }
  }

  private loadPendingQueue(): void {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(BarcodeReader.PENDING_KEY) : null;
      const parsed = raw ? JSON.parse(raw) : [];
      this.pendingUploads = Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.error('No se pudo leer la cola de envíos pendientes:', err);
      this.pendingUploads = [];
    }
  }

  private persistPending(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(BarcodeReader.PENDING_KEY, JSON.stringify(this.pendingUploads));
      }
    } catch (err) {
      console.error('No se pudo guardar la cola de envíos pendientes:', err);
    }
  }

  /**
   * Restaura ítems escaneados que quedaron sin guardar si la app se cerró/crasheó
   * antes de que el operario presionara "Guardar" (y antes de que `autoSaveOnHide`
   * alcanzara a dispararse). Así no se pierden aunque no haya habido ningún evento
   * de cierre "limpio" que el navegador pudiera notificar.
   */
  private loadDraft(): void {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(BarcodeReader.DRAFT_KEY) : null;
      if (!raw) return;

      const parsed = JSON.parse(raw);
      const unique = Array.isArray(parsed?.uniqueItems) ? parsed.uniqueItems : [];
      const repeated = Array.isArray(parsed?.repeatedItems) ? parsed.repeatedItems : [];
      const pallet = Array.isArray(parsed?.currentPallet) ? parsed.currentPallet : [];
      if (unique.length === 0 && repeated.length === 0 && pallet.length === 0) return;

      this.uniqueItems = unique;
      this.repeatedItems = repeated;
      this.currentPallet = pallet;
      const palletNote = pallet.length > 0 ? ` Y UN PALET EN PROGRESO (${pallet.length}/${BarcodeReader.PALLET_SIZE})` : '';
      this.message =
        `SE RECUPERARON ${unique.length} ÍTEM(S) SIN GUARDAR DE UNA SESIÓN ANTERIOR (CIERRE INESPERADO)${palletNote}. REVISE Y GUARDE.`;
      this.messageColor = 'orange';
    } catch (err) {
      console.error('No se pudo leer el borrador de la sesión de escaneo:', err);
    }
  }

  private persistDraft(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      if (this.uniqueItems.length === 0 && this.repeatedItems.length === 0 && this.currentPallet.length === 0) {
        localStorage.removeItem(BarcodeReader.DRAFT_KEY);
        return;
      }
      localStorage.setItem(
        BarcodeReader.DRAFT_KEY,
        JSON.stringify({ uniqueItems: this.uniqueItems, repeatedItems: this.repeatedItems, currentPallet: this.currentPallet })
      );
    } catch (err) {
      console.error('No se pudo guardar el borrador de la sesión de escaneo:', err);
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

  private refocusInput(): void {
    if (typeof document === 'undefined') return;
    setTimeout(() => {
      const el = document.getElementById(BarcodeReader.INPUT_ID) as HTMLInputElement | null;
      el?.focus();
    }, 30);
  }
}
