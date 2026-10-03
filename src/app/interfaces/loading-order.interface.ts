// src/app/interfaces/loading-order.interface.ts
//
// Contrato del flujo Orden de Cargue (OC) -> prealistamiento en bodega.
// Backend: /api/storage/loadingOrders/* (src/production/storage en api_produccion).

export type LoadingOrderStatus = 'PENDING' | 'IN_PICKING' | 'PAUSED' | 'PICKED' | 'PICKED_PARTIAL' | 'LOADING' | 'DISPATCHED' | 'CANCELLED';

export type LoadingOrderRejectReason =
  | 'SERIAL_NOT_IN_LOADBARCODE'
  | 'PRODUCT_NOT_IN_ORDER'
  | 'QTY_EXCEEDED'
  | 'ALREADY_READ_IN_ORDER'
  | 'COMMITTED_IN_OTHER_ORDER'
  | 'SERIAL_NOT_AVAILABLE'
  // Cargue en muelle
  | 'NOT_PICKED'
  | 'PICKED_IN_OTHER_ORDER'
  | 'ALREADY_LOADED'
  | 'ORDER_NOT_READY';

export type LoadingOrderReadStatus = 'ACTIVE' | 'VOIDED' | 'REJECTED';
export type LoadingOrderUploadRejectReason = 'DUPLICATE_IDENTICAL' | 'DUPLICATE_MODIFIED' | 'INVALID_FORMAT';
export type SummumExportStatus = 'NOT_GENERATED' | 'PENDING_FORMAT' | 'GENERATED' | 'FORMAT_ERROR';
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

/** Vehículo y conductor de la OC (los diligencia el administrativo de Bodega). */
export interface LoadingOrderDispatch {
  vehiclePlate: string;
  driverName: string;
  driverDocument: string;
  driverPhone?: string;
  carrier?: string;
  assignedAt?: string;
  assignedBy?: LoadingOrderActor;
  loadingStartedAt?: string;
  loadingStartedBy?: LoadingOrderActor;
  completedAt?: string;
  completedBy?: LoadingOrderActor;
}

/** Operario asignado a la OC (cuenta de login en MAYÚSCULAS). Sin asignados = cola libre. */
export interface LoadingOrderAssignee {
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
  pausedAt?: string;
  pausedBy?: LoadingOrderActor;
  pauseObservation?: string;
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

/** Archivo .sal para Summum (salida contable). Se envía por correo a BDCC al cerrar el prealistamiento. */
export interface LoadingOrderSummumExport {
  status: SummumExportStatus;
  fileName: string;
  generatedAt?: string;
  generatedBy?: LoadingOrderActor;
  /** Unidades (líneas) del archivo */
  totalUnits?: number;
  /** Sube cada vez que se regenera (reposición de unidades); > 1 reemplaza al anterior */
  version?: number;
  msg?: string;
  email?: { sent: boolean; recipients: string[]; sentAt: string; error: string };
}

export const SUMMUM_EXPORT_LABELS: Record<SummumExportStatus, string> = {
  NOT_GENERATED: 'Sin generar',
  PENDING_FORMAT: 'Formato pendiente',
  GENERATED: 'Generado',
  FORMAT_ERROR: 'Error de estructura'
};

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
  assignedTo: LoadingOrderAssignee[];
  dispatch?: LoadingOrderDispatch;
  closure?: LoadingOrderClosure;
  dateCreate: string;
  sourceFile?: { fileName: string };
  totals: LoadingOrderTotals;
  progress: LoadingOrderProgress;
  picking?: LoadingOrderPicking;
  summumExport?: LoadingOrderSummumExport;
  pickList: LoadingOrderPickItem[];
  reads?: LoadingOrderRead[];
  /** Seriales ya subidos al vehículo (lecturas de muelle activas); viene con includeReads */
  loadedSerials?: string[];
  auditTrail?: LoadingOrderAuditEntry[];
}

/** Fila del listado de OC (sin líneas). */
export interface LoadingOrderSummary {
  _id: string;
  loadingOrder: string;
  status: LoadingOrderStatus;
  priority: number;
  allowPartialClose: boolean;
  assignedTo?: LoadingOrderAssignee[];
  dispatch?: LoadingOrderDispatch;
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
  /** Productos que OTRO operario está leyendo ahora en esta OC (para no ir por la misma unidad) */
  othersWorking: { product: string; userApp: string; name: string }[];
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

export interface PausePickingRequest {
  loadingOrderId: string;
  observation: string;
}

/** OC en pausa (GET /loadingOrders/paused) para elegir cuál retomar. */
export interface PausedLoadingOrder {
  _id: string;
  loadingOrder: string;
  status: LoadingOrderStatus;
  priority: number;
  assignedTo: LoadingOrderAssignee[];
  progress: LoadingOrderProgress;
  pausedAt: string;
  pausedBy: string;
  pauseObservation: string;
}

/** Operario de prealistamiento (GET /loadingOrders/operators). */
export interface PickingOperator {
  _id: string;
  userApp: string;
  name: string;
  active: boolean;
  /** OC abiertas (pendientes, en prealistamiento o en pausa) asignadas hoy */
  openOrders: number;
  dateCreate: string;
  lastUpdate: string;
}

export interface SavePickingOperatorRequest {
  userApp: string;
  name: string;
  active: boolean;
}

export interface AssignLoadingOrderRequest {
  loadingOrderId: string;
  /** userApp de los operarios; [] = cola libre */
  operators: string[];
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
  PAUSED: 'En pausa',
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
  SERIAL_NOT_AVAILABLE: 'No disponible',
  NOT_PICKED: 'Serial NO prealistado',
  PICKED_IN_OTHER_ORDER: 'Serial de OTRA OC',
  ALREADY_LOADED: 'Ya cargado',
  ORDER_NOT_READY: 'OC sin prealistamiento cerrado'
};

// ---------------------------------------------------------------------------------------
// Cargue en Muelle (backend: /api/storage/loadingOrders/dock/*)
// ---------------------------------------------------------------------------------------

export interface DispatchInfoRequest {
  loadingOrderId: string;
  vehiclePlate: string;
  driverName: string;
  driverDocument: string;
  driverPhone: string;
  carrier: string;
}

/** OC en la cola del muelle (sin cantidades). */
export interface DockOrder {
  _id: string;
  loadingOrder: string;
  status: LoadingOrderStatus;
  pickedAt: string;
  hasVehicle: boolean;
  vehiclePlate: string;
  driverName: string;
  driverDocument: string;
  loadingStartedBy: string;
  /** true cuando lo cargado coincide 100% con lo prealistado */
  isComplete: boolean;
}

export interface DockRead {
  _id: string;
  serial: string;
  loadingOrderId?: string;
  loadingOrder?: string;
  reference: string;
  productName: string;
  readAt: string;
  readBy: string;
}

/** Vista del operario de muelle: vehículo + lecturas, SIN cantidades. */
export interface DockView {
  _id: string;
  loadingOrder: string;
  status: LoadingOrderStatus;
  dispatch: {
    vehiclePlate: string;
    driverName: string;
    driverDocument: string;
    driverPhone: string;
    carrier: string;
    loadingStartedAt: string;
    loadingStartedBy: string;
  };
  /** true cuando lo cargado coincide 100% con lo prealistado */
  isComplete: boolean;
  reads: DockRead[];
}

export interface DockScanResult {
  read: DockRead;
  /** La OC del serial quedó 100% cargada */
  isComplete: boolean;
  hasVehicle: boolean;
}

export interface DockScanResponse {
  ok: boolean;
  msg: string;
  rejectReason?: LoadingOrderRejectReason;
  alertRaised?: boolean;
  data?: DockScanResult | { loadingOrder?: string };
}

export type DockAlertType = 'NOT_PICKED' | 'PICKED_IN_OTHER_ORDER' | 'MISSING_REPORTED' | 'CLOSE_MISMATCH' | 'ORDER_NOT_READY';

export interface DockAlert {
  _id: string;
  loadingOrderId: string;
  loadingOrder: string;
  type: DockAlertType;
  serial: string;
  detail: string;
  otherLoadingOrder: string;
  reference: string;
  productName: string;
  vehiclePlate: string;
  driverName: string;
  driverDocument: string;
  reportedBy: LoadingOrderActor;
  dateCreate: string;
  emailAlert: { sent: boolean; grouped: boolean; recipients: string[]; error: string };
  review: { reviewed: boolean; by?: LoadingOrderActor; at: string; observation: string };
}

export const DOCK_ALERT_LABELS: Record<DockAlertType, string> = {
  NOT_PICKED: 'Serial NO prealistado',
  PICKED_IN_OTHER_ORDER: 'Serial de otra OC',
  MISSING_REPORTED: 'Faltante reportado',
  CLOSE_MISMATCH: 'Descuadre al cerrar',
  ORDER_NOT_READY: 'OC sin prealistamiento cerrado'
};
