// src/app/warehouse/external/external-entry/external-entry.ts
//
// Importaciones / Externos > Ingreso. El operario lee con la pistola el GS1-128 del producto
// (campanas, dispensadores, productos de terceros): el largo cambia según el proveedor y NO se
// bloquea por eso; el backend identifica el producto por GTIN. Un GTIN desconocido entra como
// "no identificado" y se completa en el Catálogo.
//
// Offline-first (mismo patrón que Prealistamiento): cada lectura entra a una cola en
// localStorage y se envía en orden; si se cae el wifi se reintenta sola.
// Pistola keyboard-wedge: NO inputmode="none" ni preventDefault por carácter; solo Enter o un
// breve silencio al terminar de escribir.
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { finalize, timeout } from 'rxjs';

import { ExternalProductsService } from '../../../services/external-products.service';
import {
  EXTERNAL_ENTRY_REJECT_LABELS,
  ExternalApiResponse,
  ExternalEntryRejectReason,
  ExternalEntryResult
} from '../../../interfaces/external-products.interface';
import { parseGs1Barcode } from '../../../shared/utils/gs1-barcode.util';

const PENDING_STORAGE_KEY = 'externalEntry.pendingScans.v1';
const SESSION_STORAGE_KEY = 'externalEntry.session.v1';
const REFERENCE_STORAGE_KEY = 'externalEntry.entryReference.v1';
/** La pistola escribe el código en pocos ms: tras este silencio se envía sola (sin Enter). */
const AUTO_SUBMIT_DELAY_MS = 250;
/** Largo mínimo para intentar el envío automático ('01' + GTIN-13 + '21' + serial corto). */
const AUTO_SUBMIT_MIN_LENGTH = 22;
const REQUEST_TIMEOUT_MS = 20000;
const RETRY_INTERVAL_MS = 5000;
const MAX_SERVER_ERROR_ATTEMPTS = 5;
const MAX_SESSION_ITEMS = 300;

interface PendingEntry {
  id: string;
  raw: string;
  barcode: string;
  entryReference: string;
  queuedAt: string;
  attempts: number;
}

interface SessionEntry {
  unitId: string;
  barcode: string;
  serial: string;
  reference: string;
  productName: string;
  identified: boolean;
  enteredAt: string;
  voided?: boolean;
}

interface ScanFeedback {
  kind: 'ok' | 'warn' | 'error' | 'queued';
  title: string;
  detail: string;
  code: string;
}

@Component({
  selector: 'app-external-entry',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './external-entry.html',
  styleUrl: './external-entry.scss'
})
export class ExternalEntry implements OnInit, OnDestroy {
  private readonly externalService = inject(ExternalProductsService);
  private readonly toastr = inject(ToastrService);

  @ViewChild('scanInput') private scanInput?: ElementRef<HTMLInputElement>;

  readonly pending = signal<PendingEntry[]>(this.readStorage<PendingEntry[]>(PENDING_STORAGE_KEY, []));
  readonly session = signal<SessionEntry[]>(this.readTodaySession());
  readonly lastScan = signal<ScanFeedback | null>(null);
  readonly processing = signal(false);
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  readonly connectionIssue = signal(false);

  entryReference = this.readStorage<string>(REFERENCE_STORAGE_KEY, '');

  // Anulación
  readonly voidTarget = signal<SessionEntry | null>(null);
  readonly voiding = signal(false);
  voidObservation = '';

  readonly activeSession = computed(() => this.session().filter((s) => !s.voided));
  readonly unidentifiedCount = computed(() => this.activeSession().filter((s) => !s.identified).length);
  /** Conteo de la sesión por producto (lo que el operario va recibiendo). */
  readonly sessionByProduct = computed(() => {
    const map = new Map<string, { reference: string; productName: string; identified: boolean; qty: number }>();
    for (const s of this.activeSession()) {
      const key = s.identified ? s.reference : `?${s.barcode.substring(2, 16)}`;
      const row = map.get(key) || {
        reference: s.identified ? s.reference : `GTIN ${s.barcode.substring(2, 16)}`,
        productName: s.productName,
        identified: s.identified,
        qty: 0
      };
      row.qty++;
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.qty - a.qty);
  });

  private autoSubmitTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setInterval> | null = null;
  private audioContext?: AudioContext;

  ngOnInit(): void {
    this.retryTimer = setInterval(() => this.processQueue(), RETRY_INTERVAL_MS);
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onOnline);
      window.addEventListener('offline', this.onOffline);
      window.addEventListener('beforeunload', this.onBeforeUnload);
    }
    this.processQueue();
    this.focusScan();
  }

  ngOnDestroy(): void {
    if (this.retryTimer) clearInterval(this.retryTimer);
    if (this.autoSubmitTimer) clearTimeout(this.autoSubmitTimer);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onOnline);
      window.removeEventListener('offline', this.onOffline);
      window.removeEventListener('beforeunload', this.onBeforeUnload);
    }
  }

  // ============================================================
  //  LECTURA
  // ============================================================
  onScanInput(): void {
    if (this.autoSubmitTimer) clearTimeout(this.autoSubmitTimer);
    const value = this.scanInput?.nativeElement.value || '';
    if (value.replace(/[()\s]/g, '').length >= AUTO_SUBMIT_MIN_LENGTH) {
      this.autoSubmitTimer = setTimeout(() => this.onScanSubmit(), AUTO_SUBMIT_DELAY_MS);
    }
  }

  onScanSubmit(): void {
    if (this.autoSubmitTimer) clearTimeout(this.autoSubmitTimer);
    this.autoSubmitTimer = null;

    const input = this.scanInput?.nativeElement;
    const raw = (input?.value || '').trim();
    if (input) input.value = '';
    if (!raw) return;

    // Validación inmediata (el backend vuelve a validar): el EAN de la caja sin serial no se encola
    const parsed = parseGs1Barcode(raw);
    if (!parsed.ok) {
      this.showFeedback('error', parsed.code === 'NO_SERIAL' ? 'Código sin serial' : 'Código no reconocido', parsed.msg, raw);
      return;
    }
    const { barcode } = parsed.data;

    if (this.pending().some((p) => p.barcode === barcode)) {
      this.showFeedback('error', 'Lectura repetida', 'Este serial ya está guardado y pendiente por enviar.', barcode);
      return;
    }
    if (this.activeSession().some((s) => s.barcode === barcode)) {
      this.showFeedback('error', 'Ya ingresado', 'Este serial ya fue ingresado en esta sesión.', barcode);
      return;
    }

    this.setPending([
      ...this.pending(),
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        raw: raw.slice(0, 120),
        barcode,
        entryReference: this.entryReference.trim(),
        queuedAt: new Date().toISOString(),
        attempts: 0
      }
    ]);

    if (!this.online() || this.connectionIssue()) {
      this.showFeedback('queued', 'Lectura guardada en el equipo', 'Sin conexión: se enviará sola al volver el wifi.', barcode);
    }
    this.processQueue();
  }

  onReferenceChange(): void {
    this.writeStorage(REFERENCE_STORAGE_KEY, this.entryReference.trim());
  }

  focusScan(): void {
    setTimeout(() => {
      if (this.voidTarget()) return;
      const active = typeof document !== 'undefined' ? document.activeElement : null;
      // No robar el foco si el operario está escribiendo la referencia de ingreso
      if (active && active.id === 'entryReference') return;
      this.scanInput?.nativeElement.focus();
    }, 0);
  }

  // ============================================================
  //  COLA OFFLINE
  // ============================================================
  private processQueue(): void {
    if (this.processing()) return;
    const item = this.pending()[0];
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

    this.externalService
      .registerEntry({ barcode: item.raw, entryReference: item.entryReference })
      .pipe(
        timeout(REQUEST_TIMEOUT_MS),
        finalize(() => {
          this.processing.set(false);
          if (!retryLater) this.processQueue();
        })
      )
      .subscribe({
        next: (res) => {
          this.removePending(item.id);
          this.connectionIssue.set(false);
          this.online.set(true);
          this.applyResult(item, res.data, item.attempts > 0);
        },
        error: (err: unknown) => {
          const httpErr = err instanceof HttpErrorResponse ? err : null;
          const status = httpErr?.status ?? 0; // TimeoutError => 0 (red)
          const isNetwork = status === 0 || status === 408 || status === 429 || status === 502 || status === 503 || status === 504;
          const isServerError = status >= 500 && !isNetwork;

          if (isNetwork || (isServerError && item.attempts + 1 < MAX_SERVER_ERROR_ATTEMPTS)) {
            retryLater = true;
            this.updatePending(item.id, { attempts: item.attempts + 1 });
            this.connectionIssue.set(true);
            return;
          }

          this.removePending(item.id);
          this.connectionIssue.set(false);
          const body = httpErr?.error as ExternalApiResponse<unknown> | null;
          // Reintento tras timeout: el primer envío sí alcanzó a guardarse
          if (body?.rejectReason === 'ALREADY_ENTERED' && item.attempts > 0) {
            this.showFeedback('ok', 'Ingreso confirmado', 'La lectura ya estaba registrada (reintento).', item.barcode);
            return;
          }
          const reason = body?.rejectReason as ExternalEntryRejectReason | undefined;
          const title = reason && EXTERNAL_ENTRY_REJECT_LABELS[reason] ? EXTERNAL_ENTRY_REJECT_LABELS[reason] : 'Lectura rechazada';
          const extra = body?.data as { enteredAt?: string; enteredBy?: string } | undefined;
          const detail = `${body?.msg || 'No se pudo registrar el ingreso.'}${extra?.enteredAt ? ` (${extra.enteredAt} · ${extra.enteredBy})` : ''}`;
          if (item.attempts > 0) {
            this.toastr.warning(`${item.barcode}: ${title}.`, 'Lectura rechazada al sincronizar', { timeOut: 10000 });
          }
          this.showFeedback('error', title, detail, item.barcode);
        }
      });
  }

  private applyResult(item: PendingEntry, result: ExternalEntryResult, silent: boolean): void {
    const u = result.unit;
    this.setSession(
      [
        {
          unitId: u._id,
          barcode: u.barcode,
          serial: u.serial,
          reference: u.reference,
          productName: u.productName,
          identified: u.identified,
          enteredAt: u.enteredAt
        },
        ...this.session()
      ].slice(0, MAX_SESSION_ITEMS)
    );
    if (silent) return;

    if (!u.identified) {
      this.showFeedback('warn', 'Ingresado · producto NO identificado', result.warnings.join(' '), u.barcode);
      return;
    }
    const warnings = result.warnings.length ? ` · ${result.warnings.join(' ')}` : '';
    this.showFeedback(
      result.warnings.length ? 'warn' : 'ok',
      u.reference,
      `${u.productName || u.category}${u.client ? ` · ${u.client}` : ''} · En bodega: ${result.inStockForProduct}${warnings}`,
      u.barcode
    );
  }

  private readonly onOnline = (): void => {
    this.online.set(true);
    this.connectionIssue.set(false);
    this.processQueue();
  };

  private readonly onOffline = (): void => this.online.set(false);

  private readonly onBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (this.pending().length) event.preventDefault();
  };

  // ============================================================
  //  ANULACIÓN (lectura errada)
  // ============================================================
  openVoid(entry: SessionEntry): void {
    this.voidObservation = '';
    this.voidTarget.set(entry);
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
      this.toastr.warning('Indique el motivo (mínimo 5 caracteres).', 'Anular ingreso');
      return;
    }
    this.voiding.set(true);
    this.externalService
      .voidEntry(target.unitId, observation)
      .pipe(finalize(() => this.voiding.set(false)))
      .subscribe({
        next: () => {
          this.setSession(this.session().map((s) => (s.unitId === target.unitId ? { ...s, voided: true } : s)));
          this.toastr.success('Ingreso anulado. Puede volver a leer la unidad correcta.', 'Anular ingreso');
          this.cancelVoid();
        },
        error: (err: Error) => this.toastr.error(err.message, 'Anular ingreso')
      });
  }

  // ============================================================
  //  UTILIDADES
  // ============================================================
  private showFeedback(kind: ScanFeedback['kind'], title: string, detail: string, code: string): void {
    this.lastScan.set({ kind, title, detail, code });
    this.beep(kind === 'ok' || kind === 'queued');
    this.focusScan();
  }

  private setPending(list: PendingEntry[]): void {
    this.pending.set(list);
    this.writeStorage(PENDING_STORAGE_KEY, list);
  }

  private removePending(id: string): void {
    this.setPending(this.pending().filter((p) => p.id !== id));
  }

  private updatePending(id: string, changes: Partial<PendingEntry>): void {
    this.setPending(this.pending().map((p) => (p.id === id ? { ...p, ...changes } : p)));
  }

  private setSession(list: SessionEntry[]): void {
    this.session.set(list);
    this.writeStorage(SESSION_STORAGE_KEY, { day: this.today(), list });
  }

  /** La sesión (lo leído por este equipo) se reinicia cada día. */
  private readTodaySession(): SessionEntry[] {
    const stored = this.readStorage<{ day: string; list: SessionEntry[] } | null>(SESSION_STORAGE_KEY, null);
    return stored && stored.day === this.today() ? stored.list : [];
  }

  private today(): string {
    return new Date().toLocaleDateString('es-CO');
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
      this.toastr.error('No se pudo guardar la lectura en el equipo (almacenamiento lleno o bloqueado).', 'Ingreso externos');
    }
  }

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
