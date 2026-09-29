// src/app/theme/layout/admin/navigation/ongoing-stops/ongoing-stops.component.ts
import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { merge, Subscription } from 'rxjs';
import { ProductionNews } from '../../../../../interfaces/assembly.interface';
import { NewsServices } from '../../../../../services/news-services';
import { SocketService } from '../../../../../services/socket-service';
import { displayArea } from '../area-display.util';
import { Time24Directive } from '../time-24.directive';
import {
  formatDurationLabel,
  formatStopTotal,
  isoToDdMmYyyy,
  minutesBetween,
  parseStopMoment,
  stopStartMoment,
  toHHmm,
  toIsoDate
} from '../stop-time.util';

/** Tolerancia (min) para relojes levemente adelantados; igual a la del backend. */
const FUTURE_TOLERANCE_MINUTES = 5;
/** Cada cuánto se refresca el contador de tiempo transcurrido. */
const CLOCK_TICK_MS = 30_000;

/**
 * Panel global de paradas EN CURSO (reportadas sin hora de fin) con el modal para
 * registrar su fin. Se muestra solo si hay paradas abiertas en el área.
 *
 * Uso: <app-ongoing-stops [area]="'Ensamble'" (finished)="onStopFinished($event)" />
 * Desde el padre también se puede abrir el modal con openFinish(news) vía @ViewChild.
 */
@Component({
  selector: 'app-ongoing-stops',
  standalone: true,
  imports: [CommonModule, FormsModule, Time24Directive],
  templateUrl: './ongoing-stops.component.html',
  styleUrls: ['./ongoing-stops.component.scss']
})
export class OngoingStopsComponent implements OnInit, OnChanges, OnDestroy {
  /** Área o subárea a consultar (mismo scope que la consulta de novedades). */
  @Input() area: string = '';
  /** Emite la novedad actualizada cuando se registra el fin de una parada. */
  @Output() finished = new EventEmitter<ProductionNews>();

  private newsServices = inject(NewsServices);
  private socketService = inject(SocketService);
  private toastr = inject(ToastrService);

  stops: ProductionNews[] = [];
  now: Date = new Date();
  isLoading = false;

  // Modal de finalización
  finishTarget: ProductionNews | null = null;
  /** 'now': terminó en este momento (1 clic). 'other': se digita la fecha/hora real del fin. */
  finishMode: 'now' | 'other' = 'now';
  finishDate = '';
  finishTime = '';
  finishNote = '';
  isFinishing = false;

  private clockTimer: ReturnType<typeof setInterval> | null = null;
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;
  private socketSub: Subscription | null = null;

  ngOnInit(): void {
    this.clockTimer = setInterval(() => (this.now = new Date()), CLOCK_TICK_MS);

    // Cualquier cambio de novedades en tiempo real puede abrir/cerrar paradas del área.
    this.socketSub = merge(
      this.socketService.productionNewsCreated$,
      this.socketService.productionNewsRedirected$,
      this.socketService.productionNewsClosed$,
      this.socketService.productionNewsStopFinished$
    ).subscribe(() => this.scheduleReload());
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['area']) this.refresh();
  }

  ngOnDestroy(): void {
    if (this.clockTimer) clearInterval(this.clockTimer);
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    this.socketSub?.unsubscribe();
  }

  /** Recarga la lista de paradas en curso (p.ej. tras registrar una nueva). */
  refresh(): void {
    if (!this.area) {
      this.stops = [];
      return;
    }
    this.isLoading = true;
    this.newsServices.getOngoingStops(this.area).subscribe({
      next: (res) => {
        this.stops = res.msg;
        this.now = new Date();
      },
      error: (err) => {
        console.error('Error consultando paradas en curso:', err);
        this.isLoading = false;
      },
      complete: () => (this.isLoading = false)
    });
  }

  private scheduleReload(): void {
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => this.refresh(), 400);
  }

  // ============================================================
  //  PRESENTACIÓN
  // ============================================================

  elapsedLabel(item: ProductionNews): string {
    const start = stopStartMoment(item);
    return start ? formatDurationLabel(minutesBetween(start, this.now)) : '—';
  }

  startLabel(item: ProductionNews): string {
    return `${(item.newsDate || '').slice(0, 5)} ${item.stop?.startTime || ''}`.trim();
  }

  machineLabel(item: ProductionNews): string {
    const code = item.origin?.machineCode;
    const name = item.origin?.machineName;
    if (code && name) return `${code} — ${name}`;
    return code || name || 'Sin máquina registrada';
  }

  originLabel(item: ProductionNews): string {
    return [displayArea(item.origin?.area), item.origin?.subArea, item.origin?.location]
      .filter((v): v is string => !!v)
      .join(' / ');
  }

  trackById(_: number, item: ProductionNews): string {
    return item._id;
  }

  // ============================================================
  //  MODAL: FINALIZAR PARADA
  // ============================================================

  /** Abre el modal con fecha/hora de fin = ahora (el caso más común). */
  openFinish(item: ProductionNews): void {
    this.finishTarget = item;
    this.finishNote = '';
    this.selectFinishMode('now');
  }

  /**
   * 'now' toma la fecha/hora actual. 'other' deja la hora vacía para que el usuario
   * digite la hora real en que se resolvió (p.ej. 22:00), con la fecha de hoy por defecto.
   */
  selectFinishMode(mode: 'now' | 'other'): void {
    if (this.isFinishing) return;
    this.finishMode = mode;
    if (mode === 'now') {
      this.setFinishNow();
    } else {
      this.finishDate = toIsoDate(new Date());
      this.finishTime = '';
      setTimeout(() => document.getElementById('finishTime')?.focus());
    }
  }

  /** Atajos de fecha para el modo 'other': 0 = hoy, 1 = ayer. */
  setFinishDaysAgo(daysAgo: number): void {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    this.finishDate = toIsoDate(date);
  }

  isFinishDaysAgo(daysAgo: number): boolean {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return this.finishDate === toIsoDate(date);
  }

  /** Hora actual para mostrar en la opción "Ahora". */
  get nowLabel(): string {
    return toHHmm(this.now);
  }

  closeFinish(): void {
    if (this.isFinishing) return;
    this.finishTarget = null;
  }

  setFinishNow(): void {
    const now = new Date();
    this.now = now;
    this.finishDate = toIsoDate(now);
    this.finishTime = toHHmm(now);
  }

  private get finishEnd(): Date | null {
    return parseStopMoment(isoToDdMmYyyy(this.finishDate), this.finishTime);
  }

  private get finishStart(): Date | null {
    return this.finishTarget ? stopStartMoment(this.finishTarget) : null;
  }

  /** Mensaje de validación del fin ('' si es válido). */
  get finishError(): string {
    const start = this.finishStart;
    const end = this.finishEnd;
    if (!start) return 'La parada no tiene una hora de inicio válida.';
    if (!end) {
      // Mientras el usuario escribe no se muestra error; solo si la hora completa es inválida.
      if (!this.finishDate) return 'Seleccione la fecha en que terminó la parada.';
      return this.finishTime.length >= 5 ? 'Hora no válida. Use formato 24h, por ejemplo 22:00.' : '';
    }
    if (end <= start) return `El fin debe ser posterior al inicio (${this.startLabel(this.finishTarget!)}).`;
    if (minutesBetween(new Date(), end) > FUTURE_TOLERANCE_MINUTES) {
      return this.isFinishDaysAgo(0)
        ? 'Esa hora aún no ha llegado hoy. Si terminó ayer, pulse «Ayer».'
        : 'La fecha/hora de fin no puede estar en el futuro.';
    }
    return '';
  }

  /** Se puede confirmar cuando hay un fin completo y válido. */
  get canConfirmFinish(): boolean {
    return !!this.finishEnd && !this.finishError && !this.isFinishing;
  }

  /** Vista previa del total ('32h 50m · 32:50'). */
  get finishPreview(): string {
    const start = this.finishStart;
    const end = this.finishEnd;
    if (!start || !end || end <= start) return '—';
    const minutes = minutesBetween(start, end);
    return `${formatDurationLabel(minutes)} · ${formatStopTotal(minutes)}`;
  }

  confirmFinish(): void {
    const target = this.finishTarget;
    if (!target || this.isFinishing) return;
    // En modo "Ahora" se toma la hora exacta del clic de confirmación.
    if (this.finishMode === 'now') this.setFinishNow();
    if (!this.canConfirmFinish) {
      this.toastr.warning(this.finishError || 'Indique la hora en que terminó la parada (24h).', 'Atención');
      return;
    }

    this.isFinishing = true;
    this.newsServices
      .finishStop({
        newsId: target._id,
        endDate: isoToDdMmYyyy(this.finishDate),
        endTime: this.finishTime,
        observation: this.finishNote.trim()
      })
      .subscribe({
        next: (res) => {
          this.isFinishing = false;
          if (!res?.ok) {
            this.toastr.error(res?.msg || 'No se pudo finalizar la parada.', 'Error');
            return;
          }
          this.toastr.success(res.msg, 'Parada finalizada');
          this.stops = this.stops.filter((s) => s._id !== target._id);
          this.finishTarget = null;
          if (res.data) this.finished.emit(res.data);
        },
        error: (err: Error) => {
          this.isFinishing = false;
          this.toastr.error(err.message || 'Error al finalizar la parada.', 'Error');
        }
      });
  }
}
