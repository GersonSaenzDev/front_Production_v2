// src/app/interfaces/planning.interface.ts

/**
 * @description Payload para cargar la planeación mensual (POST /plannig/monthly).
 * Se envía como `FormData` por incluir el archivo Excel.
 */
export interface MonthlyPlanningPayload {
  planningFile: File;
  planningMonth: string;
  planningYear: string;
  planningLabel: string;
}

/**
 * @description Respuesta del backend al cargar la planeación mensual.
 */
export interface MonthlyPlanningResponse {
  ok: boolean;
  msg: string;
  upsertedCount: number;
  modifiedCount: number;
  totalRecords: number;
}

/**
 * @description Payload para el ajuste semanal de la planeación (POST /plannig/weekly).
 * Se envía como `FormData` por incluir el archivo Excel.
 */
export interface WeeklyPlanningPayload {
  planningFile: File;
  planningMonth: string;
  planningYear: string;
  weekStart: string;
  weekEnd: string;
  observation: string;
  planningLabel: string;
}

/**
 * @description Respuesta del backend al ejecutar el ajuste semanal.
 */
export interface WeeklyPlanningResponse {
  ok: boolean;
  msg: string;
  adjustedDays: number;
  addedDays: number;
  createdPlans: number;
  unchangedDays: number;
  totalRecords: number;
  skippedOutOfRange: number;
}

/**
 * @description Entrada del historial de auditoría de un registro de planeación.
 */
export interface PlanningAuditTrail {
  action: string;
  modifiedBy: string;
  modifiedAt: string;
  observation: string | null;
  previousState: unknown | null;
  week: string;
}

/**
 * @description Registro de planeación de un día (GET /plannig/day).
 */
export interface PlanningDayItem {
  referenceCode: string;
  assemblyLine: string;
  planningYear: number;
  planningMonth: number;
  kamPendingQuantity: number;
  managementQuantity: number;
  planningLabel: string;
  reference: string;
  totalRequirement: number;
  date: string;
  plannedQuantity: number;
  quantity: number;
  executedQuantity: number | null;
  auditTrail: PlanningAuditTrail[];
}

/**
 * @description Respuesta del backend con la planeación de un día.
 */
export interface PlanningDayResponse {
  ok: boolean;
  date: string;
  total: number;
  data: PlanningDayItem[];
}

/**
 * @description Fila de control de una referencia dentro de una línea de ensamble:
 * cruza lo producido (LoadBarcode, sin línea) con lo planeado (productionPlanning, con línea).
 */
export interface LineControlRow {
  reference: string;
  productCode: string;
  produced: number;
  planned: number;
  // Planeado − Producido. > 0 = falta; ≤ 0 = meta cumplida.
  difference: number;
  met: boolean;
  hasPlanning: boolean;
}

/**
 * @description Agrupación por línea de ensamble para la tabla "Control de Producción por Línea".
 */
export interface LineControlGroup {
  line: string;
  rows: LineControlRow[];
  totalProduced: number;
  totalPlanned: number;
}
