// src/app/interfaces/mechanics.interface.ts
//
// Solicitud de Mecánica (formato SME55003 "Herramental Mecánica"). Comparte con Mantenimiento
// el ciclo de la orden de trabajo (estados, asignados, intervenciones con ayudante, Vo.Bo y
// aceptación/evaluación del solicitante), por eso reutiliza esos tipos.
import {
  Approval,
  AuditEntry,
  Intervention,
  InterventionInput,
  MaintenanceAssignee,
  MaintenancePriority,
  MaintenanceStatus,
  RequesterEvaluation,
  UpdateInterventionRequest,
  WorkOrderRequester
} from './maintenance.interface';

/* ===================== Catálogos (SME55003) ===================== */

/** Lo que pide el solicitante (bloque SOLICITANTE (A)). */
export type MechanicsRequestedWork = 'REPARAR' | 'ACONDICIONAR' | 'MEJORAR_REPONER';

/** Tipo de solicitud que define Mecánica al recibirla (bloque SME (A)). */
export type MechanicsSmeRequestType = 'MODIFICAR' | 'FABRICAR';

/** Máquinas-herramienta de la tabla "TIEMPO EMPLEADO". */
export type MechanicsMachineType =
  | 'HILO'
  | 'PENETRACION'
  | 'CNC'
  | 'RECTIFICADORA'
  | 'CEPILLO'
  | 'TORNO'
  | 'FRESA'
  | 'SIERRA'
  | 'TALADRO'
  | 'BANCO';

export const MECHANICS_REQUESTED_WORK: { value: MechanicsRequestedWork; label: string }[] = [
  { value: 'REPARAR', label: 'Reparar' },
  { value: 'ACONDICIONAR', label: 'Acondicionar' },
  { value: 'MEJORAR_REPONER', label: 'Mejorar / reponer' }
];

export const MECHANICS_SME_REQUEST_TYPES: { value: MechanicsSmeRequestType; label: string }[] = [
  { value: 'MODIFICAR', label: 'Modificar' },
  { value: 'FABRICAR', label: 'Fabricar' }
];

/** Orden y rótulos de la tabla del formato (Hilo, Penet, CNC, Rectf, Cepill, Torno, Fresa, Sierra, Talad, Banco). */
export const MECHANICS_MACHINE_TYPES: { value: MechanicsMachineType; label: string }[] = [
  { value: 'HILO', label: 'Hilo' },
  { value: 'PENETRACION', label: 'Penetración' },
  { value: 'CNC', label: 'CNC' },
  { value: 'RECTIFICADORA', label: 'Rectificadora' },
  { value: 'CEPILLO', label: 'Cepillo' },
  { value: 'TORNO', label: 'Torno' },
  { value: 'FRESA', label: 'Fresa' },
  { value: 'SIERRA', label: 'Sierra' },
  { value: 'TALADRO', label: 'Taladro' },
  { value: 'BANCO', label: 'Banco' }
];

/* ===================== Entidades ===================== */

export interface MountingHit {
  hits: number | null;
  date: string;
}

/** "Material empleado". */
export interface MechanicsMaterial {
  code: string;
  description: string;
  unit: string;
  quantity: number;
}

/** "Trabajo externo". */
export interface MechanicsExternalWork {
  description: string;
  provider: string;
  orderNumber: string;
}

/** Intervención de Mecánica: tiempo hombre (inicio/fin) + máquina-herramienta y tiempo de máquina. */
export interface MechanicsIntervention extends Intervention {
  machineType: MechanicsMachineType | null;
  /** H. Maq en minutos (el tiempo hombre es durationMinutes). */
  machineMinutes: number | null;
}

export interface MechanicsRequest {
  id: string;
  documentCode: string;
  documentVersion: string;
  /** SOLICITUD N° — MMAA + secuencia de 5 dígitos por mes. */
  consecutiveSme: string;
  toolName: string;
  toolCode: string;
  operationNumber: string;
  operationTotal: string;
  operationDescription: string;
  description: string;
  requestedWork: MechanicsRequestedWork | null;
  mountingHits: MountingHit[];
  area: string;
  department: string;
  machineCode: string;
  machineName: string;
  requestedBy: string;
  reportedAt: string;
  smeRequestType: MechanicsSmeRequestType | null;
  changeNumber: string;
  projectNumber: string;
  receivedAt: string;
  agreedDeliveryDate: string;
  diagnosis: string;
  materials: MechanicsMaterial[];
  externalWork: MechanicsExternalWork[];
  deliveredAt: string;
  /** SME (B): observación del Jefe de Mecánica sobre la calificación. */
  ratingObservation: string;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  scheduledDate: string;
  completedDate: string | null;
  assignedTo: string;
  assignees: MaintenanceAssignee[];
  sourceNewsId: string | null;
  interventions: MechanicsIntervention[];
  supervisorApproval: Approval | null;
  requesterApproval: Approval | null;
  requester: WorkOrderRequester | null;
  requesterEvaluations: RequesterEvaluation[];
  auditTrail: AuditEntry[];
  active: boolean;
  userCreate: string | null;
  dateCreate: string | null;
  userUpdate: string | null;
  dateUpdate: string | null;
}

/* ===================== Requests ===================== */

export interface MechanicsInterventionInput extends InterventionInput {
  machineType?: MechanicsMachineType | null;
  machineMinutes?: number | null;
}

export interface MechanicsUpdateInterventionRequest extends UpdateInterventionRequest {
  machineType?: MechanicsMachineType | null;
  machineMinutes?: number | null;
}

export interface CreateMechanicsRequest {
  area: string; // requerido
  department: string; // requerido
  description: string; // requerido
  toolName?: string;
  toolCode?: string;
  operationNumber?: string;
  operationTotal?: string;
  operationDescription?: string;
  requestedWork?: MechanicsRequestedWork | '';
  mountingHits?: MountingHit[];
  machineCode?: string;
  machineName?: string;
  requestedBy?: string;
  reportedAt?: string;
  smeRequestType?: MechanicsSmeRequestType | '';
  changeNumber?: string;
  projectNumber?: string;
  receivedAt?: string;
  agreedDeliveryDate?: string;
  diagnosis?: string;
  materials?: MechanicsMaterial[];
  externalWork?: MechanicsExternalWork[];
  priority?: MaintenancePriority;
  scheduledDate?: string;
  assignees?: MaintenanceAssignee[];
  sourceNewsId?: string;
}

export interface UpdateMechanicsRequest extends Partial<Omit<CreateMechanicsRequest, 'sourceNewsId'>> {
  status?: MaintenanceStatus;
  deliveredAt?: string;
  ratingObservation?: string;
  completedDate?: string;
  /** Razón del cambio; queda en el auditTrail. */
  observation?: string;
}

export interface MechanicsListFilters {
  consecutiveSme?: string;
  status?: MaintenanceStatus;
  area?: string;
  /** Pantalla del técnico: solo lo asignado a él (el backend usa el documento del token). */
  assignedToMe?: boolean;
}

/* ===================== Responses ===================== */

export interface MechanicsResponse {
  ok: boolean;
  msg?: string;
  data: MechanicsRequest;
}

export interface MechanicsListResponse {
  ok: boolean;
  total: number;
  data: MechanicsRequest[];
}
