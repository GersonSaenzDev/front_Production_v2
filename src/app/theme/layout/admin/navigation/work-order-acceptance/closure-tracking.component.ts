// src/app/theme/layout/admin/navigation/work-order-acceptance/closure-tracking.component.ts
//
// Componente GLOBAL de SEGUIMIENTO DEL CIERRE de las órdenes (Mantenimiento / Mecánica) que se
// generaron a partir de una novedad. Muestra las dos etapas que faltan para finalizar la
// intervención:
//   1) "Por aprobar del área": el área de servicio terminó y la envió; el área que reportó la
//      novedad aún no la aprueba ni la califica (1-5).
//   2) "Por cerrar": el área ya aprobó; falta que Mantenimiento / Mecánica la cierre (COMPLETADO).
//
// Modos:
//   - 'area'    : vista de novedades de un área (scope = área de origen). Muestra solo la etapa 2
//                 (la etapa 1 ya la cubre `app-requester-acceptance`, con la acción de aprobar).
//   - 'service' : vista de Mantenimiento / Mecánica (sin scope). Muestra ambas etapas y emite
//                 `open` para que el contenedor abra la orden y la cierre.
// Si no hay nada pendiente, el componente no se muestra.
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ClosureTrackingResponse, MaintenanceRequest } from '../../../../../interfaces/maintenance.interface';
import { MechanicsRequest } from '../../../../../interfaces/mechanics.interface';
import { MaintenanceServices } from '../../../../../services/maintenance-services';
import { MechanicsServices } from '../../../../../services/mechanics-services';
import { ServiceArea } from './requester-acceptance.component';
import { ratingStars } from './work-order.util';

type WorkOrder = MaintenanceRequest | MechanicsRequest;
type Stage = 'AWAITING_REQUESTER' | 'AWAITING_CLOSE';

/** Fila normalizada del seguimiento (Mantenimiento o Mecánica). */
export interface ClosureTrackingItem {
  key: string;
  stage: Stage;
  serviceArea: ServiceArea;
  id: string;
  consecutive: string;
  subject: string;
  description: string;
  origin: string;
  requesterName: string;
  /** Desde cuándo está en esta etapa (envío a aceptación o aprobación del área). */
  since: string;
  daysWaiting: number | null;
  rating: number | null;
  ratingLabel: string;
  ratingComment: string;
  approvedBy: string;
  approvedByBoss: boolean;
}

/** Evento para que el contenedor abra la orden (p. ej. para cerrarla). */
export interface ClosureTrackingOpenEvent {
  serviceArea: ServiceArea;
  id: string;
}

@Component({
  selector: 'app-closure-tracking',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './closure-tracking.component.html',
  styleUrl: './closure-tracking.component.scss'
})
export class ClosureTrackingComponent implements OnInit, OnChanges {
  private maintenanceService = inject(MaintenanceServices);
  private mechanicsService = inject(MechanicsServices);

  /** Área/subárea de origen (modo 'area'). Vacío = todas (modo 'service'). */
  @Input() scope = '';
  @Input() mode: 'area' | 'service' = 'area';
  /** Áreas de servicio a consultar. */
  @Input() serviceAreas: ServiceArea[] = ['MANTENIMIENTO', 'MECANICA'];

  /** Abrir la orden en el contenedor (solo tiene sentido en modo 'service'). */
  @Output() open = new EventEmitter<ClosureTrackingOpenEvent>();

  readonly ratingStars = ratingStars;

  awaitingRequester: ClosureTrackingItem[] = [];
  awaitingClose: ClosureTrackingItem[] = [];
  activeStage: Stage = 'AWAITING_CLOSE';
  isLoading = false;
  expanded = true;

  ngOnInit(): void {
    this.load();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const changed = ['scope', 'mode', 'serviceAreas'].some((k) => changes[k] && !changes[k].firstChange);
    if (changed) this.load();
  }

  get showRequesterStage(): boolean {
    return this.mode === 'service';
  }

  get hasItems(): boolean {
    return this.awaitingClose.length > 0 || (this.showRequesterStage && this.awaitingRequester.length > 0);
  }

  get visibleItems(): ClosureTrackingItem[] {
    if (!this.showRequesterStage) return this.awaitingClose;
    return this.activeStage === 'AWAITING_REQUESTER' ? this.awaitingRequester : this.awaitingClose;
  }

  get serviceLabel(): string {
    return this.serviceAreas.map((a) => this.serviceAreaLabel(a)).join(' / ');
  }

  load(): void {
    this.isLoading = true;
    // En modo área se filtra por el área de origen; en modo servicio se ven todas.
    const scope = this.mode === 'area' ? this.scope : '';
    if (this.mode === 'area' && !scope) {
      this.awaitingRequester = [];
      this.awaitingClose = [];
      this.isLoading = false;
      return;
    }

    const requests: Observable<ClosureTrackingItem[][]>[] = this.serviceAreas.map((area) =>
      area === 'MANTENIMIENTO'
        ? this.fetch('MANTENIMIENTO', this.maintenanceService.getClosureTracking(scope))
        : this.fetch('MECANICA', this.mechanicsService.getClosureTracking(scope))
    );

    forkJoin(requests.length ? requests : [of([[], []] as ClosureTrackingItem[][])]).subscribe({
      next: (results) => {
        // Más antiguas primero: son las que más tiempo llevan esperando.
        const bySince = (a: ClosureTrackingItem, b: ClosureTrackingItem) => (b.daysWaiting ?? -1) - (a.daysWaiting ?? -1);
        this.awaitingRequester = results.flatMap((r) => r[0]).sort(bySince);
        this.awaitingClose = results.flatMap((r) => r[1]).sort(bySince);
        if (this.showRequesterStage && !this.awaitingClose.length && this.awaitingRequester.length) {
          this.activeStage = 'AWAITING_REQUESTER';
        }
        this.isLoading = false;
      },
      error: () => (this.isLoading = false)
    });
  }

  private fetch(serviceArea: ServiceArea, request$: Observable<ClosureTrackingResponse<WorkOrder>>): Observable<ClosureTrackingItem[][]> {
    return request$.pipe(
      map((res) => {
        if (!res?.ok || !res.data) return [[], []];
        return [
          (res.data.awaitingRequester || []).map((o) => this.toItem(serviceArea, 'AWAITING_REQUESTER', o)),
          (res.data.awaitingClose || []).map((o) => this.toItem(serviceArea, 'AWAITING_CLOSE', o))
        ];
      }),
      catchError((err) => {
        console.error(`Error consultando el seguimiento de cierre (${serviceArea}):`, err);
        return of([[], []] as ClosureTrackingItem[][]);
      })
    );
  }

  private toItem(serviceArea: ServiceArea, stage: Stage, o: WorkOrder): ClosureTrackingItem {
    const isMtto = serviceArea === 'MANTENIMIENTO';
    const mtto = o as MaintenanceRequest;
    const mech = o as MechanicsRequest;
    const subject = isMtto
      ? [mtto.machineCode, mtto.machineName].filter((v) => !!v).join(' — ')
      : [mech.toolCode, mech.toolName].filter((v) => !!v).join(' — ') ||
        [mech.machineCode, mech.machineName].filter((v) => !!v).join(' — ');
    const approval = o.requesterApproval;
    const since = stage === 'AWAITING_CLOSE' ? approval?.approvedAt || o.dateUpdate || '' : o.dateUpdate || '';
    return {
      key: `${serviceArea}-${o.id}`,
      stage,
      serviceArea,
      id: String(o.id),
      consecutive: isMtto ? `MTTO #${mtto.consecutiveMtto}` : `SME #${mech.consecutiveSme}`,
      subject: subject || '—',
      description: o.description,
      origin: [o.requester?.originArea, o.requester?.originSubArea].filter((v) => !!v).join(' / '),
      requesterName: o.requester?.name || '',
      since,
      daysWaiting: daysSince(since),
      rating: approval?.rating ?? null,
      ratingLabel: approval?.ratingLabel || '',
      ratingComment: approval?.comment || '',
      approvedBy: approval?.approvedBy || '',
      approvedByBoss: approval?.approvedByRole === 'JEFE_AREA'
    };
  }

  setStage(stage: Stage): void {
    this.activeStage = stage;
    this.expanded = true;
  }

  serviceAreaLabel(area: ServiceArea): string {
    return area === 'MANTENIMIENTO' ? 'Mantenimiento' : 'Mecánica';
  }

  waitingLabel(days: number | null): string {
    if (days === null) return '—';
    if (days <= 0) return 'Hoy';
    return days === 1 ? '1 día' : `${days} días`;
  }

  onOpen(item: ClosureTrackingItem): void {
    this.open.emit({ serviceArea: item.serviceArea, id: item.id });
  }
}

/** Días completos desde una fecha del backend 'DD/MM/YYYY' o 'DD/MM/YYYY, HH:mm:ss'. */
function daysSince(value: string): number | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})/.exec((value || '').trim());
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - date.getTime()) / 86400000));
}
