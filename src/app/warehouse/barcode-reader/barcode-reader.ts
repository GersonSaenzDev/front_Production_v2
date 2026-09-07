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

  private dashboardService = inject(DashboardServices);

  barcodeInput = '';
  private scanTimer: ReturnType<typeof setTimeout> | null = null;

  uniqueItems: string[] = [];
  repeatedItems: string[] = [];

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

    let isRepeated = false;

    if (this.historicItems.has(trimmedItem)) {
      isRepeated = true;
      this.message = `REGISTRO EXISTENTE EN EL HISTORICO: "${trimmedItem}"`.toUpperCase();
      this.messageColor = 'red';
    } else if (this.uniqueItems.includes(trimmedItem)) {
      isRepeated = true;
      this.message = `EL ÍTEM "${trimmedItem}" YA FUE ESCANEADO EN ESTA SESIÓN.`.toUpperCase();
      this.messageColor = 'red';
    }

    if (isRepeated) {
      if (!this.repeatedItems.includes(trimmedItem)) {
        this.repeatedItems.push(trimmedItem);
      }
    } else {
      // Se agrega al INICIO (no al final) para que la última lectura quede siempre
      // visible arriba de la lista, sin tener que scrollear para confirmarla.
      this.uniqueItems.unshift(trimmedItem);
      this.message = `Ítem "${trimmedItem}" registrado correctamente.`;
      this.messageColor = 'neutral';
      this.addUniqueItemToHistoric(trimmedItem);
    }

    this.persistDraft();
    this.barcodeInput = '';
    this.refocusInput();
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

    // Un código presente en AMBAS listas fue escaneado más de una vez en esta misma
    // sesión (gatillo repetido, glitch del lector, etc.): no hay certeza de que sea
    // una unidad física distinta, así que NO se envía.
    const duplicatedInSession = snapshotUnique.filter((item) => snapshotRepeated.includes(item));
    const itemsToSend = snapshotUnique.filter((item) => !snapshotRepeated.includes(item));

    if (duplicatedInSession.length > 0) {
      // Se habían marcado en el histórico permanente apenas se escanearon la primera
      // vez (para poder detectar la repetición). Como finalmente NO se envían, se
      // revierte esa marca: si no, un escaneo legítimo futuro de ese mismo código
      // quedaría bloqueado para siempre como "ya existe en el histórico".
      duplicatedInSession.forEach((item) => this.historicItems.delete(item));
      this.persistHistoric();
    }

    // Se retira del working set exactamente lo que se tomó en esta foto, dejando
    // intacto cualquier ítem escaneado después de tomarla.
    this.uniqueItems = this.uniqueItems.filter((item) => !snapshotUnique.includes(item));
    this.repeatedItems = this.repeatedItems.filter((item) => !snapshotRepeated.includes(item));
    this.persistDraft();

    if (itemsToSend.length === 0) {
      this.message =
        `TODOS LOS ÍTEMS DE ESTE LOTE (${duplicatedInSession.length}) SE DETECTARON COMO REPETIDOS EN LA SESIÓN: NO SE ENVIÓ NINGÚN ARCHIVO.`;
      this.messageColor = 'orange';
      this.sending = false;
      this.refocusInput();
      return;
    }

    const fileName = this.buildFileName();
    const csvContent = itemsToSend.join('\n') + '\n';
    const excludedNote =
      duplicatedInSession.length > 0 ? ` (${duplicatedInSession.length} REPETIDO(S) DE SESIÓN EXCLUIDO(S))` : '';

    this.message = `Archivo "${fileName}" guardado${excludedNote}. Enviando al servidor...`.toUpperCase();
    this.messageColor = 'neutral';

    // Se encola ANTES de intentar enviar: si el navegador se cierra o el envío se
    // interrumpe a mitad de camino, el lote ya quedó persistido en localStorage y se
    // reintentará automáticamente en cuanto vuelva a haber conexión (ver ngOnInit).
    const pendingId = this.enqueuePending(fileName, csvContent);

    const sent = await this.sendFile(fileName, csvContent);

    if (sent) {
      this.removePendingById(pendingId);
      this.message = `Archivo "${fileName}" guardado y enviado al servidor${excludedNote}.`.toUpperCase();
      this.messageColor = 'green';
    } else {
      this.message =
        `Archivo "${fileName}" guardado${excludedNote}. Sin conexión con el servidor: se reenviará automáticamente.`.toUpperCase();
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
      if (unique.length === 0 && repeated.length === 0) return;

      this.uniqueItems = unique;
      this.repeatedItems = repeated;
      this.message =
        `SE RECUPERARON ${unique.length} ÍTEM(S) SIN GUARDAR DE UNA SESIÓN ANTERIOR (CIERRE INESPERADO). REVISE Y GUARDE.`;
      this.messageColor = 'orange';
    } catch (err) {
      console.error('No se pudo leer el borrador de la sesión de escaneo:', err);
    }
  }

  private persistDraft(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      if (this.uniqueItems.length === 0 && this.repeatedItems.length === 0) {
        localStorage.removeItem(BarcodeReader.DRAFT_KEY);
        return;
      }
      localStorage.setItem(
        BarcodeReader.DRAFT_KEY,
        JSON.stringify({ uniqueItems: this.uniqueItems, repeatedItems: this.repeatedItems })
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
