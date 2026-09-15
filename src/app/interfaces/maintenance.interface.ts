// src/app/interfaces/maintenance.interface.ts

/* ===================== Catálogos ===================== */

export type MaintenanceType = 'PREVENTIVO' | 'CORRECTIVO' | 'PREDICTIVO';
export type MaintenanceStatus = 'PENDIENTE' | 'EN_PROCESO' | 'COMPLETADO' | 'CANCELADO';
export type MaintenancePriority = 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
export type ApprovalRole = 'SUPERVISOR' | 'SOLICITANTE';

/* ===================== Entidades base ===================== */

export interface SparePart {
  code: string;
  description: string;
  quantity: number;
}

/** Persona referenciada por documento + nombre (snapshot, sin populate). */
export interface PersonRef {
  document: string;
  fullName: string;
}

/** Técnico asignado a la solicitud (puede haber 1 o N por solicitud). */
export interface MaintenanceAssignee {
  document: string;
  fullName: string;
  specialty?: string;
}

export interface AuditEntry {
  action: string;
  modifiedBy: string;
  modifiedAt: string;
  observation: string | null;
  previousState: string | null;
}

export interface Approval {
  approvedBy: string;
  approvedAt: string;
  observation: string | null;
}

/** Ciclo de vida de la solicitud de escalamiento a mesa técnica de una intervención. */
export type EscalationStatus = 'NINGUNA' | 'SOLICITADA' | 'ATENDIDA';

/**
 * Intervención (acción de contención) como la devuelve el backend. Cada técnico asignado a
 * la solicitud puede registrar la suya propia (workDone/startAt/endAt/notes), con la duración
 * calculada por el backend y la posibilidad de pedir escalar a mesa técnica.
 * Se consume desde OTRO componente (no view-news/maintenance-news todavía).
 */
export interface Intervention {
  id: string;
  technicianCodes: string[];
  workDone: string;
  startAt: string;
  endAt: string;
  /** Minutos entre startAt y endAt, calculados por el backend. */
  durationMinutes: number | null;
  /** Detalles puntuales de relevancia adicionales al trabajo realizado. */
  notes: string;
  spareParts: SparePart[];
  escalateToTechnicalDesk: boolean;
  escalationReason: string;
  escalationStatus: EscalationStatus;
  escalationRespondedBy: string | null;
  escalationRespondedAt: string | null;
  escalationResponse: string | null;
  /** El Jefe habilitó puntualmente que el técnico corrija esta intervención (se consume al guardar). */
  editUnlocked: boolean;
  editUnlockedBy: string | null;
  editUnlockedAt: string | null;
  auditTrail: AuditEntry[];
  userCreate: string | null;
  dateCreate: string | null;
  userUpdate: string | null;
  dateUpdate: string | null;
}

/**
 * Entrega de Almacén de Mantenimiento (repuestos/materiales) para una solicitud. Controla qué
 * se entregó, quién entregó (almacén) y quién recibió. Se consume desde OTRO componente.
 */
export interface WarehouseDelivery {
  id: string;
  items: SparePart[];
  deliveredBy: PersonRef | null;
  receivedBy: PersonRef | null;
  deliveredAt: string;
  notes: string;
  auditTrail: AuditEntry[];
  userCreate: string | null;
  dateCreate: string | null;
  userUpdate: string | null;
  dateUpdate: string | null;
}

/** Solicitud de mantenimiento completa (forma de `data`). */
export interface MaintenanceRequest {
  id: string;
  documentCode: string;
  documentVersion: string;
  /** Formato MMAA + secuencia de 5 dígitos por mes (ej. "062600001"). String para conservar ceros. */
  consecutiveMtto: string;
  consecutiveSection: string;
  /** Consecutivo/código del sistema externo Summum, para seguimiento cruzado. */
  consecutiveSummum: string;
  machineCode: string;
  machineName: string;
  area: string;
  department: string;
  costCenter: string;
  maintenanceType: MaintenanceType;
  serviceType: string;
  description: string;
  failureDescription: string;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  requestedBy: string;
  reportedAt: string;
  receivedAt: string;
  scheduledDate: string;
  completedDate: string | null;
  /** Legado: texto libre derivado de `assignees` (nombres separados por coma) para compatibilidad. */
  assignedTo: string;
  /** Asignación real: 1 o N técnicos (ej. plomero + mecánico + electricista). */
  assignees: MaintenanceAssignee[];
  /** Id de la novedad (productionNews) de la que se generó esta solicitud, si aplica. */
  sourceNewsId: string | null;
  interventions: Intervention[];
  /** Entregas de Almacén de Mantenimiento para esta solicitud. Se gestiona desde OTRO componente. */
  warehouseDeliveries: WarehouseDelivery[];
  supervisorApproval: Approval | null;
  requesterApproval: Approval | null;
  auditTrail: AuditEntry[];
  active: boolean;
  userCreate: string | null;
  dateCreate: string | null;
  userUpdate: string | null;
  dateUpdate: string | null;
}

/* ===================== Requests ===================== */

/** Intervención al crear / agregar (sin auditoría ni ids; durationMinutes lo calcula el backend). */
export interface InterventionInput {
  technicianCodes: string[];
  workDone: string;
  startAt: string;
  endAt: string;
  notes?: string;
  spareParts: SparePart[];
  /** Solicita que mesa técnica valide esta intervención. */
  escalateToTechnicalDesk?: boolean;
  escalationReason?: string;
}

/** Entrega de Almacén de Mantenimiento al registrar (sin auditoría ni id). */
export interface WarehouseDeliveryInput {
  items: SparePart[];
  deliveredBy?: PersonRef;
  receivedBy?: PersonRef;
  deliveredAt?: string;
  notes?: string;
}

export interface SeedConsecutiveRequest {
  current: number;
  force?: boolean;
}

export interface CreateMaintenanceRequest {
  machineCode: string; // requerido
  maintenanceType: MaintenanceType; // requerido
  description: string; // requerido
  consecutiveSection?: string;
  /** Consecutivo/código del sistema externo Summum, para seguimiento cruzado. */
  consecutiveSummum?: string;
  machineName?: string;
  area?: string;
  department?: string;
  costCenter?: string;
  serviceType?: string;
  failureDescription?: string;
  priority?: MaintenancePriority;
  requestedBy?: string;
  reportedAt?: string;
  receivedAt?: string;
  scheduledDate?: string;
  /** Legado: solo se usa si no se envía `assignees`. */
  assignedTo?: string;
  /** Asignación real: 1 o N técnicos (ej. plomero + mecánico + electricista). */
  assignees?: MaintenanceAssignee[];
  /** Id de la novedad (productionNews) origen, cuando la solicitud se genera desde una novedad. */
  sourceNewsId?: string;
  interventions?: InterventionInput[];
}

export interface UpdateMaintenanceRequest {
  consecutiveSection?: string;
  consecutiveSummum?: string;
  machineName?: string;
  area?: string;
  department?: string;
  costCenter?: string;
  maintenanceType?: MaintenanceType;
  serviceType?: string;
  description?: string;
  failureDescription?: string;
  priority?: MaintenancePriority;
  status?: MaintenanceStatus;
  requestedBy?: string;
  reportedAt?: string;
  receivedAt?: string;
  scheduledDate?: string;
  completedDate?: string;
  assignedTo?: string;
  assignees?: MaintenanceAssignee[];
  /** Razón del cambio; queda en el auditTrail. */
  observation?: string;
}

export interface AddInterventionRequest extends InterventionInput {}

export interface UpdateInterventionRequest {
  technicianCodes?: string[];
  workDone?: string;
  startAt?: string;
  endAt?: string;
  notes?: string;
  spareParts?: SparePart[];
  escalateToTechnicalDesk?: boolean;
  escalationReason?: string;
  /** Uso de mesa técnica al atender un escalamiento. */
  escalationStatus?: EscalationStatus;
  escalationResponse?: string;
  observation?: string;
}

export interface AddWarehouseDeliveryRequest extends WarehouseDeliveryInput {}

export interface ApprovalRequest {
  role: ApprovalRole; // requerido
  observation?: string;
}

export interface MaintenanceListFilters {
  consecutiveMtto?: string;
  status?: MaintenanceStatus;
  machineCode?: string;
  area?: string;
  maintenanceType?: MaintenanceType;
  /** Pantalla "Cargue de Novedad" del técnico: solo lo asignado a él (backend filtra por su
   * propio documento del token, no por uno que se le pase). */
  assignedToMe?: boolean;
}

/* ===================== Responses ===================== */

export interface SeedConsecutiveResponse {
  ok: boolean;
  msg: string;
  data: { current: number; next: number };
}

export interface MaintenanceResponse {
  ok: boolean;
  msg?: string;
  data: MaintenanceRequest;
}

export interface MaintenanceListResponse {
  ok: boolean;
  total: number;
  data: MaintenanceRequest[];
}

export interface ApprovalResponse {
  ok: boolean;
  msg: string;
  data: {
    supervisorApproval: Approval | null;
    requesterApproval: Approval | null;
  };
}

export interface DeleteMaintenanceResponse {
  ok: boolean;
  msg: string;
}
