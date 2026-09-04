// src/app/core/interfaces/assembly.interface.ts

// Interfaz para la respuesta de las tarjetas (ya la tenías)
export interface AssemblyMetrics {
  TotalReadingsRecorded: number;
  TotalValidUnits: number;
  TotalErrorMarked: number;
  TotalDuplicated: number;
}

export interface CardAssemblyResponse {
  ok: boolean;
  msg: AssemblyMetrics;
}

// NUEVO: Interfaz para un solo producto de la respuesta del backend
export interface ProductData {
  productCode: string;
  productName: string;
  Producidos: number; // La P y la V son mayúsculas, como en tu JSON
  Validos: number;
}

// NUEVO: Interfaz para la respuesta completa de la API de top products
export interface TopProductsResponse {
  ok: boolean;
  msg: ProductData[]; // Es un array de ProductData
}

// NUEVO: La estructura que necesita el gráfico ApexCharts
export interface ChartData {
  categories: string[];
  produced: number[];
  valid: number[];
  // Cantidad programada (planeación del día) alineada con `categories`.
  planned?: number[];
  // `true` cuando el producto no está en la planeación del día (se pinta en rojo).
  plannedMissing?: boolean[];
}

// NUEVO: La estructura que el servicio le entregará al componente
export interface ChartDataResponse {
  ok: boolean;
  msg: ChartData;
}

// Interfaz para las tarjetas (ya la tenías)
export interface Card {
  background: string;
  title: string;
  icon: string;
  text: string;
  number: string;
  no: string;
}

export interface TopProductsItem {
    productCode: string;
    productName: string;
    Producidos: number; // Total de unidades producidas (con y sin error)
    Validos: number;    // Total de unidades sin error
}

// Interfaz para cada item de referencia del producto
export interface ReferenceItem {
    EAN: string;
    productCode: string;
    productName: string;
    reference: string;
}

// Interfaz para la respuesta completa del backend
export interface ReferenceSearchResponse {
    ok: boolean;
    msg: ReferenceItem[]; // El array de resultados
}

/**
 * @description Identidad mínima del usuario que dispara una acción sobre una novedad.
 */
export interface NewsUserRef {
  uid: string;
  userApp: string;
  name: string;
  area: string;
  subArea: string;
}

/**
 * @description Información del origen de la novedad (quién, dónde y qué máquina).
 */
export interface NewsOrigin {
  area: string;
  subArea?: string;
  location?: string;
  machineCode?: string;
  machineName?: string;
  reportedBy?: NewsUserRef;
  reportedAt?: string;
}

/**
 * @description Información del área a la cual la novedad fue asignada.
 */
export interface NewsAssignment {
  currentArea: string;
  currentSubArea?: string;
  assignedAt?: string;
  assignedBy?: NewsUserRef;
}

/**
 * @description Datos de la parada productiva asociada a la novedad.
 */
export interface NewsStop {
  stopType?: string;
  startTime?: string;
  endTime?: string;
  totalTime?: string;
  isOngoing?: boolean;
}

/**
 * @description Cada respuesta histórica dada a la novedad.
 */
export interface NewsResponseItem {
  observation: string;
  actionTaken?: string;
  rootCause?: string;
  respondedBy?: NewsUserRef;
  respondedAt?: string;
}

/**
 * @description Cada entrada del historial de auditoría.
 */
export interface NewsAuditItem {
  action: string;
  modifiedBy?: NewsUserRef;
  modifiedAt?: string;
  observation?: string;
  previousState?: unknown;
}

/**
 * @description Representa una única novedad de producción.
 * (Basado en la respuesta de /assembly/viewNews)
 */
export interface ProductionNews {
  _id: string;
  newsDate: string;
  category: string;
  reference: string;
  detail: string;
  dateCreate: string;

  origin?: NewsOrigin;
  assignment?: NewsAssignment;
  stop?: NewsStop;

  status?: 'pending' | 'responded' | 'closed' | string;
  hasResponse?: boolean;
  needsRedirect?: boolean;
  isClosed?: boolean;
  responses?: NewsResponseItem[];
  auditTrail?: NewsAuditItem[];

  // Campos legacy (planos) que aún viajan en la respuesta del backend.
  assemblyLine?: string;
  responsible?: string;
  responsibleNote?: string;
  stopType?: string;
  startTime?: string;
  endTime?: string;
  totalTime?: string;
  __v?: number;
}

/**
 * @description La respuesta completa del endpoint /assembly/viewNews.
 */
export interface ProductionNewsResponse {
  ok: boolean;
  msg: ProductionNews[];
}

/**
 * @description Cuerpo de la respuesta que el frontend envía al backend.
 */
export interface NewsReplyBody {
  observation: string;
  actionTaken: string;
  rootCause: string;
  respondedBy: NewsUserRef;
  respondedAt: string;
}

/**
 * @description Datos del área destino cuando se redirecciona la novedad.
 */
export interface NewsRedirectTo {
  area: string;
  subArea: string;
}

/**
 * @description Payload que el frontend envía a POST /assembly/replyNew.
 * `redirectTo` viaja siempre (con strings vacíos cuando `needsRedirect` es false).
 */
export interface NewsReplyPayload {
  newsId: string;
  response: NewsReplyBody;
  needsRedirect: boolean;
  redirectTo: NewsRedirectTo;
  closeNews: boolean;
}

/**
 * @description Respuesta del endpoint /assembly/replyNew.
 * - Éxito: `{ ok: true, msg, data: { _id } }`
 * - Error: `{ ok: false, msg }`
 */
export interface NewsReplyResponse {
  ok: boolean;
  msg: string;
  data?: {
    _id: string;
  };
}

/**
 * @description Identidad de quien realiza una acción de control cruzado de Packing List.
 * El backend también acepta un simple string (login/usuario), que se interpreta como `userApp`.
 */
export interface PackingListActorRef {
  uid?: string;
  userApp?: string;
  name?: string;
}

/**
 * @description Cada entrada del historial de auditoría del control de Packing List
 * (queda una entrada por cada check/uncheck realizado sobre el item).
 */
export interface PackingListAuditItem {
  action: string;
  modifiedBy?: PackingListActorRef;
  modifiedAt?: string;
  observation?: string;
  previousState?: unknown;
}

/**
 * @description Estado de verificación cruzada (packing) de un registro de picking.
 */
export interface PackingListStatus {
  checked: boolean;
  checkedBy?: PackingListActorRef;
  checkedAt?: string;
  observation?: string;
  auditTrail?: PackingListAuditItem[];
}

/**
 * @description Registro de picking (LoadBarcode) devuelto por /assembly/packingList,
 * incluyendo su estado de verificación cruzada (packingList).
 */
export interface PackingListRecord {
  _id: string;
  barcode: string;
  productCode: string;
  productName: string;
  consecutiveProduct: string;
  processDate: string;
  date: string;
  hour: string;
  errorMark: string;
  isDuplicated: boolean;
  packingList: PackingListStatus;
}

/**
 * @description Respuesta del endpoint POST /assembly/packingList.
 */
export interface PackingListResponse {
  ok: boolean;
  msg: PackingListRecord[];
}

/**
 * @description Payload que el frontend envía a POST /assembly/packingList/check.
 * `checkedBy` acepta el objeto completo o, por conveniencia, un simple login/usuario.
 */
export interface PackingListCheckPayload {
  id: string;
  checked: boolean;
  observation?: string;
  checkedBy: string | PackingListActorRef;
}

/**
 * @description Respuesta del endpoint POST /assembly/packingList/check.
 * - Éxito: `{ ok: true, msg, data: PackingListRecord }`
 * - Error: `{ ok: false, msg }`
 */
export interface PackingListCheckResponse {
  ok: boolean;
  msg: string;
  data?: PackingListRecord;
}

/**
 * @description Respuesta del endpoint POST /assembly/packingList/crossValidate.
 * - Éxito: `{ ok: true, msg, totalSeriales, totalValidados, unmatchedCount, unmatchedBarcodes }`
 * - Error: `{ ok: false, msg }` (ej: archivo sin seriales de 27 dígitos válidos)
 */
export interface PackingListCrossValidateResponse {
  ok: boolean;
  msg: string;
  totalSeriales?: number;
  totalValidados?: number;
  unmatchedCount?: number;
  unmatchedBarcodes?: string[];
}

/**
 * @description Respuesta del endpoint POST /assembly/loadAssembly.
 * Recibe un archivo CSV (un barcode por línea) en el campo `resulBarcode`,
 * mismo formato que usaba la app Flutter "control_inventario" (VersionWEB.py).
 */
export interface LoadAssemblyResponse {
  ok: boolean;
  msg: string;
  data?: unknown;
}


