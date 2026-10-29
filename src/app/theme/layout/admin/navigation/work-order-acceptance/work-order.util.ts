// src/app/theme/layout/admin/navigation/work-order-acceptance/work-order.util.ts
//
// Utilidades GLOBALES del ciclo de orden de trabajo de las áreas de servicio (Mantenimiento y
// Mecánica): estados, prioridades y ACEPTACIÓN DEL SOLICITANTE. Alineado con el backend
// (api_produccion/src/maintenance/helpers/maintenance.js y dao/workOrder.js).
import {
  Approval,
  MaintenancePriority,
  MaintenanceStatus,
  RequesterEvaluation,
  WorkOrderRequester
} from '../../../../../interfaces/maintenance.interface';

/** Lo mínimo de una orden (Mantenimiento o Mecánica) para razonar sobre su aceptación. */
export interface WorkOrderAcceptanceLike {
  status: MaintenanceStatus;
  requester: WorkOrderRequester | null;
  requesterApproval: Approval | null;
  requesterEvaluations: RequesterEvaluation[];
}

export const WORK_ORDER_STATUSES: MaintenanceStatus[] = ['PENDIENTE', 'EN_PROCESO', 'PENDIENTE_ACEPTACION', 'COMPLETADO', 'CANCELADO'];

export const WORK_ORDER_PRIORITIES: MaintenancePriority[] = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'];

/** Criterio de evaluación del solicitante (formato SME55003, bloque SOLICITANTE (B)). */
export const REQUESTER_RATING_OPTIONS: { value: number; label: string }[] = [
  { value: 5, label: 'Funciona; entrega a tiempo' },
  { value: 4, label: 'Funciona; entrega tarde' },
  { value: 3, label: 'Funciona; entrega a tiempo, pero hay que ajustar' },
  { value: 2, label: 'Funciona; entrega tarde, pero hay que ajustar' },
  { value: 1, label: 'No funciona' }
];

/** Calificación que rechaza la intervención: el backend reabre la solicitud (EN_PROCESO). */
export const REQUESTER_REJECT_RATING = 1;

export function workOrderStatusLabel(status: MaintenanceStatus | null | undefined): string {
  switch (status) {
    case 'PENDIENTE':
      return 'Pendiente';
    case 'EN_PROCESO':
      return 'En proceso';
    case 'PENDIENTE_ACEPTACION':
      return 'Pendiente aceptación';
    case 'COMPLETADO':
      return 'Completado';
    case 'CANCELADO':
      return 'Cancelado';
    default:
      return status || '—';
  }
}

export function workOrderStatusClass(status: MaintenanceStatus | null | undefined): string {
  switch (status) {
    case 'PENDIENTE':
      return 'badge bg-secondary';
    case 'EN_PROCESO':
      return 'badge bg-info text-dark';
    case 'PENDIENTE_ACEPTACION':
      return 'badge bg-warning text-dark';
    case 'COMPLETADO':
      return 'badge bg-success';
    case 'CANCELADO':
      return 'badge bg-danger';
    default:
      return 'badge bg-light text-dark';
  }
}

export function workOrderPriorityClass(priority: MaintenancePriority | null | undefined): string {
  switch (priority) {
    case 'BAJA':
      return 'badge bg-light text-dark';
    case 'MEDIA':
      return 'badge bg-primary';
    case 'ALTA':
      return 'badge bg-warning text-dark';
    case 'CRITICA':
      return 'badge bg-danger';
    default:
      return 'badge bg-light text-dark';
  }
}

/** La orden se generó desde una novedad: su cierre exige la aceptación de quien la reportó. */
export function requiresRequesterAcceptance(order: WorkOrderAcceptanceLike | null | undefined): boolean {
  return !!order?.requester?.uid;
}

/** El solicitante aceptó la intervención vigente (el Jefe ya puede cerrar). */
export function isAcceptedByRequester(order: WorkOrderAcceptanceLike | null | undefined): boolean {
  return order?.requesterApproval?.accepted === true;
}

/**
 * Estado de la aceptación del solicitante:
 *  - NO_APLICA: sin novedad de origen (p.ej. preventivo): se cierra directo.
 *  - SIN_ENVIAR: el área aún no la envía a aceptación.
 *  - ESPERANDO: enviada; el solicitante no ha evaluado (pendiente de cerrar).
 *  - ACEPTADA: evaluada 2-5; lista para que el Jefe la cierre (o ya cerrada).
 */
export type AcceptanceState = 'NO_APLICA' | 'SIN_ENVIAR' | 'ESPERANDO' | 'ACEPTADA';

export function acceptanceState(order: WorkOrderAcceptanceLike | null | undefined): AcceptanceState {
  if (!requiresRequesterAcceptance(order)) return 'NO_APLICA';
  if (isAcceptedByRequester(order)) return 'ACEPTADA';
  if (order?.status === 'PENDIENTE_ACEPTACION') return 'ESPERANDO';
  return 'SIN_ENVIAR';
}

/** Aceptada pero aún sin cerrar: el Jefe del área debe pasarla a COMPLETADO. */
export function isReadyToClose(order: WorkOrderAcceptanceLike): boolean {
  return acceptanceState(order) === 'ACEPTADA' && order.status !== 'COMPLETADO' && order.status !== 'CANCELADO';
}

/** El Jefe puede enviarla a aceptación (tiene solicitante, trabajo registrado y no está cerrada/enviada). */
export function canSendToAcceptance(order: WorkOrderAcceptanceLike & { interventions?: unknown[] }): boolean {
  return (
    requiresRequesterAcceptance(order) &&
    (order.interventions?.length ?? 0) > 0 &&
    !['PENDIENTE_ACEPTACION', 'COMPLETADO', 'CANCELADO'].includes(order.status) &&
    !isAcceptedByRequester(order)
  );
}

/** Estrellas de una calificación (1-5) para mostrar en tablas/historial. */
export function ratingStars(rating: number | null | undefined): string {
  const r = Math.max(0, Math.min(5, Math.round(rating || 0)));
  return '★'.repeat(r) + '☆'.repeat(5 - r);
}
