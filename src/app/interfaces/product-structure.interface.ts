// src/app/interfaces/product-structure.interface.ts

/**
 * @description Registro de estructura de producto en el listado (POST /plannig/productStructure/list).
 */
export interface ProductStructureListItem {
  _id: string;
  internalCode: string;
  codRef: string;
  ean: string;
  reference: string;
  productName: string;
  baseQuantity: number;
  status: string;
  dateCreate: string;
  bomLines: number;
}

/**
 * @description Respuesta del backend con el listado de estructuras cargadas.
 */
export interface ProductStructureListResponse {
  ok: boolean;
  msg: ProductStructureListItem[];
  total: number;
}

/**
 * @description Línea de la lista de materiales (BOM) dentro del detalle de una estructura.
 */
export interface ProductStructureBomLine {
  position: number;
  level: number;
  itemType: 'product' | 'rawMaterial' | string;
  rawType: string;
  productCode: string;
  name: string;
  baseQuantity: number;
  requiredQuantity: number;
  standardTime: number;
  lastPurchasePrice: number;
  unit: string;
  warehouseCode: string;
  warehouseName: string;
  piecesCount: string;
  piecesNumber: number;
  nextNode: string | null;
  parallelDependencies: string[];
}

/**
 * @description Detalle completo de una estructura de producto (POST /plannig/productStructure/detail).
 */
export interface ProductStructureDetail {
  _id: string;
  internalCode: string;
  codRef: string;
  ean: string;
  reference: string;
  productName: string;
  sourceFile: string | null;
  baseQuantity: number;
  bom: ProductStructureBomLine[];
}

/**
 * @description Respuesta del backend con el detalle de una estructura.
 */
export interface ProductStructureDetailResponse {
  ok: boolean;
  msg: ProductStructureDetail;
}

/**
 * @description Referencia y cantidad a incluir en el análisis de materiales (POST /plannig/productStructure/materials).
 */
export interface MaterialsAnalysisReferenceInput {
  internalCode: string;
  quantity: number;
}

/**
 * @description Payload para ejecutar el análisis de materiales sobre 1..N referencias.
 */
export interface MaterialsAnalysisPayload {
  references: MaterialsAnalysisReferenceInput[];
}

/**
 * @description Resumen por referencia dentro del resultado del análisis de materiales.
 */
export interface MaterialsAnalysisReferenceResult {
  internalCode: string;
  codRef: string;
  productName: string;
  quantity: number;
  materialsCount: number;
  materialCost: number;
}

/**
 * @description Totales agregados del análisis de materiales.
 */
export interface MaterialsAnalysisSummary {
  referencesAnalyzed: number;
  totalMaterials: number;
  totalCost: number;
  supplyOnlyMaterials: number;
  supplyOnlyCost: number;
  mixedOrLaborMaterials: number;
  warehouses: number;
}

/**
 * @description Consumo de un material dentro de una referencia específica.
 */
export interface MaterialByReference {
  internalCode: string;
  referenceQuantity: number;
  quantity: number;
  cost: number;
}

/**
 * @description Material consolidado entre todas las referencias analizadas.
 */
export interface MaterialsAnalysisMaterial {
  productCode: string;
  name: string;
  unit: string;
  unitPrice: number;
  priceVariation: boolean;
  supplyOnly: boolean;
  totalQuantity: number;
  totalCost: number;
  supplyQuantity: number;
  laborQuantity: number;
  consumedIn: string[];
  byReference: MaterialByReference[];
}

/**
 * @description Resultado completo del análisis de materiales.
 */
export interface MaterialsAnalysisResult {
  references: MaterialsAnalysisReferenceResult[];
  notFound: string[];
  summary: MaterialsAnalysisSummary;
  materials: MaterialsAnalysisMaterial[];
}

/**
 * @description Respuesta del backend con el análisis de materiales.
 */
export interface MaterialsAnalysisResponse {
  ok: boolean;
  msg: MaterialsAnalysisResult;
}

/**
 * @description Respuesta del backend al cargar un archivo de estructura de producto.
 * Endpoint aún no confirmado por el backend: se asume el mismo shape que `MonthlyPlanningResponse`.
 */
export interface ProductStructureUploadResponse {
  ok: boolean;
  msg: string;
  upsertedCount: number;
  modifiedCount: number;
  totalRecords: number;
}

// =====================================================================
//  CÁLCULO DE REQUERIMIENTOS (POST /plannig/productStructure/scenario)
// =====================================================================

/**
 * @description Desglose de un tiempo total en días/horas/minutos, ya formateado por el backend.
 */
export interface FormattedTime {
  totalHours: number;
  days: number;
  hours: number;
  minutes: number;
  readable: string;
}

/**
 * @description Jornada de trabajo aplicada a una bodega (respuesta del backend, resumen).
 */
export interface AppliedWorkSchedule {
  name: string;
  effectiveHoursPerDay: number;
  daysPerWeek: number;
  warehouses: string;
}

/**
 * @description Jornada de trabajo asociada a una carga (bottleneck / bodega), sin el detalle de bodegas.
 */
export interface WorkScheduleSummary {
  name: string;
  effectiveHoursPerDay: number;
  daysPerWeek: number;
}

/**
 * @description Payload para calcular el escenario de requerimientos (POST /plannig/productStructure/scenario).
 */
export interface ScenarioPayload {
  references: MaterialsAnalysisReferenceInput[];
  hoursPerDay: number;
}

/**
 * @description Resultado por referencia dentro del escenario de requerimientos.
 */
export interface ScenarioReferenceResult {
  internalCode: string;
  codRef: string;
  productName: string;
  quantity: number;
  totalTime: number;
  totalTimeFormatted: FormattedTime;
  totalMaterialCost: number;
  totalExplodedMaterialCost: number;
  totalPieces: number;
}

/**
 * @description Totales agregados del escenario de requerimientos.
 */
export interface ScenarioSummary {
  referencesAnalyzed: number;
  warehouses: number;
  timeUnit: string;
  appliedSchedules: AppliedWorkSchedule[];
  totalTime: number;
  totalTimeFormatted: FormattedTime;
  totalMaterialCost: number;
  totalExplodedMaterialCost: number;
  totalPieces: number;
  sharedParts: number;
}

/**
 * @description Bodega identificada como cuello de botella dentro del escenario.
 */
export interface ScenarioBottleneck {
  rank: number;
  warehouseCode: string;
  warehouseName: string;
  loadSharePercent: number;
  totalTime: number;
  workSchedule: WorkScheduleSummary;
  totalTimeFormatted: FormattedTime;
  workDaysRequired: number;
  weeksRequired: number;
  totalPieces: number;
}

/**
 * @description Carga de una referencia específica dentro de una bodega.
 */
export interface ScenarioReferenceLoad {
  internalCode: string;
  quantity: number;
  time: number;
  materialCost: number;
  pieces: number;
}

/**
 * @description Carga total de una bodega dentro del escenario, con el desglose por referencia.
 */
export interface ScenarioWarehouseLoad {
  warehouseCode: string;
  warehouseName: string;
  totalTime: number;
  totalMaterialCost: number;
  totalExplodedMaterialCost: number;
  totalPieces: number;
  byReference: ScenarioReferenceLoad[];
  rank: number;
  loadSharePercent: number;
  isBottleneck: boolean;
  workSchedule: WorkScheduleSummary;
  totalTimeFormatted: FormattedTime;
  workDaysRequired: number;
  weeksRequired: number;
}

/**
 * @description Resultado completo del escenario de requerimientos.
 */
export interface ScenarioResult {
  references: ScenarioReferenceResult[];
  notFound: string[];
  summary: ScenarioSummary;
  bottlenecks: ScenarioBottleneck[];
  byWarehouse: ScenarioWarehouseLoad[];
}

/**
 * @description Respuesta del backend con el escenario de requerimientos.
 */
export interface ScenarioResponse {
  ok: boolean;
  msg: ScenarioResult;
}

// =====================================================================
//  ANÁLISIS DE REFERENCIA (POST /plannig/productStructure/analysis)
// =====================================================================

/**
 * @description Payload para el análisis profundo de una referencia (POST /plannig/productStructure/analysis).
 */
export interface ReferenceAnalysisPayload {
  internalCode: string;
  plannedQuantity: number;
  materials?: string[];
}

/**
 * @description Datos básicos de la referencia analizada.
 */
export interface ReferenceAnalysisInfo {
  internalCode: string;
  codRef: string;
  ean: string;
  reference: string;
  productName: string;
  baseQuantity: number;
}

/**
 * @description Totales por unidad y para el plan completo del análisis de referencia.
 */
export interface ReferenceAnalysisSummary {
  warehouses: number;
  bomLines: number;
  timePerUnit: number;
  timeForPlan: number;
  materialCostPerUnit: number;
  materialCostForPlan: number;
  explodedMaterialCostPerUnit: number;
  explodedMaterialCostForPlan: number;
  piecesPerUnit: number;
  piecesForPlan: number;
  costMethod: string;
}

/**
 * @description Línea de nivel 1 del BOM excluida del costo industrial (ej. subensambles).
 */
export interface ReferenceAnalysisExcludedLine {
  productCode: string;
  name: string;
  itemType: string;
  warehouseCode: string;
  warehouseName: string;
  quantityPerUnit: number;
  unitPrice: number;
  costPerUnit: number;
}

/**
 * @description Detalle del "costo industrial" (líneas de nivel 1, excluyendo subensambles).
 */
export interface ReferenceAnalysisIndustrialCost {
  level1Lines: number;
  excludePrefixes: string[];
  excludedLines: ReferenceAnalysisExcludedLine[];
  excludedCostPerUnit: number;
  excludedCostForPlan: number;
}

/**
 * @description Carga de una bodega dentro del análisis de referencia, con sus flujos de entrada/salida.
 */
export interface ReferenceAnalysisWarehouse {
  warehouseCode: string;
  warehouseName: string;
  bomLines: number;
  productLines: number;
  rawMaterialLines: number;
  timePerUnit: number;
  timeForPlan: number;
  materialCostPerUnit: number;
  materialCostForPlan: number;
  explodedMaterialCostPerUnit: number;
  explodedMaterialCostForPlan: number;
  piecesPerUnit: number;
  piecesForPlan: number;
  receivesFrom: string[];
  deliversTo: string[];
}

/**
 * @description Contribuyente (línea de nivel 1 o nodo profundo) a la desactualización de precios,
 * compartido entre `/analysis` (costReconciliation.priceStaleness) y `/costAudit` (topContributors).
 */
export interface PriceStalenessContributor {
  productCode: string;
  name: string;
  itemType: string;
  warehouseCode: string;
  warehouseName: string;
  excluded: boolean;
  lastPurchasePrice: number;
  lineCost: number;
  rolledCost: number;
  gap: number;
}

/**
 * @description Nodo a cualquier profundidad del BOM cuyo precio propio está desactualizado frente al
 * costo real de su propio subárbol. `path` es la cadena de nombres de sus padres ("A > B > C"), o
 * "(raíz)" si el nodo ya es de nivel 1.
 */
export interface DeepGap {
  productCode: string;
  name: string;
  level: number;
  warehouseCode: string;
  warehouseName: string;
  lastPurchasePrice: number;
  ownLineCost: number;
  rolledCost: number;
  gap: number;
  path: string;
}

/**
 * @description Desglose de qué explica la diferencia entre la explosión completa de materia prima y el
 * costo oficial (rollup de nivel 1) dentro de la conciliación de costos.
 */
export interface CostReconciliationExplainedBy {
  hiddenRawMaterialContent: number;
  nonDecomposedProductContent: number;
  excludedLinesContent: number;
  orphanMaterialContent: number;
}

/**
 * @description Desactualización total de precios frente al costo real (rollup), con sus principales
 * contribuyentes a cualquier profundidad.
 */
export interface PriceStaleness {
  totalGap: number;
  topContributors: PriceStalenessContributor[];
}

/**
 * @description Conciliación matemática exacta entre el costo oficial (rollup de nivel 1) y la explosión
 * completa de materia prima, más el diagnóstico de desactualización de precios (`priceStaleness`).
 */
export interface CostReconciliation {
  formula: string;
  materialCostPerUnit: number;
  explodedMaterialCostPerUnit: number;
  fullMaterialTotalPerUnit: number;
  difference: number;
  matches: boolean;
  explainedBy: CostReconciliationExplainedBy;
  priceStaleness: PriceStaleness;
}

/**
 * @description Resultado completo del análisis profundo de una referencia.
 */
export interface ReferenceAnalysisResult {
  reference: ReferenceAnalysisInfo;
  plannedQuantity: number;
  summary: ReferenceAnalysisSummary;
  industrialCost: ReferenceAnalysisIndustrialCost;
  costReconciliation: CostReconciliation;
  deepGaps: DeepGap[];
  byWarehouse: ReferenceAnalysisWarehouse[];
}

/**
 * @description Respuesta del backend con el análisis profundo de una referencia.
 */
export interface ReferenceAnalysisResponse {
  ok: boolean;
  msg: ReferenceAnalysisResult;
}

// =====================================================================
//  AUDITORÍA POR REFERENCIA (POST /plannig/productStructure/audit)
// =====================================================================

/**
 * @description Payload para la auditoría trazable a Excel de una referencia (POST /plannig/productStructure/audit).
 */
export interface ReferenceAuditPayload {
  internalCode: string;
  plannedQuantity: number;
}

/**
 * @description Filtros aplicados (opcionales) sobre la auditoría de una referencia.
 */
export interface ReferenceAuditAppliedFilters {
  unit: string | null;
  materials: string[] | null;
}

/**
 * @description Explicación de columnas y fórmulas usadas en la auditoría, para trazabilidad hacia el Excel master.
 */
export interface ReferenceAuditHowToRead {
  excelSource: string;
  columns: Record<string, string>;
  formulas: Record<string, string>;
}

/**
 * @description Línea física (posición real en el Excel) que compone un material dentro de `byUnit`.
 */
export interface ReferenceAuditUnitLine {
  position: number;
  level: number;
  warehouseCode: string;
  warehouseName: string;
  baseQuantity: number;
  requiredQuantity: number;
  lastPurchasePrice: number;
  lineCost: number;
  calculation: string;
}

/**
 * @description Material consolidado dentro de una unidad de medida (`byUnit`), con sus líneas físicas.
 */
export interface ReferenceAuditUnitMaterial {
  materialCode: string;
  name: string;
  linesCount: number;
  unitPrices: number[];
  priceVariation: boolean;
  warehouses: string[];
  quantityPerProduct: number;
  quantityForPlan: number;
  costPerProduct: number;
  costForPlan: number;
  lines: ReferenceAuditUnitLine[];
}

/**
 * @description Agrupación de materiales por unidad de medida (UN, Kg, m2, etc.).
 */
export interface ReferenceAuditByUnit {
  unit: string;
  materialsCount: number;
  linesCount: number;
  quantityPerProduct: number;
  quantityForPlan: number;
  costPerProduct: number;
  costForPlan: number;
  materials: ReferenceAuditUnitMaterial[];
}

/**
 * @description Línea de nivel 1 con su precio propio (ERP) y el costo real derivado (`rolledCost`/`gap`).
 */
export interface ReferenceAuditLevel1Line {
  position: number;
  itemType: string;
  productCode: string;
  name: string;
  warehouseCode: string;
  unit: string;
  requiredQuantity: number;
  lastPurchasePrice: number;
  lineCost: number;
  calculation: string;
  excluded: boolean;
  rolledCost: number;
  gap: number;
}

/**
 * @description Prueba del costo oficial: rollup recursivo de todas las líneas de nivel 1 incluidas.
 */
export interface ReferenceAuditLevel1CostProof {
  formula: string;
  excludePrefixes: string[];
  level1Lines: number;
  includedLines: number;
  excludedLines: number;
  totalCostPerProduct: number;
  totalCostForPlan: number;
  excludedCostPerProduct: number;
  allLevel1CostPerProduct: number;
  lines: ReferenceAuditLevel1Line[];
}

/**
 * @description Resultado completo de la auditoría trazable a Excel de una referencia.
 */
export interface ReferenceAuditResult {
  reference: ReferenceAnalysisInfo;
  plannedQuantity: number;
  appliedFilters: ReferenceAuditAppliedFilters;
  howToRead: ReferenceAuditHowToRead;
  byUnit: ReferenceAuditByUnit[];
  level1CostProof: ReferenceAuditLevel1CostProof;
}

/**
 * @description Respuesta del backend con la auditoría trazable a Excel de una referencia.
 */
export interface ReferenceAuditResponse {
  ok: boolean;
  msg: ReferenceAuditResult;
}

// =====================================================================
//  DETALLE DE AUDITORÍA (POST /plannig/productStructure/auditDetail)
// =====================================================================

/**
 * @description Payload para el detalle de auditoría (reconciliación exacta + deepGaps) de una referencia
 * (POST /plannig/productStructure/auditDetail).
 */
export interface ReferenceAuditDetailPayload {
  internalCode: string;
  plannedQuantity: number;
}

/**
 * @description Totales por método de costeo (oficial vs. explosión completa) del detalle de auditoría.
 */
export interface ReferenceAuditDetailMethodTotals {
  industrialLevel1PerUnit: number;
  industrialLevel1ForPlan: number;
  allLevel1PerUnit: number;
  explodedRawMaterialPerUnit: number;
  explodedRawMaterialForPlan: number;
  nonDecomposedProductCostPerUnit: number;
  totalLaborHoursPerUnit: number;
}

/**
 * @description Desglose de qué explica la diferencia residual (debería ser 0) en la reconciliación exacta.
 */
export interface ReferenceAuditDetailExplainedBy {
  excludedLinesContent: number;
  orphanMaterialContent: number;
  sum: number;
}

/**
 * @description Verificación cruzada: la suma de los subárboles de nivel 1 debe igualar el total de materia
 * prima reconciliado, sin contenido huérfano.
 */
export interface ReferenceAuditDetailPartitionCrossCheck {
  sumOfSubtreeContents: number;
  fullMaterialTotal: number;
  orphanMaterialContent: number;
  match: boolean;
}

/**
 * @description Reconciliación matemática exacta entre la explosión completa de materia prima y el costo
 * oficial (rollup de nivel 1), con el gap total de desactualización de precios.
 */
export interface ReferenceAuditDetailReconciliation {
  formula: string;
  explodedRawMaterialPerUnit: number;
  hiddenRawMaterialContentPerUnit: number;
  nonDecomposedProductCostPerUnit: number;
  fullMaterialTotalPerUnit: number;
  industrialLevel1PerUnit: number;
  difference: number;
  explainedBy: ReferenceAuditDetailExplainedBy;
  priceStalenessGap: number;
  partitionCrossCheck: ReferenceAuditDetailPartitionCrossCheck;
}

/**
 * @description Resumen de líneas de nivel 1 incluidas/excluidas en el detalle de auditoría.
 */
export interface ReferenceAuditDetailSummary {
  level1Lines: number;
  includedLines: number;
  excludedLines: number;
  excludePrefixes: string[];
}

/**
 * @description Línea de nivel 1 con su diagnóstico textual (precio propio vs. costo real de su subárbol).
 */
export interface ReferenceAuditDetailLevel1Line {
  position: number;
  itemType: string;
  productCode: string;
  name: string;
  warehouseCode: string;
  warehouseName: string;
  unit: string;
  requiredQuantity: number;
  lastPurchasePrice: number;
  lineCost: number;
  excluded: boolean;
  subtreeLines: number;
  subtreeMaterialContent: number;
  priceMinusContent: number;
  subtreeTimeHours: number;
  diagnosis: string;
}

/**
 * @description Resultado completo del detalle de auditoría: reconciliación exacta + deepGaps completos.
 */
export interface ReferenceAuditDetailResult {
  reference: ReferenceAnalysisInfo;
  plannedQuantity: number;
  theoryUnderTest: string;
  methodTotals: ReferenceAuditDetailMethodTotals;
  reconciliation: ReferenceAuditDetailReconciliation;
  findings: string[];
  summary: ReferenceAuditDetailSummary;
  level1Detail: ReferenceAuditDetailLevel1Line[];
  deepGaps: DeepGap[];
}

/**
 * @description Respuesta del backend con el detalle de auditoría de una referencia.
 */
export interface ReferenceAuditDetailResponse {
  ok: boolean;
  msg: ReferenceAuditDetailResult;
}

// =====================================================================
//  AUDITORÍA DE COSTOS CONSOLIDADA (POST /plannig/productStructure/costAudit)
// =====================================================================

/**
 * @description Payload (todo opcional) para la auditoría de costos consolidada sobre todas las
 * referencias cargadas (POST /plannig/productStructure/costAudit).
 */
export interface CostAuditPayload {
  excludePrefixes?: string[];
  onlyMismatches?: boolean;
  minDifference?: number;
}

/**
 * @description Filtros aplicados (con sus valores efectivos) a la auditoría de costos consolidada.
 */
export interface CostAuditAppliedFilters {
  excludePrefixes: string[];
  onlyMismatches: boolean;
  minDifference: number;
}

/**
 * @description Totales agregados de la auditoría de costos consolidada.
 */
export interface CostAuditSummary {
  referencesAudited: number;
  referencesWithStalePrices: number;
  referencesReturned: number;
  appliedFilters: CostAuditAppliedFilters;
  totalMaterialCost: number;
  totalExplodedMaterialCost: number;
  totalPriceStalenessGap: number;
}

/**
 * @description Auditoría de costos de una referencia dentro del listado consolidado, priorizada por
 * `priceStalenessGap` (antes se priorizaba por `|difference|`, que con el rollup da 0 por construcción).
 */
export interface CostAuditReference {
  internalCode: string;
  codRef: string;
  reference: string;
  productName: string;
  bomLines: number;
  materialCostPerUnit: number;
  explodedMaterialCostPerUnit: number;
  nonDecomposedProductCostPerUnit: number;
  fullMaterialTotalPerUnit: number;
  structuralDifference: number;
  priceStalenessGap: number;
  percentStaleness: number;
  matches: boolean;
  topContributors: PriceStalenessContributor[];
}

/**
 * @description Resultado completo de la auditoría de costos consolidada.
 */
export interface CostAuditResult {
  summary: CostAuditSummary;
  references: CostAuditReference[];
}

/**
 * @description Respuesta del backend con la auditoría de costos consolidada.
 */
export interface CostAuditResponse {
  ok: boolean;
  msg: CostAuditResult;
}

// =====================================================================
//  CAPACIDAD DE PLANTA (POST /plannig/productStructure/capacity) Y
//  OPTIMIZACIÓN DE PRODUCCIÓN (POST /plannig/productStructure/optimization)
// =====================================================================

/**
 * @description Turno de trabajo dentro de una jornada (hora de inicio y fin, formato 'HH:mm').
 */
export interface WorkScheduleShift {
  start: string;
  end: string;
}

/**
 * @description Jornada de trabajo configurable: turnos, bodegas a las que aplica (o `default` para el resto).
 */
export interface WorkSchedule {
  name: string;
  warehouses?: string[];
  shifts: WorkScheduleShift[];
  breakMinutes?: number;
  daysPerWeek: number;
  default?: boolean;
}

/**
 * @description Mapeo de código de bodega a uno o varios departamentos de personal.
 */
export type WarehouseStaffMap = Record<string, string | string[]>;

/**
 * @description Payload compartido por el análisis de capacidad y la optimización de producción.
 */
export interface CapacityAnalysisPayload {
  references: MaterialsAnalysisReferenceInput[];
  workSchedules: WorkSchedule[];
  staffArea: string;
  warehouseStaffMap: WarehouseStaffMap;
}

/**
 * @description Payload de la optimización de producción (mismo shape que el análisis de capacidad).
 */
export type ProductionOptimizationPayload = CapacityAnalysisPayload;

/**
 * @description Bodega identificada como referencia crítica dentro del resumen de capacidad.
 */
export interface CapacityCriticalWarehouse {
  warehouseCode: string;
  warehouseName: string;
  departament: string;
}

/**
 * @description Totales agregados del análisis de capacidad.
 */
export interface CapacitySummary {
  staffArea: string;
  referencesAnalyzed: number;
  totalManHours: number;
  estimatedProductionDays: number;
  estimatedProductionWeeks: number;
  criticalWarehouse: CapacityCriticalWarehouse;
  warehousesComputed: number;
  warehousesNotComputed: number;
  note: string;
}

/**
 * @description Bodega identificada como cuello de botella dentro del análisis de capacidad.
 */
export interface CapacityBottleneck {
  rank: number;
  warehouseCode: string;
  warehouseName: string;
  departament: string;
  availablePeople: number;
  dailyCapacityHours: number;
  totalManHours: number;
  daysRequired: number;
  weeksRequired: number;
}

/**
 * @description Personal disponible asociado a una bodega dentro del análisis de capacidad.
 */
export interface CapacityStaff {
  departament: string;
  totalPeople: number;
  availablePeople: number;
  nonProductive: number;
  matchedBy: string;
}

/**
 * @description Carga y capacidad de una bodega dentro del análisis de capacidad.
 */
export interface CapacityWarehouseLoad {
  warehouseCode: string;
  warehouseName: string;
  totalManHours: number;
  totalPieces: number;
  workSchedule: WorkScheduleSummary;
  staff: CapacityStaff;
  dailyCapacityHours: number;
  daysRequired: number;
  weeksRequired: number;
  rank: number;
  isBottleneck: boolean;
}

/**
 * @description Resultado completo del análisis de capacidad de planta.
 */
export interface CapacityAnalysisResult {
  references: ScenarioReferenceResult[];
  summary: CapacitySummary;
  bottlenecks: CapacityBottleneck[];
  byWarehouse: CapacityWarehouseLoad[];
}

/**
 * @description Respuesta del backend con el análisis de capacidad de planta.
 */
export interface CapacityAnalysisResponse {
  ok: boolean;
  msg: CapacityAnalysisResult;
}

/**
 * @description Totales agregados de la optimización de producción.
 */
export interface OptimizationSummary {
  staffArea: string;
  horizonDays: number;
  referencesAnalyzed: number;
  constrainedSections: number;
  excludedSections: number;
  requestedPlanFeasible: boolean;
  note: string;
}

/**
 * @description Cantidad planeada de una referencia dentro del plan solicitado.
 */
export interface OptimizationPlanItem {
  internalCode: string;
  quantity: number;
}

/**
 * @description Carga y utilización de una bodega dentro del plan solicitado.
 */
export interface OptimizationSectionLoad {
  warehouseCode: string;
  warehouseName: string;
  loadHours: number;
  capacityHours: number;
  utilizationPercent: number;
  queueRisk: string;
}

/**
 * @description Resultado de evaluar el plan tal como fue solicitado (sin optimizar).
 */
export interface OptimizationRequestedPlan {
  horizonDays: number;
  plan: OptimizationPlanItem[];
  bySection: OptimizationSectionLoad[];
  feasible: boolean;
}

/**
 * @description Bodega limitante identificada dentro de un resultado de optimización.
 */
export interface OptimizationLimitingSection {
  warehouseCode: string;
  warehouseName: string;
}

/**
 * @description Máximo de unidades producibles de una referencia, dada la bodega que la limita.
 */
export interface OptimizationMaxByReference {
  internalCode: string;
  productName: string;
  maxUnits: number;
  maxUnitsInteger: number;
  limitingSection: OptimizationLimitingSection;
}

/**
 * @description Unidades de una referencia dentro de la mezcla proporcional (escala el plan solicitado).
 */
export interface OptimizationProportionalItem {
  internalCode: string;
  requestedQuantity: number;
  maxUnits: number;
  maxUnitsInteger: number;
}

/**
 * @description Mezcla proporcional: escala el plan solicitado al máximo que la capacidad permite.
 */
export interface OptimizationProportionalMix {
  scaleFactor: number;
  limitingSection: OptimizationLimitingSection;
  production: OptimizationProportionalItem[];
  totalUnits: number;
}

/**
 * @description Unidades de una referencia dentro de la mezcla óptima (resultado de programación lineal).
 */
export interface OptimizationMixItem {
  internalCode: string;
  productName: string;
  weight: number;
  units: number;
  unitsInteger: number;
}

/**
 * @description Bodega que restringe activamente la mezcla óptima, con su precio sombra.
 */
export interface OptimizationBindingSection {
  warehouseCode: string;
  warehouseName: string;
  departament: string;
  capacityHours: number;
  shadowPricePerHour: number;
}

/**
 * @description Mezcla óptima de producción (maximiza unidades totales sujeto a la capacidad de cada bodega).
 */
export interface OptimalMix {
  objective: string;
  totalZ: number;
  production: OptimizationMixItem[];
  bindingSections: OptimizationBindingSection[];
}

/**
 * @description Capacidad disponible de una bodega considerada en la optimización.
 */
export interface OptimizationSection {
  warehouseCode: string;
  warehouseName: string;
  departament: string;
  availablePeople: number;
  effectiveHoursPerDay: number;
  capacityHours: number;
}

/**
 * @description Resultado completo de la optimización de producción.
 */
export interface OptimizationResult {
  summary: OptimizationSummary;
  requestedPlan: OptimizationRequestedPlan;
  maxByReference: OptimizationMaxByReference[];
  proportionalMix: OptimizationProportionalMix;
  optimalMix: OptimalMix;
  sections: OptimizationSection[];
}

/**
 * @description Respuesta del backend con el resultado de la optimización de producción.
 */
export interface ProductionOptimizationResponse {
  ok: boolean;
  msg: OptimizationResult;
}
