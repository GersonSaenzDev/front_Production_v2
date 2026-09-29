// src/app/interfaces/loading-order.interface.ts
//
// Contrato del flujo Orden de Cargue (OC) -> prealistamiento en bodega.
// Backend: /api/storage/loadingOrders/* (src/production/storage en api_produccion).

export type LoadingOrderStatus = 'PENDING' | 'IN_PICKING' | 'PICKED' | 'PICKED_PARTIAL' | 'LOADING' | 'DISPATCHED' | 'CANCELLED';

export type LoadingOrderRejectReason =
  | 'SERIAL_NOT_IN_LOADBARCODE'
  | 'PRODUCT_NOT_IN_ORDER'
  | 'QTY_EXCEEDED'
  | 'ALREADY_READ_IN_ORDER'
  | 'COMMITTED_IN_OTHER_ORDER'
  | 'SERIAL_NOT_AVAILABLE';

export type LoadingOrderReadStatus = 'ACTIVE' | 'VOIDED' | 'REJECTED';
export type LoadingOrderUploadRejectReason = 'DUPLICATE_IDENTICAL' | 'DUPLICATE_MODIFIED' | 'INVALID_FORMAT';
export type SummumExportStatus = 'NOT_GENERATED' | 'PENDING_FORMAT' | 'GENERATED';
export type LoadingOrderCloseType = '' | 'FULL' | 'PARTIAL';

/** Respuesta estándar del backend. */
export interface LoadingOrderApiResponse<T> {
  ok: boolean;
  msg?: string;
  data: T;
  total?: number;
}

export interface LoadingOrderActor {
  uid: string;
  userApp: string;
  name: string;
}

export interface LoadingOrderTotals {
  lines: number;
  authorizations: number;
  products: number;
  requestedQty: number;
  pickedQty: number;
  dockQty: number;
}

export interface LoadingOrderProgress {
  requestedQty: number;
  pickedQty: number;
  pendingQty: number;
  percent: number;
}

/** Avance de una autorización dentro de un producto de la lista de prealistamiento. */
export interface LoadingOrderAuthorizationProgress {
  lineId: string;
  prefix: string;
  authorization: string;
  requestedQty: number;
  pickedQty: number;
  pendingQty: number;
}

/** Producto consolidado (todas sus autorizaciones) de la lista de prealistamiento. */
export interface LoadingOrderPickItem {
  product: string;
  reference: string;
  productName: string;
  requestedQty: number;
  pickedQty: number;
  pendingQty: number;
  authorizations: LoadingOrderAuthorizationProgress[];
}

export interface LoadingOrderPicking {
  startedAt: string;
  startedBy?: LoadingOrderActor;
  lastReadAt: string;
  completedAt: string;
  completedBy?: LoadingOrderActor;
}

export interface LoadingOrderMissingLine {
  prefix: string;
  authorization: string;
  product: string;
  reference: string;
  requestedQty: number;
  pickedQty: number;
  missingQty: number;
}

export interface LoadingOrderClosure {
  closeType: LoadingOrderCloseType;
  observation: string;
  missingQty: number;
  missing: LoadingOrderMissingLine[];
}

export interface LoadingOrderSummumExport {
  status: SummumExportStatus;
  fileName: string;
  generatedAt: string;
  generatedBy?: LoadingOrderActor;
  msg?: string;
  content?: string;
}

export interface LoadingOrderAuditEntry {
  _id?: string;
  action: string;
  modifiedBy: LoadingOrderActor;
  modifiedAt: string;
  observation: string;
  previousState: unknown;
}

export interface LoadingOrderRead {
  _id: string;
  loadingOrderId: string;
  loadingOrder: string;
  stage: 'PICKING' | 'DOCK';
  status: LoadingOrderReadStatus;
  rejectReason: LoadingOrderRejectReason | '';
  serial: string;
  prefix: string;
  authorization: string;
  product: string;
  reference: string;
  productName: string;
  readBy: LoadingOrderActor;
  readAt: string;
  voided?: { by: LoadingOrderActor; at: string; observation: string };
}

/** Vista completa de una OC (next / detail / upload). */
export interface LoadingOrderView {
  _id: string;
  loadingOrder: string;
  status: LoadingOrderStatus;
  priority: number;
  allowPartialClose: boolean;
  closure?: LoadingOrderClosure;
  dateCreate: string;
  sourceFile?: { fileName: string };
  totals: LoadingOrderTotals;
  progress: LoadingOrderProgress;
  picking?: LoadingOrderPicking;
  summumExport?: LoadingOrderSummumExport;
  pickList: LoadingOrderPickItem[];
  reads?: LoadingOrderRead[];
  auditTrail?: LoadingOrderAuditEntry[];
}

/** Fila del listado de OC (sin líneas). */
export interface LoadingOrderSummary {
  _id: string;
  loadingOrder: string;
  status: LoadingOrderStatus;
  priority: number;
  allowPartialClose: boolean;
  closure?: LoadingOrderClosure;
  totals: LoadingOrderTotals;
  picking?: LoadingOrderPicking;
  summumExport?: LoadingOrderSummumExport;
  sourceFile?: { fileName: string };
  dateCreate: string;
  createdBy?: LoadingOrderActor;
}

// ---------------------------------------------------------------------------------------
// Cargue del archivo .PRN
// ---------------------------------------------------------------------------------------

export interface LoadingOrderLineDifference {
  prefix: string;
  authorization: string;
  product: string;
  storedQty: number;
  incomingQty: number;
  change: 'ADDED' | 'REMOVED' | 'QTY_CHANGED';
}

export interface LoadingOrderUploadRejected {
  loadingOrder: string;
  reason: LoadingOrderUploadRejectReason;
  msg: string;
  differences: LoadingOrderLineDifference[];
}

export interface LoadingOrderFormatError {
  lineNumber: number;
  line: string;
  reason: string;
}

export interface LoadingOrderUploadResult {
  created: LoadingOrderView[];
  rejected: LoadingOrderUploadRejected[];
}

/** Cuerpo de respuesta del cargue (éxito o error 400/409). */
export interface LoadingOrderUploadResponse {
  ok: boolean;
  msg: string;
  data?: LoadingOrderUploadResult;
  errors?: LoadingOrderFormatError[];
}

export interface LoadingOrderRejection {
  _id: string;
  loadingOrder: string;
  reason: LoadingOrderUploadRejectReason;
  fileName: string;
  differences: LoadingOrderLineDifference[];
  formatErrors: LoadingOrderFormatError[];
  rejectedBy: LoadingOrderActor;
  emailAlert: { sent: boolean; recipients: string[]; error: string };
  dateCreate: string;
}

// ---------------------------------------------------------------------------------------
// Operación (lectura, anulación, cierre)
// ---------------------------------------------------------------------------------------

export interface LoadingOrderListRequest {
  status?: LoadingOrderStatus[];
  loadingOrder?: string;
  /** YYYY-MM-DD */
  from?: string;
  /** YYYY-MM-DD */
  to?: string;
}

export interface LoadingOrderDetailRequest {
  loadingOrderId: string;
  includeReads?: boolean;
  includeAudit?: boolean;
}

export interface ScanSerialRequest {
  loadingOrderId: string;
  /** Serial EAN128 de 27 dígitos */
  serial: string;
}

export interface ScanSerialResult {
  read: {
    _id: string;
    serial: string;
    product: string;
    reference: string;
    productName: string;
    prefix: string;
    authorization: string;
    readAt: string;
  };
  productProgress: LoadingOrderPickItem;
  orderProgress: LoadingOrderProgress;
  isProductComplete: boolean;
  isOrderComplete: boolean;
}

/** Cuerpo de respuesta de la lectura (éxito o rechazo 409). */
export interface ScanSerialResponse {
  ok: boolean;
  msg: string;
  rejectReason?: LoadingOrderRejectReason;
  data?: ScanSerialResult | { committedIn: string; readAt: string };
}

export interface NextPickItemResult {
  loadingOrder: string;
  isOrderComplete: boolean;
  item: LoadingOrderPickItem | null;
  remainingProducts: number;
  /** Texto listo para lectura por voz */
  speechText: string;
}

export interface VoidReadRequest {
  readId: string;
  observation: string;
}

export interface CompletePickingRequest {
  loadingOrderId: string;
  /** Obligatorio cuando el cierre es parcial */
  observation?: string;
}

export interface CompletePickingResult {
  _id: string;
  loadingOrder: string;
  status: LoadingOrderStatus;
  totalUnits: number;
  missingQty: number;
  missing: LoadingOrderMissingLine[];
  summumExport: LoadingOrderSummumExport;
}

/** Cuerpo de respuesta del cierre (éxito o rechazo 400/409 con pendientes). */
export interface CompletePickingResponse {
  ok: boolean;
  msg: string;
  data?: CompletePickingResult | { pending: LoadingOrderPickItem[] };
}

export interface PartialCloseRequest {
  loadingOrderId: string;
  allowPartialClose: boolean;
  observation: string;
}

export interface LoadingOrderAccess {
  isWarehouseAdmin: boolean;
}

/** Etiquetas en español para la interfaz. */
export const LOADING_ORDER_STATUS_LABELS: Record<LoadingOrderStatus, string> = {
  PENDING: 'Pendiente',
  IN_PICKING: 'En prealistamiento',
  PICKED: 'Alistada',
  PICKED_PARTIAL: 'Alistada parcial',
  LOADING: 'En cargue',
  DISPATCHED: 'Despachada',
  CANCELLED: 'Cancelada'
};

export const LOADING_ORDER_REJECT_LABELS: Record<LoadingOrderRejectReason, string> = {
  SERIAL_NOT_IN_LOADBARCODE: 'Sin entrega de producción',
  PRODUCT_NOT_IN_ORDER: 'No pertenece a la OC',
  QTY_EXCEEDED: 'Cantidad completa',
  ALREADY_READ_IN_ORDER: 'Ya leído',
  COMMITTED_IN_OTHER_ORDER: 'En otra OC',
  SERIAL_NOT_AVAILABLE: 'No disponible'
};
