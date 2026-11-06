// src/app/theme/layout/admin/navigation/news-thread/news-thread.component.ts
//
// Componente GLOBAL: la "conversación" completa de una novedad, visible en AMBAS direcciones:
//   - Respuestas de las áreas (observación, acción tomada, causa raíz).
//   - Lo que hizo Mantenimiento / Mecánica en cada orden (técnico, trabajo, notas, tiempos).
//   - Historial de aprobación del área (estrellas + comentario), incluidas las rondas rechazadas.
// Lo usan el detalle de la vista de novedades de las áreas (app-shared-view-news) y las
// pantallas de Mantenimiento y Mecánica, para que todos lean lo mismo.
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import {
  NewsResponseItem,
  NewsWorkOrderEvaluation,
  NewsWorkOrderSummary,
  ProductionNews
} from '../../../../../interfaces/assembly.interface';
import { DashboardServices } from '../../../../../services/dashboard-services';
import { ratingStars, workOrderStatusLabel } from '../work-order-acceptance/work-order.util';

/** Límites del mensaje administrativo (iguales al backend). */
const ADMIN_MESSAGE_MIN = 10;
const ADMIN_MESSAGE_MAX = 1000;

@Component({
  selector: 'app-news-thread',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './news-thread.component.html',
  styleUrl: './news-thread.component.scss'
})
export class NewsThreadComponent {
  private dashboardServices = inject(DashboardServices);
  private toastr = inject(ToastrService);

  @Input({ required: true }) news!: ProductionNews;
  /** Decide si el usuario puede aprobar la orden (lo resuelve el contenedor). Sin función: no se muestra el botón. */
  @Input() canApprove?: (wo: NewsWorkOrderSummary) => boolean;
  /**
   * Jefe de Mantenimiento/Mecánica: puede escribir una RESPUESTA ADMINISTRATIVA (p.ej. repuesto
   * pendiente). Solo mensaje: no cierra la novedad ni cambia estados. El backend valida el permiso.
   */
  @Input() canAdminRespond = false;

  /** Aprobar el cierre de una orden (el contenedor abre el modal de estrellas). */
  @Output() approve = new EventEmitter<NewsWorkOrderSummary>();
  /** Novedad actualizada tras registrar la respuesta administrativa (el contenedor refresca su lista). */
  @Output() adminResponded = new EventEmitter<ProductionNews>();

  readonly ratingStars = ratingStars;
  readonly adminMessageMax = ADMIN_MESSAGE_MAX;

  adminComposerOpen = false;
  adminMessage = '';
  adminSending = false;

  get canSendAdmin(): boolean {
    const len = this.adminMessage.trim().length;
    return !this.adminSending && len >= ADMIN_MESSAGE_MIN && len <= ADMIN_MESSAGE_MAX;
  }

  get adminMessageHint(): string {
    const len = this.adminMessage.trim().length;
    return len < ADMIN_MESSAGE_MIN ? `Mínimo ${ADMIN_MESSAGE_MIN} caracteres` : `${len}/${ADMIN_MESSAGE_MAX}`;
  }

  toggleAdminComposer(): void {
    this.adminComposerOpen = !this.adminComposerOpen;
    if (!this.adminComposerOpen) this.adminMessage = '';
  }

  sendAdminResponse(): void {
    if (!this.canSendAdmin || !this.news?._id) return;
    this.adminSending = true;
    this.dashboardServices.addAdminResponse(this.news._id, this.adminMessage.trim()).subscribe({
      next: (res) => {
        this.adminSending = false;
        if (!res.ok) {
          this.toastr.error(res.msg || 'No se pudo registrar la respuesta.', 'Respuesta administrativa');
          return;
        }
        // Se conserva workOrders (el backend devuelve el documento sin el cruce de órdenes).
        const updated: ProductionNews = { ...this.news, ...(res.data || {}), workOrders: this.news.workOrders };
        this.news = updated;
        this.adminMessage = '';
        this.adminComposerOpen = false;
        this.toastr.success('Mensaje enviado. Quien reportó la novedad ya puede verlo.', 'Respuesta administrativa');
        this.adminResponded.emit(updated);
      },
      error: (err: Error) => {
        this.adminSending = false;
        this.toastr.error(err.message || 'No se pudo registrar la respuesta.', 'Respuesta administrativa');
      }
    });
  }

  get workOrders(): NewsWorkOrderSummary[] {
    return this.news?.workOrders || [];
  }

  get responses(): NewsResponseItem[] {
    return this.news?.responses || [];
  }

  /** Historial de evaluaciones; si el backend aún no lo envía, se arma con la aceptación vigente. */
  evaluationsOf(wo: NewsWorkOrderSummary): NewsWorkOrderEvaluation[] {
    if (wo.evaluations?.length) return wo.evaluations;
    if (!wo.acceptance) return [];
    return [
      {
        rating: wo.acceptance.rating,
        ratingLabel: wo.acceptance.ratingLabel,
        comment: wo.acceptance.comment,
        result: 'ACEPTADA',
        evaluatedBy: wo.acceptance.approvedBy,
        evaluatedByRole: wo.acceptance.approvedByRole,
        evaluatedAt: wo.acceptance.approvedAt
      }
    ];
  }

  requestedWorkLabel(value: string): string {
    return ({ REPARAR: 'Reparar', ACONDICIONAR: 'Acondicionar', MEJORAR_REPONER: 'Mejorar / reponer' } as Record<string, string>)[value] || value;
  }

  serviceAreaLabel(area: string): string {
    return area === 'MECANICA' ? 'Mecánica' : 'Mantenimiento';
  }

  phaseLabel(wo: NewsWorkOrderSummary): string {
    if (wo.status === 'COMPLETADO') return 'Cerrada';
    if (wo.status === 'CANCELADO') return 'Cancelada';
    if (wo.status === 'PENDIENTE_ACEPTACION') {
      return wo.acceptance ? `Aprobada · pendiente cierre ${this.serviceAreaLabel(wo.serviceArea)}` : 'Terminada · por aprobar del área';
    }
    return workOrderStatusLabel(wo.status as never);
  }

  phaseClass(wo: NewsWorkOrderSummary): string {
    if (wo.status === 'COMPLETADO') return 'wo-closed';
    if (wo.status === 'CANCELADO') return 'wo-cancelled';
    if (wo.status === 'PENDIENTE_ACEPTACION') return wo.acceptance ? 'wo-ready' : 'wo-awaiting';
    return 'wo-progress';
  }

  isAwaitingApproval(wo: NewsWorkOrderSummary): boolean {
    return wo.status === 'PENDIENTE_ACEPTACION' && !wo.acceptance && !!wo.requester;
  }

  showApprove(wo: NewsWorkOrderSummary): boolean {
    return this.isAwaitingApproval(wo) && !!this.canApprove?.(wo);
  }

  formatMinutes(minutes: number | null | undefined): string {
    if (minutes === null || minutes === undefined) return '—';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (!h) return `${m} min`;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
}
