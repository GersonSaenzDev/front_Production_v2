// src/app/theme/layout/admin/navigation/work-order-acceptance/work-order-acceptance.component.ts
//
// Componente GLOBAL (lado del área de servicio: Mantenimiento / Mecánica). Muestra en el
// detalle de una solicitud quién debe aceptarla, el estado de la aceptación, la evaluación
// vigente y el historial; y le da al Jefe las acciones del ciclo:
//   - "Enviar a aceptación del solicitante" (status PENDIENTE_ACEPTACION)
//   - "Cerrar solicitud" (COMPLETADO), solo habilitado si el solicitante ya aceptó.
// Las reglas se validan también en el backend; aquí solo se guía al usuario.
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  acceptanceState,
  AcceptanceState,
  canSendToAcceptance,
  isReadyToClose,
  ratingStars,
  WorkOrderAcceptanceLike
} from './work-order.util';

@Component({
  selector: 'app-work-order-acceptance',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './work-order-acceptance.component.html',
  styleUrl: './work-order-acceptance.component.scss'
})
export class WorkOrderAcceptanceComponent {
  @Input({ required: true }) order!: WorkOrderAcceptanceLike & { interventions?: unknown[] };
  /** Jefe del área: ve las acciones de enviar a aceptación y cerrar. */
  @Input() canManage = false;
  @Input() busy = false;

  @Output() sendToAcceptance = new EventEmitter<void>();
  @Output() closeOrder = new EventEmitter<void>();

  readonly ratingStars = ratingStars;

  get state(): AcceptanceState {
    return acceptanceState(this.order);
  }

  get canSend(): boolean {
    return canSendToAcceptance(this.order);
  }

  get readyToClose(): boolean {
    return isReadyToClose(this.order);
  }

  /** Más reciente primero. */
  get evaluations() {
    return [...(this.order.requesterEvaluations || [])].reverse();
  }
}
