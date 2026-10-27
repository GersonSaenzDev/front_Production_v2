// src/app/warehouse/loading-order-picking/loading-order-picking.ts
//
// Prealistamiento de Órdenes de Cargue (operario). El operario NO elige la OC: toma primero las
// que el administrativo le asignó y, si no tiene, la siguiente de la cola libre (FIFO / prioridad). Cada lectura se guarda al instante en el
// backend, así el trabajo se puede pausar y retomar (otro día u otro operario) sin perder nada.
//
// Offline-first: cada lectura entra primero a una cola persistida en localStorage y se envía en orden,
// una a la vez. Si se cae el wifi la lectura NO se pierde: se reintenta sola al volver la conexión.
// Cerrar o pausar la OC queda bloqueado mientras haya lecturas de esa OC sin enviar.
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { finalize, timeout } from 'rxjs';

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
import { normalizeDispatchSerial } from '../../shared/utils/gs1-barcode.util';

const SERIAL_LENGTH = 27;
const VOICE_STORAGE_KEY = 'loadingOrderPicking.voice';
// Con varios operarios en la misma OC, el avance se sincroniza solo cada pocos segundos
const SYNC_INTERVAL_MS = 15000;
const PAUSE_REASONS = ['Atender OC prioritaria', 'Falta producto en bodega', 'Cambio de turno'];
const PENDING_SCANS_STORAGE_KEY = 'loadingOrderPicking.pendingScans.v1';
const SYNC_REJECTED_STORAGE_KEY = 'loadingOrderPicking.syncRejected.v1';
/** La pistola escribe los 27 dígitos en pocos ms: se espera este silencio antes de enviar (sin Enter). */
const AUTO_SUBMIT_DELAY_MS = 120;
/** Una petición colgada por wifi débil no puede frenar la cola: se corta y se reintenta. */
const SCAN_REQUEST_TIMEOUT_MS = 20000;
const RETRY_INTERVAL_MS = 5000;
/** Un error 500 persistente no puede bloquear la cola para siempre. */
const MAX_SERVER_ERROR_ATTEMPTS = 5;
const MAX_SYNC_REJECTED = 100;

/** Lectura guardada en el equipo, pendiente de enviar al backend. */
interface PendingScan {
  id: string;
  loadingOrderId: string;
  loadingOrder: string;
  serial: string;
  queuedAt: string;
  attempts: number;
}

/** Lectura que el backend rechazó DESPUÉS de leerla (se envió con retraso): el operario debe retirar la unidad. */
interface SyncRejectedScan {
  id: string;
  loadingOrder: string;
  serial: string;
  title: string;
  detail: string;
  rejectedAt: string;
}

type RecentRead = Pick<
  LoadingOrderRead,
  '_id' | 'serial' | 'product' | 'reference' | 'productName' | 'prefix' | 'authorization' | 'readAt'
> & {
  readByName: string;
};

interface ScanFeedback {
  ok: boolean;
  title: string;
  detail: string;
  serial: string;
  /** Guardada en el equipo, aún sin confirmar por el backend. */
  queued?: boolean;
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

  // Cola offline-first de lecturas
  readonly pendingScans = signal<PendingScan[]>(this.readStorage<PendingScan[]>(PENDING_SCANS_STORAGE_KEY, []));
  readonly syncRejected = signal<SyncRejectedScan[]>(this.readStorage<SyncRejectedScan[]>(SYNC_REJECTED_STORAGE_KEY, []));
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  /** El último envío falló por red/timeout: la cola espera el próximo reintento. */
  readonly connectionIssue = signal(false);

  private autoSubmitTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setInterval> | null = null;
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
  /** Lecturas de la OC en pantalla que aún no confirma el backend. */
  readonly pendingForOrder = computed(() => {
    const id = this.order()?._id;
    return id ? this.pendingScans().filter((p) => p.loadingOrderId === id).length : 0;
  });
  /** Avance y cierre solo son confiables con todas las lecturas de la OC en el servidor. */
  readonly orderSynced = computed(() => this.pendingForOrder() === 0);
  readonly canClose = computed(
    () => this.order()?.status === 'IN_PICKING' && this.orderSynced() && (this.isComplete() || this.canPartialClose())
  );
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
  readonly canPause = computed(() => this.order()?.status === 'IN_PICKING' && !this.closeResult() && this.orderSynced());
  readonly dialogOpen = computed(() => !!this.voidTarget() || this.showCloseDialog() || this.showPauseDialog());

  // ============================================================
  //  CICLO DE VIDA
  // ============================================================
  ngOnInit(): void {
    this.loadNextOrder();
    this.loadPausedOrders();
    this.syncTimer = setInterval(() => this.syncWithTeam(), SYNC_INTERVAL_MS);
    this.retryTimer = setInterval(() => this.processQueue(), RETRY_INTERVAL_MS);
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onOnline);
      window.addEventListener('offline', this.onOffline);
      window.addEventListener('focus', this.onFocus);
      window.addEventListener('beforeunload', this.onBeforeUnload);
    }
    // Lecturas que quedaron guardadas en el equipo (wifi caído, recarga, cambio de pantalla)
    this.processQueue();
  }

  ngOnDestroy(): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    if (this.retryTimer) clearInterval(this.retryTimer);
    if (this.autoSubmitTimer) clearTimeout(this.autoSubmitTimer);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onOnline);
      window.removeEventListener('offline', this.onOffline);
      window.removeEventListener('focus', this.onFocus);
      window.removeEventListener('beforeunload', this.onBeforeUnload);
    }
    // La cola NO se borra: sigue en localStorage y se envía al volver a la pantalla
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
          this.toastr.warning(
            `La OC ${view.loadingOrder} quedó ${this.statusLabels[view.status].toLowerCase()}${who ? ' por ' + who : ''}.`,
            'Prealistamiento'
          );
          this.speak(`La orden de cargue ${Number(view.loadingOrder)} cambió de estado.`);
          // Las lecturas de esa OC que sigan en cola se envían igual: si el backend las rechaza
          // quedan en "Rechazadas al sincronizar" para que el operario retire esas unidades.
          this.loadNextOrder();
          this.loadPausedOrders();
          return;
        }

        this.order.set(view);
        this.recentReads.set(
          (reads ?? []).filter((r) => r.status === 'ACTIVE').map((r) => this.toRecentRead(r, r.readBy?.name || r.readBy?.userApp || ''))
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
  /**
   * La pistola no siempre envía Enter: al completar los 27 dígitos se envía sola tras un breve
   * silencio (si siguen llegando caracteres, el código era más largo y se valida como inválido).
   * No se intercepta ningún carácter: solo se lee el valor completo del campo.
   */
  onScanInput(): void {
    if (this.autoSubmitTimer) clearTimeout(this.autoSubmitTimer);
    const digits = (this.scanInput?.nativeElement.value || '').replace(/\D/g, '');
    // Externos con GTIN-13 llegan en 26 dígitos; si siguen llegando caracteres el timer se reinicia
    if (digits.length >= SERIAL_LENGTH - 1) {
      this.autoSubmitTimer = setTimeout(() => this.onScanSubmit(), AUTO_SUBMIT_DELAY_MS);
    }
  }

  onScanSubmit(): void {
    if (this.autoSubmitTimer) clearTimeout(this.autoSubmitTimer);
    this.autoSubmitTimer = null;

    const input = this.scanInput?.nativeElement;
    // Importaciones / Externos: GS1-128 con GTIN-13 (26 dígitos) -> forma canónica de 27
    const serial = normalizeDispatchSerial(input?.value || '');
    if (input) input.value = '';

    if (!serial) return;

    if (serial.length !== SERIAL_LENGTH) {
      this.showFeedback(false, 'Serial inválido', `Debe tener ${SERIAL_LENGTH} dígitos (se leyeron ${serial.length}).`, serial);
      return;
    }
    const current = this.order();
    if (!current || this.closeResult()) return;

    // Repetidos: se descartan aquí sin gastar una petición
    if (this.pendingScans().some((p) => p.loadingOrderId === current._id && p.serial === serial)) {
      this.showFeedback(false, 'Lectura repetida', 'Este serial ya está guardado y pendiente por enviar.', serial);
      return;
    }
    if (this.recentReads().some((r) => r.serial === serial)) {
      this.showFeedback(false, LOADING_ORDER_REJECT_LABELS.ALREADY_READ_IN_ORDER, 'Este serial ya está registrado en esta OC.', serial);
      return;
    }

    this.setPendingScans([
      ...this.pendingScans(),
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        loadingOrderId: current._id,
        loadingOrder: current.loadingOrder,
        serial,
        queuedAt: new Date().toISOString(),
        attempts: 0
      }
    ]);

    // Sin red la lectura queda en el equipo: se confirma al operario para que siga leyendo
    if (!this.online() || this.connectionIssue()) {
      this.showFeedback(true, 'Lectura guardada en el equipo', 'Sin conexión: se enviará sola al volver el wifi.', serial, true);
    }
    this.processQueue();
  }

  /**
   * Envía la cola en orden, una lectura a la vez (las pistolas leen más rápido que la red).
   * Error de red/timeout: la lectura se conserva y se reintenta. Rechazo del backend: se retira
   * de la cola y se avisa; si llegó con retraso queda además en "Rechazadas al sincronizar".
   */
  private processQueue(): void {
    if (this.processing()) return;
    const item = this.pendingScans()[0];
    if (!item) {
      this.connectionIssue.set(false);
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.online.set(false);
      return;
    }

    this.processing.set(true);
    let retryLater = false;

    this.inventoryService
      .scanLoadingOrderSerial({ loadingOrderId: item.loadingOrderId, serial: item.serial })
      .pipe(
        timeout(SCAN_REQUEST_TIMEOUT_MS),
        finalize(() => {
          this.processing.set(false);
          // Tras un fallo de red se espera el reintento (timer / evento online) en vez de insistir en bucle
          if (!retryLater) this.processQueue();
          this.focusScan();
        })
      )
      .subscribe({
        next: (res) => {
          this.removePendingScan(item.id);
          this.connectionIssue.set(false);
          this.online.set(true);
          if (item.loadingOrderId === this.order()?._id) {
            this.applyScanResult(item.serial, res.data as ScanSerialResult, item.attempts > 0);
          }
        },
        error: (err: unknown) => {
          const httpErr = err instanceof HttpErrorResponse ? err : null;
          const status = httpErr?.status ?? 0; // TimeoutError => 0 (red)
          const isNetwork = status === 0 || status === 408 || status === 429 || status === 502 || status === 503 || status === 504;
          const isServerError = status >= 500 && !isNetwork;

          if (isNetwork || (isServerError && item.attempts + 1 < MAX_SERVER_ERROR_ATTEMPTS)) {
            retryLater = true;
            this.updatePendingScan(item.id, { attempts: item.attempts + 1 });
            this.connectionIssue.set(true);
            return;
          }

          this.removePendingScan(item.id);
          this.connectionIssue.set(false);
          this.handleScanRejection(item, status, httpErr?.error as ScanSerialResponse | null);
        }
      });
  }

  private handleScanRejection(item: PendingScan, status: number, body: ScanSerialResponse | null): void {
    const isCurrent = item.loadingOrderId === this.order()?._id;
    const delayed = item.attempts > 0 || !isCurrent;

    // Un reintento tras timeout: el primer envío sí alcanzó a guardarse en el servidor
    if (body?.rejectReason === 'ALREADY_READ_IN_ORDER' && item.attempts > 0) {
      if (isCurrent) this.refreshOrder();
      return;
    }

    let title: string;
    let detail: string;
    if (status === 403) {
      title = 'OC reasignada';
      detail = body?.msg || 'Esta OC ya no está asignada a usted.';
    } else if (status >= 500) {
      title = 'Error del servidor';
      detail = body?.msg || 'El servidor no pudo registrar la lectura.';
    } else {
      title = body?.rejectReason ? LOADING_ORDER_REJECT_LABELS[body.rejectReason] : 'Lectura rechazada';
      detail = body?.msg || 'No se pudo registrar la lectura.';
      const extra = body?.data as { committedIn?: string } | undefined;
      if (extra?.committedIn) detail += ` (OC ${extra.committedIn})`;
    }

    if (delayed) {
      this.addSyncRejected(item, title, detail);
      this.toastr.warning(
        `Serial ${item.serial} de la OC ${item.loadingOrder}: ${title}. Retire esa unidad.`,
        'Lectura rechazada al sincronizar',
        {
          timeOut: 10000
        }
      );
    }
    if (isCurrent || delayed) this.showFeedback(false, delayed ? `${title} (al sincronizar)` : title, detail, item.serial);

    if (!isCurrent) return;
    // El administrativo reasignó la OC a otro operario: se toma la siguiente que le toque
    if (status === 403) {
      this.loadNextOrder();
      this.loadPausedOrders();
      return;
    }
    // Si la OC cambió de estado (ej. cerrada por otro), se sincroniza
    if (!body?.rejectReason) this.refreshOrder();
  }

  /** Sincroniza avance y lecturas del equipo (otros operarios en la misma OC). */
  private syncWithTeam(): void {
    const o = this.order();
    if (!o || this.closeResult() || this.processing() || this.pendingForOrder() || this.dialogOpen()) return;
    if (!this.online() || this.connectionIssue()) return;
    if (o.status !== 'PENDING' && o.status !== 'IN_PICKING') return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    this.refreshOrder();
  }

  /** `silent`: lectura que llega con retraso (cola offline); no se anuncia una por una. */
  private applyScanResult(serial: string, result: ScanSerialResult, silent = false): void {
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
    if (!silent) {
      this.showFeedback(
        true,
        name,
        `${pp.pickedQty} de ${pp.requestedQty} · Aut. ${result.read.prefix}-${result.read.authorization}`,
        serial
      );
    }

    if (result.isOrderComplete) {
      this.toastr.success('Todas las unidades fueron alistadas. Confirme el cierre del prealistamiento.', 'OC completa');
      this.loadNextItem(true);
    } else if (result.isProductComplete) {
      this.toastr.info(`${name} completo.`, 'Producto alistado');
      this.loadNextItem(true);
    }
  }

  // ============================================================
  //  COLA OFFLINE (localStorage)
  // ============================================================
  private readonly onOnline = (): void => {
    this.online.set(true);
    this.connectionIssue.set(false);
    this.processQueue();
  };

  private readonly onOffline = (): void => this.online.set(false);

  private readonly onFocus = (): void => this.processQueue();

  /** Avisa antes de cerrar/recargar con lecturas sin enviar (no se pierden, pero quedan sin subir). */
  private readonly onBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (this.pendingScans().length) event.preventDefault();
  };

  clearSyncRejected(): void {
    this.setSyncRejected([]);
    this.focusScan();
  }

  private setPendingScans(list: PendingScan[]): void {
    this.pendingScans.set(list);
    this.writeStorage(PENDING_SCANS_STORAGE_KEY, list);
  }

  private removePendingScan(id: string): void {
    this.setPendingScans(this.pendingScans().filter((p) => p.id !== id));
  }

  private updatePendingScan(id: string, changes: Partial<PendingScan>): void {
    this.setPendingScans(this.pendingScans().map((p) => (p.id === id ? { ...p, ...changes } : p)));
  }

  private addSyncRejected(item: PendingScan, title: string, detail: string): void {
    const entry: SyncRejectedScan = {
      id: item.id,
      loadingOrder: item.loadingOrder,
      serial: item.serial,
      title,
      detail,
      rejectedAt: new Date().toISOString()
    };
    this.setSyncRejected([entry, ...this.syncRejected()].slice(0, MAX_SYNC_REJECTED));
  }

  private setSyncRejected(list: SyncRejectedScan[]): void {
    this.syncRejected.set(list);
    this.writeStorage(SYNC_REJECTED_STORAGE_KEY, list);
  }

  private readStorage<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  private writeStorage(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      this.toastr.error('No se pudo guardar la lectura en el equipo (almacenamiento lleno o bloqueado).', 'Prealistamiento');
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
    if (!this.orderSynced()) {
      this.toastr.warning(
        `Hay ${this.pendingForOrder()} lectura(s) sin enviar. Espere a que se sincronicen para cerrar.`,
        'Prealistamiento'
      );
      return;
    }
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
    if (!current || !this.orderSynced()) return;

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
    if (!this.orderSynced()) {
      this.toastr.warning(`Hay ${this.pendingForOrder()} lectura(s) sin enviar. Espere a que se sincronicen para pausar.`, 'Pausar OC');
      return;
    }
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

  private showFeedback(ok: boolean, title: string, detail: string, serial: string, queued = false): void {
    this.lastScan.set({ ok, title, detail, serial, queued });
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
