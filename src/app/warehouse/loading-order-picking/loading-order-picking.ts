// src/app/warehouse/loading-order-picking/loading-order-picking.ts
//
// Prealistamiento de Órdenes de Cargue (operario). El operario NO elige la OC: toma la primera
// de la cola (FIFO / prioridad del administrativo). Cada lectura se guarda al instante en el
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
  ScanSerialResponse,
  ScanSerialResult
} from '../../interfaces/loading-order.interface';

const SERIAL_LENGTH = 27;
const RECENT_READS_LIMIT = 40;
const VOICE_STORAGE_KEY = 'loadingOrderPicking.voice';

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

  scanValue = '';
  private readonly scanQueue: string[] = [];
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
  readonly nextProduct = computed(() => this.pendingItems()[0]?.product ?? null);
  readonly dialogOpen = computed(() => !!this.voidTarget() || this.showCloseDialog());

  // ============================================================
  //  CICLO DE VIDA
  // ============================================================
  ngOnInit(): void {
    this.loadNextOrder();
  }

  ngOnDestroy(): void {
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

    this.inventoryService.getLoadingOrderDetail({ loadingOrderId: current._id, includeReads: true }).subscribe({
      next: (res) => {
        const { reads, ...view } = res.data;
        this.order.set(view);
        this.recentReads.set(
          (reads ?? [])
            .filter((r) => r.status === 'ACTIVE')
            .slice(0, RECENT_READS_LIMIT)
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

  private applyScanResult(serial: string, result: ScanSerialResult): void {
    this.order.update((o) => {
      if (!o) return o;
      const pickList = o.pickList.map((i) => (i.product === result.productProgress.product ? result.productProgress : i));
      return { ...o, status: 'IN_PICKING', progress: result.orderProgress, pickList };
    });

    this.recentReads.update((list) => [this.toRecentRead(result.read, 'Yo'), ...list].slice(0, RECENT_READS_LIMIT));
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
