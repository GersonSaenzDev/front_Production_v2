// src/app/warehouse/dock-loading/dock-loading.ts
//
// Cargue en Muelle (operario CARGUEMUELLE*): punto de control de lo que se embarca. El operario
// SOLO escanea, sin elegir OC y sin ver qué le falta: el backend ubica la OC prealistada de cada
// serial. Si el serial no está prealistado (o su OC no cerró el prealistamiento) se muestra una
// alerta en pantalla y se notifica a Bodega, jefe de bodega y Auditoría. El vehículo (placa y
// conductor del administrativo) se valida al despachar: el operario digita la placa que ve. Una OC
// solo se despacha cuando lo cargado coincide 100% con lo prealistado.
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { finalize } from 'rxjs';

import { DashInventoryServices } from '../../services/dashInventory-services';
import { DockOrder, DockRead, DockScanResponse, DockScanResult, LOADING_ORDER_REJECT_LABELS } from '../../interfaces/loading-order.interface';

const SERIAL_LENGTH = 27;
// Con varios operarios en el muelle, el estado de las OC en cargue se sincroniza solo
const SYNC_INTERVAL_MS = 15000;

interface DockAlertScreen {
  title: string;
  detail: string;
  serial: string;
  alertRaised: boolean;
}

@Component({
  selector: 'app-dock-loading',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dock-loading.html',
  styleUrl: './dock-loading.scss'
})
export class DockLoading implements OnInit, OnDestroy {
  private readonly inventoryService = inject(DashInventoryServices);
  private readonly toastr = inject(ToastrService);

  @ViewChild('scanInput') private scanInput?: ElementRef<HTMLInputElement>;
  @ViewChild('plateInput') private plateInput?: ElementRef<HTMLInputElement>;

  readonly serialLength = SERIAL_LENGTH;

  // ============================================================
  //  ESTADO
  // ============================================================
  readonly orders = signal<DockOrder[]>([]);
  readonly loadingOrders = signal(false);
  readonly processing = signal(false);
  /** Lecturas de esta sesión (todas, la más reciente primero) */
  readonly sessionReads = signal<DockRead[]>([]);
  readonly lastOk = signal<DockRead | null>(null);
  /** Aviso visual: la lectura es de una OC distinta a la anterior (¿mismo vehículo?) */
  readonly orderChanged = signal<{ from: string; to: string } | null>(null);
  /** Lectura errada: pantalla roja que el operario debe reconocer antes de seguir */
  readonly alertScreen = signal<DockAlertScreen | null>(null);

  // Despacho (validación del vehículo)
  readonly dispatchTarget = signal<DockOrder | null>(null);
  readonly dispatching = signal(false);
  plateConfirm = '';

  // Faltante
  readonly missingTarget = signal<DockOrder | null>(null);
  readonly reportingMissing = signal(false);
  missingObservation = '';

  scanValue = '';
  private readonly scanQueue: string[] = [];
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private audioContext: AudioContext | null = null;

  /** Solo las OC que ya tienen lecturas en el muelle (no se lista lo que falta por cargar) */
  readonly loadingNow = computed(() => this.orders().filter((o) => o.status === 'LOADING'));
  readonly dialogOpen = computed(() => !!this.alertScreen() || !!this.dispatchTarget() || !!this.missingTarget());

  // ============================================================
  //  CICLO DE VIDA
  // ============================================================
  ngOnInit(): void {
    this.loadOrders();
    this.focusScan();
    this.syncTimer = setInterval(() => this.sync(), SYNC_INTERVAL_MS);
  }

  ngOnDestroy(): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.scanQueue.length = 0;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    this.audioContext?.close().catch(() => undefined);
  }

  loadOrders(): void {
    this.loadingOrders.set(true);
    this.inventoryService
      .getDockOrders()
      .pipe(finalize(() => this.loadingOrders.set(false)))
      .subscribe({
        next: (res) => this.orders.set(res.data ?? []),
        error: (err: Error) => this.toastr.error(this.clean(err.message), 'Cargue en muelle')
      });
  }

  private sync(): void {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (this.processing() || this.scanQueue.length || this.dialogOpen()) return;
    this.loadOrders();
  }

  // ============================================================
  //  LECTURA (sin elegir OC)
  // ============================================================
  onScanSubmit(): void {
    const serial = (this.scanValue || '').replace(/\D/g, '');
    this.scanValue = '';
    if (!serial) return;

    if (serial.length !== SERIAL_LENGTH) {
      this.beep(false);
      this.toastr.warning(`Lectura incompleta: el serial debe tener ${SERIAL_LENGTH} dígitos (se leyeron ${serial.length}). Vuelva a leer.`, 'Serial inválido');
      return;
    }
    // Las pistolas disparan lecturas muy rápido: se procesan en cola, una a la vez
    this.scanQueue.push(serial);
    this.processQueue();
  }

  private processQueue(): void {
    if (this.processing() || !this.scanQueue.length || this.alertScreen()) return;

    const serial = this.scanQueue.shift() as string;
    this.processing.set(true);
    this.inventoryService
      .dockScanSerial(serial)
      .pipe(
        finalize(() => {
          this.processing.set(false);
          this.processQueue();
          this.focusScan();
        })
      )
      .subscribe({
        next: (res) => this.applyRead(res.data as DockScanResult),
        error: (err: HttpErrorResponse) => this.handleScanError(serial, err)
      });
  }

  private applyRead(result: DockScanResult): void {
    const read = result.read;
    const previous = this.lastOk()?.loadingOrder;
    this.orderChanged.set(previous && read.loadingOrder && previous !== read.loadingOrder ? { from: previous, to: read.loadingOrder } : null);
    if (this.orderChanged()) this.speak(`Atención: esta unidad es de otra orden de cargue. Verifique el vehículo.`);

    this.lastOk.set(read);
    this.sessionReads.update((list) => [read, ...list]);
    this.beep(true);

    // La OC pasa a "en cargue" con la primera lectura; se refleja de inmediato en el panel
    this.orders.update((list) => {
      const exists = list.some((o) => o._id === read.loadingOrderId);
      if (!exists) {
        this.loadOrders();
        return list;
      }
      return list.map((o) => (o._id === read.loadingOrderId ? { ...o, status: 'LOADING', isComplete: result.isComplete } : o));
    });

    if (result.isComplete) {
      const msg = result.hasVehicle
        ? `OC ${read.loadingOrder}: lo cargado coincide 100% con lo prealistado. Puede despachar.`
        : `OC ${read.loadingOrder} completa, pero aún no tiene vehículo asignado por el administrativo.`;
      this.toastr.success(msg, 'Cargue completo', { timeOut: 8000 });
      this.speak(`Orden de cargue ${Number(read.loadingOrder)} completa.`);
    }
  }

  private handleScanError(serial: string, err: HttpErrorResponse): void {
    const body = err.error as DockScanResponse | null;
    if (err.status === 0) {
      this.beep(false);
      this.toastr.error('Sin conexión: la lectura NO se guardó. Vuelva a leer el serial.', 'Cargue en muelle');
      return;
    }
    // Doble lectura del mismo serial: aviso simple, no es una unidad errada
    if (body?.rejectReason === 'ALREADY_LOADED') {
      this.beep(false);
      this.toastr.warning(body.msg, 'Ya cargado');
      return;
    }
    if (body?.rejectReason === 'NOT_PICKED' || body?.rejectReason === 'ORDER_NOT_READY' || body?.rejectReason === 'PICKED_IN_OTHER_ORDER') {
      // Se detiene la cola: las lecturas siguientes esperan a que el operario retire la unidad
      this.scanQueue.length = 0;
      this.alertScreen.set({
        title: LOADING_ORDER_REJECT_LABELS[body.rejectReason],
        detail: body.msg,
        serial,
        alertRaised: !!body.alertRaised
      });
      this.beep(false);
      this.speak('Alerta. Lectura errada. No suba esta unidad al vehículo.');
      return;
    }
    this.beep(false);
    this.toastr.error(body?.msg || 'No se pudo registrar la lectura.', 'Cargue en muelle');
    this.loadOrders();
  }

  acknowledgeAlert(): void {
    this.alertScreen.set(null);
    this.focusScan();
  }

  // ============================================================
  //  DESPACHO (validación del vehículo)
  // ============================================================
  openDispatch(order: DockOrder): void {
    if (!order.isComplete || !order.hasVehicle) return;
    this.plateConfirm = '';
    this.dispatchTarget.set(order);
    setTimeout(() => this.plateInput?.nativeElement.focus());
  }

  cancelDispatch(): void {
    this.dispatchTarget.set(null);
    this.focusScan();
  }

  confirmDispatch(): void {
    const order = this.dispatchTarget();
    const plate = String(this.plateConfirm || '')
      .toUpperCase()
      .replace(/[\s-]/g, '');
    if (!order || plate.length < 5) return;

    this.dispatching.set(true);
    this.inventoryService
      .completeDockLoading(order._id, plate)
      .pipe(finalize(() => this.dispatching.set(false)))
      .subscribe({
        next: (res) => {
          this.toastr.success(res.msg, 'Despacho', { timeOut: 8000 });
          this.speak('Vehículo despachado.');
          this.dispatchTarget.set(null);
          this.loadOrders();
          this.focusScan();
        },
        error: (err: Error) => {
          this.beep(false);
          this.toastr.error(this.clean(err.message), 'Despacho', { timeOut: 10000 });
          this.speak('No se pudo despachar. Verifique el vehículo.');
        }
      });
  }

  // ============================================================
  //  FALTANTE
  // ============================================================
  openMissing(order: DockOrder): void {
    this.missingObservation = '';
    this.missingTarget.set(order);
  }

  cancelMissing(): void {
    this.missingTarget.set(null);
    this.focusScan();
  }

  confirmMissing(): void {
    const order = this.missingTarget();
    const observation = this.missingObservation.trim();
    if (!order || observation.length < 5) return;

    this.reportingMissing.set(true);
    this.inventoryService
      .reportDockMissing(order._id, observation)
      .pipe(finalize(() => this.reportingMissing.set(false)))
      .subscribe({
        next: (res) => {
          this.toastr.warning(res.msg || 'Faltante reportado.', 'Cargue en muelle', { timeOut: 8000 });
          this.missingTarget.set(null);
          this.focusScan();
        },
        error: (err: Error) => this.toastr.error(this.clean(err.message), 'Reportar faltante')
      });
  }

  // ============================================================
  //  UTILIDADES
  // ============================================================
  /** Mantiene el foco en el lector (la pistola escribe en el campo con foco). */
  focusScan(): void {
    setTimeout(() => {
      if (!this.dialogOpen()) this.scanInput?.nativeElement.focus();
    });
  }

  private clean(message: string): string {
    return String(message || '').replace(/^Falló la consulta al backend:\s*/, '');
  }

  private speak(text: string): void {
    if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-CO';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  /** Tono corto: agudo = lectura válida, grave triple = lectura errada. */
  private beep(ok: boolean): void {
    try {
      this.audioContext ??= new AudioContext();
      const ctx = this.audioContext;
      const tones = ok ? [880] : [220, 220, 220];
      tones.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = ctx.currentTime + i * 0.2;
        osc.type = ok ? 'sine' : 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.18, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.16);
      });
    } catch {
      /* el navegador puede bloquear el audio: la retroalimentación visual es suficiente */
    }
  }
}
