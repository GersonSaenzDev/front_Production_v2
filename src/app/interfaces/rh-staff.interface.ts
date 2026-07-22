// src/app/interfaces/rh-staff.interface.ts

/** Asignación laboral del colaborador (subset relevante de staffAssignment). */
export interface StaffAssignment {
  jobTitle?: string;
  position?: string;
  area?: string;
  departament?: string;
  company?: string;
  workShift?: string;
  reportingManager?: string;
}

/** Colaborador activo tal como lo devuelve GET /api/staff/activeStaff. */
export interface ActiveStaff {
  _id?: string;
  document: string;
  full_name: string;
  gender?: string;
  staffAssignment?: StaffAssignment;
  payrollPayments?: { costCenter?: string };
  image_base64?: string;
  CurrentEmployeeStatus?: string;
}

export interface ActiveStaffResponse {
  ok: boolean;
  msg: string;
  total: number;
  data: ActiveStaff[];
}

/** Técnico de mantenimiento normalizado para la UI (con su especialidad). */
export interface MaintenanceTechnician {
  document: string;
  fullName: string;
  specialty: string;
  area: string;
  departament: string;
}
