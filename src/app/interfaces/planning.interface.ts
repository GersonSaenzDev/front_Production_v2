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

/**
 * @description Payload para la consulta de la planeación por rango de fechas (POST /plannig/range).
 */
export interface PlanningRangePayload {
  startDate: string;
  endDate: string;
}

/**
 * @description Respuesta del backend con la planeación de un rango de fechas.
 */
export interface PlanningRangeResponse {
  ok: boolean;
  startDate: string;
  endDate: string;
  total: number;
  data: PlanningDayItem[];
}

/**
 * @description Payload para consultar la planeación mensual consolidada por referencia (POST /plannig/month).
 */
export interface PlanningMonthPayload {
  planningYear: number;
  planningMonth: number;
  assemblyLine?: string;
}

/**
 * @description Registro consolidado de planeación mensual por referencia.
 */
export interface PlanningMonthItem {
  _id: string;
  assemblyLine: string;
  referenceCode: string;
  reference: string;
  planningYear: number;
  planningMonth: number;
  planningLabel: string;
  managementQuantity: number;
  kamPendingQuantity: number;
  totalRequirement: number;
  totalPlanned: number;
  totalQuantity: number;
  totalExecuted: number;
  userCreate: string;
  dateCreate: string;
  hasChanges: boolean;
  changesCount: number;
  lastModifiedBy: string | null;
  lastModifiedAt: string | null;
}

/**
 * @description Respuesta del backend con la planeación mensual consolidada.
 */
export interface PlanningMonthResponse {
  ok: boolean;
  planningYear: number;
  planningMonth: number;
  total: number;
  data: PlanningMonthItem[];
}

/**
 * @description Payload para consultar el detalle de una planeación por `_id` (POST /plannig/detail).
 */
export interface PlanningDetailByIdPayload {
  _id: string;
}

/**
 * @description Payload para consultar el detalle de una planeación por clave compuesta (POST /plannig/detail).
 */
export interface PlanningDetailByKeyPayload {
  assemblyLine: string;
  referenceCode: string;
  planningYear: number;
  planningMonth: number;
}

/**
 * @description Payload de /plannig/detail: por `_id`, o por clave compuesta.
 */
export type PlanningDetailPayload = PlanningDetailByIdPayload | PlanningDetailByKeyPayload;

/**
 * @description Entrada del historial de cambios de una planeación (changeHistory).
 */
export interface PlanningChangeHistoryEntry {
  date: string;
  action: string;
  modifiedBy: string;
  modifiedAt: string;
  observation: string | null;
  previousState: unknown | null;
  week: string;
}

/**
 * @description Registro diario dentro del `dailyPlan` del detalle de una planeación.
 */
export interface PlanningDetailDayEntry {
  date: string;
  plannedQuantity: number;
  quantity: number;
  executedQuantity: number | null;
  auditTrail: PlanningAuditTrail[];
}

/**
 * @description Documento completo de planeación devuelto por /plannig/detail,
 * con el `dailyPlan` de los días del mes y el `changeHistory` de auditoría.
 */
export interface PlanningDetailItem {
  _id: string;
  assemblyLine: string;
  referenceCode: string;
  reference: string;
  planningYear: number;
  planningMonth: number;
  planningLabel: string;
  managementQuantity: number;
  kamPendingQuantity: number;
  totalRequirement: number;
  totalPlanned: number;
  totalQuantity: number;
  totalExecuted: number;
  userCreate: string;
  dateCreate: string;
  dailyPlan: PlanningDetailDayEntry[];
  hasChanges: boolean;
  changesCount: number;
  lastModifiedBy: string | null;
  lastModifiedAt: string | null;
  changeHistory: PlanningChangeHistoryEntry[];
}

/**
 * @description Respuesta del backend con el detalle completo de una planeación.
 */
export interface PlanningDetailResponse {
  ok: boolean;
  data: PlanningDetailItem;
}

/**
 * @description Elemento devuelto por la consulta de producción total por rango.
 */
export interface TotalProductItem {
  date: string;
  productCode: string;
  productName: string;
  Producidos: number;
  Validos: number;
}

/**
 * @description Respuesta del backend con el consolidado de producción por rango (POST /assembly/rangeTotalProducts).
 */
export interface RangeTotalProductsResponse {
  ok: boolean;
  msg: TotalProductItem[];
}
