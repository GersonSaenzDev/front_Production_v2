// src/app/theme/layout/admin/navigation/work-order-acceptance/requester-acceptance.component.ts
//
// Componente GLOBAL (lado del ÁREA QUE GENERÓ LAS NOVEDADES). Se incluye en app-shared-news y
// app-shared-view-news, así que aparece en todos los módulos sin tocarlos uno a uno.
//
// Muestra las intervenciones de Mantenimiento y Mecánica que esperan la aceptación del
// solicitante:
//   - "Mías": las que debe aceptar el usuario logueado (es quien reportó la novedad).
//   - "Del área": las de su área/subárea (scope), para que el área vea cuántas tiene
//     pendientes aunque no sea quien las reportó (solo consulta).
// Solo el usuario que reportó la novedad puede aceptar y evaluar (1-5 + comentario); el
// backend lo valida con el documento del token. Calificación 1 reabre la solicitud.
// Si no hay nada pendiente, el componente no se muestra.
import { CommonModule } from '@angular/common';
import { Component, inject, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { Intervention, MaintenanceRequest } from '../../../../../interfaces/maintenance.interface';
import { MechanicsRequest } from '../../../../../interfaces/mechanics.interface';
import { AuthService } from '../../../../../services/auth-services';
import { MaintenanceServices } from '../../../../../services/maintenance-services';
import { MechanicsServices } from '../../../../../services/mechanics-services';
import { REQUESTER_RATING_OPTIONS, REQUESTER_REJECT_RATING, ratingStars } from './work-order.util';

type ServiceArea = 'MANTENIMIENTO' | 'MECANICA';

/** Vista normalizada de una solicitud pendiente de aceptación (Mantenimiento o Mecánica). */
interface PendingAcceptance {
  key: string;
  serviceArea: ServiceArea;
  id: string;
  consecutive: string;
  subject: string;
  description: string;
  origin: string;
  requesterName: string;
  sentAt: string;
  mine: boolean;
  interventions: Intervention[];
}

@Component({
  selector: 'app-requester-acceptance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './requester-acceptance.component.html',
  styleUrl: './requester-acceptance.component.scss'
})
export class RequesterAcceptanceComponent implements OnInit, OnChanges {
  private authService = inject(AuthService);
  private maintenanceService = inject(MaintenanceServices);
  private mechanicsService = inject(MechanicsServices);
  private toastr = inject(ToastrService);

  /** Área/subárea cuyas novedades se consultan (mismo scope del componente contenedor). */
  @Input() scope = '';

  readonly ratingOptions = REQUESTER_RATING_OPTIONS;
  readonly rejectRating = REQUESTER_REJECT_RATING;
  readonly ratingStars = ratingStars;

  items: PendingAcceptance[] = [];
  isLoading = false;
  expanded = true;

  // Modal de evaluación
  selected: PendingAcceptance | null = null;
  rating: number | null = null;
  comment = '';
  isSaving = false;

  ngOnInit(): void {
    this.load();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['scope'] && !changes['scope'].firstChange) this.load();
  }

  get mineCount(): number {
    return this.items.filter((i) => i.mine).length;
  }

  get areaCount(): number {
    return this.items.length;
  }

  load(): void {
    this.isLoading = true;
    // Cada área de servicio se consulta por separado: si una falla, la otra igual se muestra.
    forkJoin([
      this.fetch('MANTENIMIENTO', this.maintenanceService.getRequesterPending(this.scope)),
      this.fetch('MECANICA', this.mechanicsService.getRequesterPending(this.scope))
    ]).subscribe({
      next: ([mtto, mech]) => {
        // Primero las mías (son las que el usuario puede aceptar).
        this.items = [...mtto, ...mech].sort((a, b) => Number(b.mine) - Number(a.mine));
        this.isLoading = false;
      },
      error: () => (this.isLoading = false)
    });
  }

  private fetch(
    serviceArea: ServiceArea,
    request$: Observable<{
      ok: boolean;
      data: { mine: (MaintenanceRequest | MechanicsRequest)[]; area: (MaintenanceRequest | MechanicsRequest)[] };
    }>
  ): Observable<PendingAcceptance[]> {
    return request$.pipe(
      map((res) => {
        if (!res?.ok || !res.data) return [];
        const mineIds = new Set(res.data.mine.map((o) => String(o.id)));
        const byId = new Map<string, MaintenanceRequest | MechanicsRequest>();
        [...res.data.mine, ...res.data.area].forEach((o) => byId.set(String(o.id), o));
        return [...byId.values()].map((o) => this.toPending(serviceArea, o, mineIds.has(String(o.id))));
      }),
      catchError((err) => {
        console.error(`Error consultando aceptaciones pendientes (${serviceArea}):`, err);
        return of([]);
      })
    );
  }

  private toPending(serviceArea: ServiceArea, o: MaintenanceRequest | MechanicsRequest, mine: boolean): PendingAcceptance {
    const isMtto = serviceArea === 'MANTENIMIENTO';
    const mtto = o as MaintenanceRequest;
    const mech = o as MechanicsRequest;
    const subject = isMtto
      ? [mtto.machineCode, mtto.machineName].filter((v) => !!v).join(' — ')
      : [mech.toolCode, mech.toolName].filter((v) => !!v).join(' — ') ||
        [mech.machineCode, mech.machineName].filter((v) => !!v).join(' — ');
    return {
      key: `${serviceArea}-${o.id}`,
      serviceArea,
      id: String(o.id),
      consecutive: isMtto ? `MTTO #${mtto.consecutiveMtto}` : `SME #${mech.consecutiveSme}`,
      subject: subject || '—',
      description: o.description,
      origin: [o.requester?.originArea, o.requester?.originSubArea].filter((v) => !!v).join(' / '),
      requesterName: o.requester?.name || '',
      sentAt: o.dateUpdate || '',
      // El backend ya lo resuelve con el token; se reconfirma contra la sesión por seguridad visual.
      mine: mine && (!this.myUid || o.requester?.uid === this.myUid),
      interventions: (o.interventions || []).filter((i) => i.role !== 'AYUDANTE')
    };
  }

  private get myUid(): string {
    return this.authService.userData()?.uid || '';
  }

  serviceAreaLabel(area: ServiceArea): string {
    return area === 'MANTENIMIENTO' ? 'Mantenimiento' : 'Mecánica';
  }

  // ============================================================
  //  EVALUACIÓN
  // ============================================================

  openEvaluation(item: PendingAcceptance): void {
    if (!item.mine) return;
    this.selected = item;
    this.rating = null;
    this.comment = '';
  }

  closeEvaluation(): void {
    if (this.isSaving) return;
    this.selected = null;
  }

  submitEvaluation(): void {
    const item = this.selected;
    if (!item) return;
    if (!this.rating) {
      this.toastr.warning('Seleccione la calificación de 1 a 5.', 'Atención');
      return;
    }
    if (!this.comment.trim()) {
      this.toastr.warning('Ingrese un comentario sobre lo visto en la intervención.', 'Atención');
      return;
    }
    if (
      this.rating === REQUESTER_REJECT_RATING &&
      !confirm('Calificación 1 ("No funciona"): la solicitud se reabrirá para que el área vuelva a intervenir. ¿Continuar?')
    ) {
      return;
    }

    const payload = { rating: this.rating, comment: this.comment.trim() };
    const request$: Observable<{ ok: boolean; msg?: string }> =
      item.serviceArea === 'MANTENIMIENTO'
        ? this.maintenanceService.evaluateByRequester(item.id, payload)
        : this.mechanicsService.evaluateByRequester(item.id, payload);

    this.isSaving = true;
    request$.subscribe({
      next: (res) => {
        this.isSaving = false;
        if (!res?.ok) {
          this.toastr.error(res?.msg || 'No se pudo registrar la evaluación.', 'Error');
          return;
        }
        this.toastr.success(res.msg || 'Evaluación registrada.', this.serviceAreaLabel(item.serviceArea));
        this.selected = null;
        this.items = this.items.filter((i) => i.key !== item.key);
      },
      error: (err: Error) => {
        this.isSaving = false;
        this.toastr.error(err.message || 'Error al registrar la evaluación.', 'Error');
      }
    });
  }

  formatMinutes(minutes: number | null | undefined): string {
    if (minutes === null || minutes === undefined) return '—';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (!h) return `${m} min`;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
}
