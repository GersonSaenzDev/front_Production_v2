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
  private static readonly INPUT_ID = 'barcodeReaderInput';

  private dashboardService = inject(DashboardServices);

  barcodeInput = '';

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

  get pendingCount(): number {
    return this.pendingUploads.length;
  }

  ngOnInit(): void {
    this.loadHistoric();
    this.loadPendingQueue();

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onlineHandler);
      window.addEventListener('offline', this.offlineHandler);

      this.retryTimer = setInterval(() => {
        if (this.pendingCount > 0 && navigator.onLine) {
          this.retryPending();
        }
      }, 60000);
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
    }
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /** Las pistolas de código de barras terminan la lectura enviando 'Enter'. */
  onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    event.preventDefault();

    // Pequeño retraso para asegurar que ngModel capturó el último carácter
    // antes de procesar (mismo margen que usaba la app Flutter: 50ms).
    setTimeout(() => this.processItem(this.barcodeInput), 50);
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
      this.uniqueItems.push(trimmedItem);
      this.message = `Ítem "${trimmedItem}" registrado correctamente.`;
      this.messageColor = 'neutral';
      this.addUniqueItemToHistoric(trimmedItem);
    }

    this.barcodeInput = '';
    this.refocusInput();
  }

  private addUniqueItemToHistoric(item: string): void {
    if (this.historicItems.has(item)) return;
    this.historicItems.add(item);
    this.persistHistoric();
  }

  async saveUniqueItemsToFile(): Promise<void> {
    if (this.uniqueItems.length === 0) {
      this.message = 'No hay ítems únicos para guardar.'.toUpperCase();
      this.messageColor = 'orange';
      return;
    }

    const fileName = this.buildFileName();
    const csvContent = this.uniqueItems.join('\n') + '\n';

    this.message = `Archivo "${fileName}" guardado. Enviando al servidor...`.toUpperCase();
    this.messageColor = 'neutral';
    this.sending = true;

    const sent = await this.sendFile(fileName, csvContent);

    if (sent) {
      this.message = `Archivo "${fileName}" guardado y enviado al servidor.`.toUpperCase();
      this.messageColor = 'green';
    } else {
      this.enqueuePending(fileName, csvContent);
      this.message =
        `Archivo "${fileName}" guardado. Sin conexión con el servidor: se reenviará automáticamente.`.toUpperCase();
      this.messageColor = 'orange';
    }

    this.sending = false;
    this.uniqueItems = [];
    this.repeatedItems = [];
    this.refocusInput();
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

  private enqueuePending(fileName: string, csvContent: string): void {
    this.pendingUploads.push({
      id: this.newId(),
      fileName,
      csvContent,
      createdAt: new Date().toISOString()
    });
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
