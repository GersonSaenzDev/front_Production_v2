// src/app/warehouse/loading-order-picking/loading-order-picking.ts
//
// Prealistamiento de Órdenes de Cargue (operario). El operario NO elige la OC: toma primero las
// que el administrativo le asignó y, si no tiene, la siguiente de la cola libre (FIFO / prioridad). Cada lectura se guarda al instante en el
// backend, así el trabajo se puede pausar y retomar (otro día u otro operario) sin perder nada.
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { finalize } from 'rxjs';

import { DashInventoryServices } from '../../services/dashInventory-services';
import {
  CompletePickingResponse,
  CompletePickingResult,
  LOADING_ORDER_REJECT_LABELS,
  LOADING_ORDER_STATUS_LABELS,
  LoadingOrderPickItem,
  LoadingOrderRead,
  LoadingOrderView,
  NextPickItemResult,
  PausedLoadingOrder,
  ScanSerialResponse,
  ScanSerialResult
} from '../../interfaces/loading-order.interface';

const SERIAL_LENGTH = 27;
const VOICE_STORAGE_KEY = 'loadingOrderPicking.voice';
// Con varios operarios en la misma OC, el avance se sincroniza solo cada pocos segundos
const SYNC_INTERVAL_MS = 15000;
const PAUSE_REASONS = ['Atender OC prioritaria', 'Falta producto en bodega', 'Cambio de turno'];

type RecentRead = Pick<LoadingOrderRead, '_id' | 'serial' | 'product' | 'reference' | 'productName' | 'prefix' | 'authorization' | 'readAt'> & {
  readByName: string;
};

interface ScanFeedback {
  ok: boolean;
  title: string;
  detail: string;
  serial: string;
}

@Component({
  selector: 'app-loading-order-picking',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './loading-order-picking.html',
  styleUrl: './loading-order-picking.scss'
})
export class LoadingOrderPicking implements OnInit, OnDestroy {
  private readonly inventoryService = inject(DashInventoryServices);
  private readonly toastr = inject(ToastrService);

  @ViewChild('scanInput') private scanInput?: ElementRef<HTMLInputElement>;

  readonly statusLabels = LOADING_ORDER_STATUS_LABELS;
  readonly serialLength = SERIAL_LENGTH;

  // ============================================================
  //  ESTADO
  // ============================================================
  readonly order = signal<LoadingOrderView | null>(null);
  readonly loading = signal(false);
  readonly noPendingOrders = signal(false);
  readonly processing = signal(false);
  readonly lastScan = signal<ScanFeedback | null>(null);
  readonly recentReads = signal<RecentRead[]>([]);
  readonly nextItem = signal<NextPickItemResult | null>(null);
  readonly sessionReads = signal(0);
  readonly voiceEnabled = signal(this.readVoicePreference());

  // Anulación
  readonly voidTarget = signal<RecentRead | null>(null);
  readonly voiding = signal(false);
  voidObservation = '';

  // Cierre
  readonly showCloseDialog = signal(false);
  readonly closing = signal(false);
  readonly closeResult = signal<CompletePickingResult | null>(null);
  closeObservation = '';

  // Pausa / reanudación
  readonly pauseReasons = PAUSE_REASONS;
  readonly pausedOrders = signal<PausedLoadingOrder[]>([]);
  readonly showPauseDialog = signal(false);
  readonly pausing = signal(false);
  readonly resumingId = signal<string | null>(null);
  /** OC en pausa que se retoma al terminar de pausar la actual (Retomar con una OC en curso). */
  readonly pendingResume = signal<PausedLoadingOrder | null>(null);
  pauseObservation = '';

  scanValue = '';
  private readonly scanQueue: string[] = [];
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  /** Sube con cada lectura propia: descarta una sincronización que salió antes y llega después. */
  private scanSeq = 0;
  private audioContext: AudioContext | null = null;

  // ============================================================
  //  DERIVADOS
  // ============================================================
  readonly progress = computed(() => this.order()?.progress ?? null);
  readonly isComplete = computed(() => {
    const p = this.progress();
    return !!p && p.requestedQty > 0 && p.pendingQty === 0;
  });
  readonly canPartialClose = computed(() => {
    const o = this.order();
    return !!o && o.allowPartialClose && o.progress.pickedQty > 0 && o.progress.pendingQty > 0;
  });
  readonly canClose = computed(() => this.order()?.status === 'IN_PICKING' && (this.isComplete() || this.canPartialClose()));
  readonly pendingItems = computed(() => (this.order()?.pickList ?? []).filter((i) => i.pendingQty > 0));
  /** Pendientes primero (en el orden del ERP) y completos al final. */
  readonly sortedPickList = computed(() => {
    const list = this.order()?.pickList ?? [];
    return [...list.filter((i) => i.pendingQty > 0), ...list.filter((i) => i.pendingQty === 0)];
  });
  readonly nextProduct = computed(() => this.nextItem()?.item?.product ?? this.pendingItems()[0]?.product ?? null);
  /** producto -> nombre del compañero que lo está leyendo ahora */
  readonly othersWorkingByProduct = computed(() => new Map((this.nextItem()?.othersWorking ?? []).map((o) => [o.product, o.name])));
  /** "Asignada: A, B" o "Cola libre" para el encabezado. */
  readonly assignmentLabel = computed(() => {
    const assigned = this.order()?.assignedTo ?? [];
    return assigned.length ? assigned.map((a) => a.name || a.userApp).join(', ') : 'Cola libre';
  });
  readonly canPause = computed(() => this.order()?.status === 'IN_PICKING' && !this.closeResult());
  readonly dialogOpen = computed(() => !!this.voidTarget() || this.showCloseDialog() || this.showPauseDialog());

  // ============================================================
  //  CICLO DE VIDA
  // ============================================================
  ngOnInit(): void {
    this.loadNextOrder();
    this.loadPausedOrders();
    this.syncTimer = setInterval(() => this.syncWithTeam(), SYNC_INTERVAL_MS);
  }

  ngOnDestroy(): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.scanQueue.length = 0;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.audioContext?.close().catch(() => undefined);
  }

  // ============================================================
  //  CARGA DE LA OC
  // ============================================================
  loadNextOrder(): void {
    this.loading.set(true);
    this.closeResult.set(null);
    this.lastScan.set(null);
    this.sessionReads.set(0);

    this.inventoryService
      .getNextLoadingOrder()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (res) => {
          this.order.set(res.data);
          this.noPendingOrders.set(false);
          this.refreshOrder();
          this.focusScan();
        },
        error: (err: HttpErrorResponse) => {
          this.order.set(null);
          this.recentReads.set([]);
          this.nextItem.set(null);
          if (err.status === 404) {
            this.noPendingOrders.set(true);
            return;
          }
          this.toastr.error(this.errorMessage(err, 'No se pudo consultar la cola de Órdenes de Cargue.'), 'Prealistamiento');
        }
      });
  }

  /** Recarga avance y lecturas desde el backend (fuente de verdad; útil con varios operarios). */
  refreshOrder(): void {
    const current = this.order();
    if (!current) return;

    const seq = this.scanSeq;
    this.inventoryService.getLoadingOrderDetail({ loadingOrderId: current._id, includeReads: true }).subscribe({
      next: (res) => {
        // Llegó una lectura propia mientras se consultaba: esta foto ya es vieja
        if (seq !== this.scanSeq || this.order()?._id !== current._id) return;
        const { reads, ...view } = res.data;

        // Un compañero pausó o cerró la OC: se avisa y se pasa a la siguiente que le toque
        if (!this.closeResult() && view.status !== 'PENDING' && view.status !== 'IN_PICKING') {
          const by = view.status === 'PAUSED' ? view.picking?.pausedBy : view.picking?.completedBy;
          const who = by?.name || by?.userApp;
          this.toastr.warning(`La OC ${view.loadingOrder} quedó ${this.statusLabels[view.status].toLowerCase()}${who ? ' por ' + who : ''}.`, 'Prealistamiento');
          this.speak(`La orden de cargue ${Number(view.loadingOrder)} cambió de estado.`);
          this.scanQueue.length = 0;
          this.loadNextOrder();
          this.loadPausedOrders();
          return;
        }

        this.order.set(view);
        this.recentReads.set(
          (reads ?? [])
            .filter((r) => r.status === 'ACTIVE')
            .map((r) => this.toRecentRead(r, r.readBy?.name || r.readBy?.userApp || ''))
        );
        this.loadNextItem(false);
      },
      error: (err: Error) => this.toastr.error(err.message, 'Prealistamiento')
    });
  }

  private loadNextItem(speak: boolean): void {
    const current = this.order();
    if (!current) return;

    this.inventoryService.getNextPickItem(current._id).subscribe({
      next: (res) => {
        this.nextItem.set(res.data);
        if (speak) this.speak(res.data.speechText);
      },
      error: () => this.nextItem.set(null)
    });
  }

  // ============================================================
  //  LECTURA DE SERIALES
  // ============================================================
  onScanSubmit(): void {
    const serial = (this.scanValue || '').replace(/\D/g, '');
    this.scanValue = '';

    if (!serial) return;

    if (serial.length !== SERIAL_LENGTH) {
      this.showFeedback(false, 'Serial inválido', `Debe tener ${SERIAL_LENGTH} dígitos (se leyeron ${serial.length}).`, serial);
      return;
    }
    if (!this.order() || this.closeResult()) return;

    // Las pistolas disparan lecturas muy rápido: se procesan en cola, una a la vez.
    this.scanQueue.push(serial);
    this.processQueue();
  }

  private processQueue(): void {
    const current = this.order();
    if (this.processing() || !this.scanQueue.length || !current) return;

    const serial = this.scanQueue.shift() as string;
    this.processing.set(true);

    this.inventoryService
      .scanLoadingOrderSerial({ loadingOrderId: current._id, serial })
      .pipe(
        finalize(() => {
          this.processing.set(false);
          this.processQueue();
          this.focusScan();
        })
      )
      .subscribe({
        next: (res) => this.applyScanResult(serial, res.data as ScanSerialResult),
        error: (err: HttpErrorResponse) => {
          const body = err.error as ScanSerialResponse | null;
          if (err.status === 0) {
            this.showFeedback(false, 'Sin conexión', 'La lectura NO se guardó. Vuelva a leer el serial.', serial);
            return;
          }
          // El administrativo reasignó la OC a otro operario: se toma la siguiente que le toque
          if (err.status === 403) {
            this.showFeedback(false, 'OC reasignada', body?.msg || 'Esta OC ya no está asignada a usted.', serial);
            this.scanQueue.length = 0;
            this.loadNextOrder();
            this.loadPausedOrders();
            return;
          }
          const title = body?.rejectReason ? LOADING_ORDER_REJECT_LABELS[body.rejectReason] : 'Lectura rechazada';
          let detail = body?.msg || 'No se pudo registrar la lectura.';
          const extra = body?.data as { committedIn?: string } | undefined;
          if (extra?.committedIn) detail += ` (OC ${extra.committedIn})`;
          this.showFeedback(false, title, detail, serial);
          // Si la OC cambió de estado (ej. cerrada por otro), se sincroniza
          if (!body?.rejectReason) this.refreshOrder();
        }
      });
  }

  /** Sincroniza avance y lecturas del equipo (otros operarios en la misma OC). */
  private syncWithTeam(): void {
    const o = this.order();
    if (!o || this.closeResult() || this.processing() || this.scanQueue.length || this.dialogOpen()) return;
    if (o.status !== 'PENDING' && o.status !== 'IN_PICKING') return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    this.refreshOrder();
  }

  private applyScanResult(serial: string, result: ScanSerialResult): void {
    this.scanSeq++;
    this.order.update((o) => {
      if (!o) return o;
      const pickList = o.pickList.map((i) => (i.product === result.productProgress.product ? result.productProgress : i));
      return { ...o, status: 'IN_PICKING', progress: result.orderProgress, pickList };
    });

    // Todas las lecturas activas de la OC: el operario valida el cargue completo
    this.recentReads.update((list) => [this.toRecentRead(result.read, 'Yo'), ...list]);
    this.sessionReads.update((n) => n + 1);

    const name = result.read.reference || result.read.product;
    const pp = result.productProgress;
    this.showFeedback(true, name, `${pp.pickedQty} de ${pp.requestedQty} · Aut. ${result.read.prefix}-${result.read.authorization}`, serial);

    if (result.isOrderComplete) {
      this.toastr.success('Todas las unidades fueron alistadas. Confirme el cierre del prealistamiento.', 'OC completa');
      this.loadNextItem(true);
    } else if (result.isProductComplete) {
      this.toastr.info(`${name} completo.`, 'Producto alistado');
      this.loadNextItem(true);
    }
  }

  private toRecentRead(r: ScanSerialResult['read'] | LoadingOrderRead, readByName: string): RecentRead {
    return {
      _id: r._id,
      serial: r.serial,
      product: r.product,
      reference: r.reference,
      productName: r.productName,
      prefix: r.prefix,
      authorization: r.authorization,
      readAt: r.readAt,
      readByName
    };
  }

  // ============================================================
  //  ANULACIÓN
  // ============================================================
  openVoid(read: RecentRead): void {
    this.voidObservation = '';
    this.voidTarget.set(read);
  }

  cancelVoid(): void {
    this.voidTarget.set(null);
    this.focusScan();
  }

  confirmVoid(): void {
    const target = this.voidTarget();
    const observation = this.voidObservation.trim();
    if (!target) return;
    if (observation.length < 5) {
      this.toastr.warning('Indique el motivo de la anulación (mínimo 5 caracteres).', 'Anular lectura');
      return;
    }

    this.voiding.set(true);
    this.inventoryService
      .voidLoadingOrderRead({ readId: target._id, observation })
      .pipe(finalize(() => this.voiding.set(false)))
      .subscribe({
        next: (res) => {
          this.toastr.success(res.msg || 'Lectura anulada.', 'Anular lectura');
          this.voidTarget.set(null);
          this.refreshOrder();
          this.focusScan();
        },
        error: (err: Error) => this.toastr.error(err.message, 'Anular lectura')
      });
  }

  // ============================================================
  //  CIERRE
  // ============================================================
  openClose(): void {
    if (!this.canClose()) return;
    this.closeObservation = '';
    this.showCloseDialog.set(true);
  }

  cancelClose(): void {
    this.showCloseDialog.set(false);
    this.focusScan();
  }

  confirmClose(): void {
    const current = this.order();
    if (!current) return;

    const partial = !this.isComplete();
    const observation = this.closeObservation.trim();
    if (partial && observation.length < 5) {
      this.toastr.warning('El cierre parcial requiere el motivo (mínimo 5 caracteres).', 'Cierre parcial');
      return;
    }

    this.closing.set(true);
    this.inventoryService
      .completeLoadingOrderPicking({ loadingOrderId: current._id, ...(partial ? { observation } : {}) })
      .pipe(finalize(() => this.closing.set(false)))
      .subscribe({
        next: (res) => {
          const result = res.data as CompletePickingResult;
          this.showCloseDialog.set(false);
          this.closeResult.set(result);
          this.order.update((o) => (o ? { ...o, status: result.status } : o));
          this.toastr.success(res.msg, 'Prealistamiento');
          this.speak(partial ? 'Cierre parcial registrado.' : 'Prealistamiento completo.');
        },
        error: (err: HttpErrorResponse) => {
          const body = err.error as CompletePickingResponse | null;
          this.toastr.error(body?.msg || 'No se pudo cerrar el prealistamiento.', 'Prealistamiento');
          this.refreshOrder();
        }
      });
  }

  // ============================================================
  //  PAUSA / REANUDACIÓN
  // ============================================================
  loadPausedOrders(): void {
    this.inventoryService.getPausedLoadingOrders().subscribe({
      next: (res) => this.pausedOrders.set(res.data ?? []),
      error: () => this.pausedOrders.set([])
    });
  }

  openPause(): void {
    if (!this.canPause()) return;
    this.pendingResume.set(null);
    this.pauseObservation = '';
    this.showPauseDialog.set(true);
  }

  cancelPause(): void {
    this.showPauseDialog.set(false);
    this.pendingResume.set(null);
    this.focusScan();
  }

  confirmPause(): void {
    const current = this.order();
    const observation = this.pauseObservation.trim();
    if (!current) return;
    if (observation.length < 5) {
      this.toastr.warning('Indique el motivo de la pausa (mínimo 5 caracteres).', 'Pausar OC');
      return;
    }

    this.pausing.set(true);
    this.inventoryService
      .pauseLoadingOrderPicking({ loadingOrderId: current._id, observation })
      .pipe(finalize(() => this.pausing.set(false)))
      .subscribe({
        next: (res) => {
          this.toastr.success(res.msg || 'OC en pausa.', 'Pausar OC');
          this.showPauseDialog.set(false);
          this.speak(`Orden de cargue ${Number(current.loadingOrder)} en pausa.`);
          const target = this.pendingResume();
          this.pendingResume.set(null);
          if (target) {
            this.resumeOrder(target);
          } else {
            this.loadNextOrder();
            this.loadPausedOrders();
          }
        },
        error: (err: Error) => {
          this.toastr.error(err.message, 'Pausar OC');
          this.refreshOrder();
        }
      });
  }

  /**
   * Retoma una OC en pausa. Si hay otra OC en prealistamiento en pantalla, primero se pausa esa
   * (pide el motivo) para no dejar dos OC abiertas a la vez.
   */
  requestResume(target: PausedLoadingOrder): void {
    if (this.resumingId()) return;
    const current = this.order();
    if (current && current.status === 'IN_PICKING' && !this.closeResult()) {
      this.pendingResume.set(target);
      this.pauseObservation = `Pausada para retomar la OC ${target.loadingOrder}`;
      this.showPauseDialog.set(true);
      return;
    }
    this.resumeOrder(target);
  }

  private resumeOrder(target: PausedLoadingOrder): void {
    this.resumingId.set(target._id);
    this.inventoryService
      .resumeLoadingOrderPicking(target._id)
      .pipe(finalize(() => this.resumingId.set(null)))
      .subscribe({
        next: (res) => {
          this.closeResult.set(null);
          this.lastScan.set(null);
          this.sessionReads.set(0);
          this.noPendingOrders.set(false);
          this.order.set(res.data);
          this.refreshOrder();
          this.loadPausedOrders();
          this.toastr.success(`OC ${target.loadingOrder} retomada con ${target.progress.pickedQty} unidades ya leídas.`, 'Retomar OC');
          this.speak(`Orden de cargue ${Number(target.loadingOrder)} retomada.`);
          this.focusScan();
        },
        error: (err: Error) => {
          this.toastr.error(err.message, 'Retomar OC');
          this.loadPausedOrders();
          this.loadNextOrder();
        }
      });
  }

  // ============================================================
  //  VOZ Y SONIDO
  // ============================================================
  toggleVoice(): void {
    const enabled = !this.voiceEnabled();
    this.voiceEnabled.set(enabled);
    try {
      localStorage.setItem(VOICE_STORAGE_KEY, enabled ? '1' : '0');
    } catch {
      /* preferencia local opcional */
    }
    if (enabled) this.speak(this.nextItem()?.speechText || 'Guía por voz activada.');
    this.focusScan();
  }

  speakNextItem(): void {
    this.loadNextItem(true);
    this.focusScan();
  }

  private readVoicePreference(): boolean {
    try {
      return localStorage.getItem(VOICE_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  private speak(text: string): void {
    if (!this.voiceEnabled() || !text || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-CO';
    utterance.rate = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  /** Tono corto: agudo = lectura válida, grave doble = rechazo. */
  private beep(ok: boolean): void {
    try {
      this.audioContext ??= new AudioContext();
      const ctx = this.audioContext;
      const tones = ok ? [880] : [220, 220];
      tones.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = ctx.currentTime + i * 0.18;
        osc.type = ok ? 'sine' : 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.15, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.15);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.15);
      });
    } catch {
      /* el navegador puede bloquear el audio: la retroalimentación visual es suficiente */
    }
  }

  private showFeedback(ok: boolean, title: string, detail: string, serial: string): void {
    this.lastScan.set({ ok, title, detail, serial });
    this.beep(ok);
    if (!ok) this.speak(title);
  }

  // ============================================================
  //  UTILIDADES DE VISTA
  // ============================================================
  /** Mantiene el foco en el lector (la pistola escribe en el campo con foco). */
  focusScan(): void {
    setTimeout(() => {
      if (!this.dialogOpen() && this.order() && !this.closeResult()) {
        this.scanInput?.nativeElement.focus();
      }
    });
  }

  percent(item: LoadingOrderPickItem): number {
    return item.requestedQty ? Math.round((item.pickedQty / item.requestedQty) * 100) : 0;
  }

  private errorMessage(err: HttpErrorResponse, fallback: string): string {
    return (err.error as { msg?: string } | null)?.msg || fallback;
  }
}
