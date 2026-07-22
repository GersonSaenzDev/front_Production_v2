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

/** Intervención (acción de contención) como la devuelve el backend. */
export interface Intervention {
  id: string;
  technicianCodes: string[];
  workDone: string;
  startAt: string;
  endAt: string;
  spareParts: SparePart[];
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
  machineCode: string;
  machineName: string;
  area: string;
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
  assignedTo: string;
  interventions: Intervention[];
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

/** Intervención al crear / agregar (sin auditoría ni ids). */
export interface InterventionInput {
  technicianCodes: string[];
  workDone: string;
  startAt: string;
  endAt: string;
  spareParts: SparePart[];
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
  machineName?: string;
  area?: string;
  costCenter?: string;
  serviceType?: string;
  failureDescription?: string;
  priority?: MaintenancePriority;
  requestedBy?: string;
  reportedAt?: string;
  receivedAt?: string;
  scheduledDate?: string;
  assignedTo?: string;
  interventions?: InterventionInput[];
}

export interface UpdateMaintenanceRequest {
  consecutiveSection?: string;
  machineName?: string;
  area?: string;
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
  /** Razón del cambio; queda en el auditTrail. */
  observation?: string;
}

export interface AddInterventionRequest extends InterventionInput {}

export interface UpdateInterventionRequest {
  technicianCodes?: string[];
  workDone?: string;
  startAt?: string;
  endAt?: string;
  spareParts?: SparePart[];
  observation?: string;
}

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
