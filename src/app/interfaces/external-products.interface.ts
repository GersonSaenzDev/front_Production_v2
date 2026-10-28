// src/app/interfaces/external-products.interface.ts
//
// Contrato de Importaciones / Externos y Devoluciones / Garantías.
// Backend: /api/storage/external/* y /api/storage/returns/* (src/production/storage en api_produccion).

export interface ExternalApiResponse<T> {
  ok: boolean;
  msg?: string;
  data: T;
  total?: number;
  rejectReason?: string;
}

export interface ExternalActor {
  uid: string;
  userApp: string;
  name: string;
}

export interface ExternalAccess {
  isWarehouseAdmin: boolean;
  canManualExit: boolean;
  /** Crear/editar productos y carga por Excel: administrativos de Bodega + EXTERNAL_CATALOG_USERS (backend). */
  canManageCatalog?: boolean;
}

// ---------------------------------------------------------------- Ingreso
export type ExternalEntryRejectReason =
  | 'EMPTY'
  | 'NO_SERIAL'
  | 'NOT_GS1'
  | 'IN_PRODUCTION_RECEPTION'
  | 'ALREADY_ENTERED'
  | 'ALREADY_EXITED';

export const EXTERNAL_ENTRY_REJECT_LABELS: Record<ExternalEntryRejectReason, string> = {
  EMPTY: 'Lectura vacía',
  NO_SERIAL: 'Código sin serial',
  NOT_GS1: 'Código no reconocido',
  IN_PRODUCTION_RECEPTION: 'Es producto propio',
  ALREADY_ENTERED: 'Ya ingresado',
  ALREADY_EXITED: 'Ya salió de bodega'
};

export interface ExternalEntryRequest {
  barcode: string;
  entryReference?: string;
  observation?: string;
}

export interface ExternalEntryUnit {
  _id: string;
  barcode: string;
  gtin14: string;
  serial: string;
  identified: boolean;
  reference: string;
  productName: string;
  summumProduct: string;
  category: string;
  client: string;
  normalized: boolean;
  enteredAt: string;
}

export interface ExternalEntryResult {
  unit: ExternalEntryUnit;
  inStockForProduct: number;
  warnings: string[];
}

// ---------------------------------------------------------------- Inventario
export type ExternalStockStatus = 'AVAILABLE' | 'PICKED' | 'DISPATCHED' | 'EXITED' | 'VOIDED';

export const EXTERNAL_STOCK_STATUS_LABELS: Record<ExternalStockStatus, string> = {
  AVAILABLE: 'En bodega',
  PICKED: 'Alistado en OC',
  DISPATCHED: 'Despachado',
  EXITED: 'Salida manual',
  VOIDED: 'Ingreso anulado'
};

export type ExternalExitType = 'DAMAGE' | 'SUPPLIER_RETURN' | 'ADJUSTMENT';

export const EXTERNAL_EXIT_TYPE_LABELS: Record<ExternalExitType, string> = {
  DAMAGE: 'Baja por daño',
  SUPPLIER_RETURN: 'Devolución a proveedor',
  ADJUSTMENT: 'Ajuste de inventario'
};

export interface ExternalUnitFilters {
  client?: string;
  category?: string;
  gtin14?: string;
  identified?: boolean;
  enteredBy?: string;
  search?: string;
  from?: string;
  to?: string;
  stockStatus?: ExternalStockStatus | '';
  flag?: ExternalUnitFlag | '';
  page?: number;
  limit?: number;
  /** Descarga a Excel: el backend acepta limit hasta 20.000. */
  forExport?: boolean;
}

/** Novedades (marcaciones) de una unidad. ANY = cualquiera. Espejo de UNIT_FLAG_MATCH (backend). */
export type ExternalUnitFlag = 'ANY' | 'NOT_DISPATCHABLE' | 'INVALID_CHECK_DIGIT' | 'UNIDENTIFIED';

export const EXTERNAL_UNIT_FLAG_LABELS: Record<ExternalUnitFlag, string> = {
  ANY: 'Con novedad',
  NOT_DISPATCHABLE: 'No despachable',
  INVALID_CHECK_DIGIT: 'Verificador inválido',
  UNIDENTIFIED: 'No identificado'
};

export type ExternalUnitFlagCounts = Record<ExternalUnitFlag, number>;

export interface ExternalUnitsResponse extends ExternalApiResponse<ExternalUnit[]> {
  flagCounts?: ExternalUnitFlagCounts;
}

export interface ExternalUnit {
  _id: string;
  barcode: string;
  gtin14: string;
  gtin13: string;
  serial: string;
  status: 'IN_STOCK' | 'EXITED' | 'VOIDED';
  stockStatus: ExternalStockStatus;
  identified: boolean;
  identifiedBy: '' | 'CATALOG' | 'LABEL_CONTROLS';
  reference: string;
  productName: string;
  summumProduct: string;
  category: string;
  client: string;
  dispatchable: boolean;
  checkDigitValid: boolean;
  entry: { by: ExternalActor; at: string; date: string; entryReference: string; observation: string };
  exit?: { type: ExternalExitType | ''; document: string; observation: string; by: ExternalActor; at: string };
  voided?: { by: ExternalActor; at: string; observation: string };
  flow?: { status?: string; loadingOrder?: string; lastUpdate?: string };
}

export interface ExternalStockRow {
  gtin14: string;
  reference: string;
  productName: string;
  summumProduct: string;
  category: string;
  client: string;
  identified: boolean;
  available: number;
  picked: number;
  dispatched: number;
  exited: number;
  entered: number;
  lastEntryAt: string;
}

export interface ExternalStockTotals {
  available: number;
  picked: number;
  dispatched: number;
  exited: number;
  entered: number;
}

export interface ExternalStockSummary {
  rows: ExternalStockRow[];
  totals: ExternalStockTotals;
}

export interface ExternalTraceRead {
  _id: string;
  loadingOrder: string;
  stage: 'PICKING' | 'DOCK';
  status: 'ACTIVE' | 'VOIDED' | 'REJECTED';
  rejectReason: string;
  readBy: ExternalActor;
  readAt: string;
}

export interface ExternalAuditLog {
  _id: string;
  action: string;
  module: 'EXTERNAL' | 'RETURNS';
  barcode: string;
  actor: ExternalActor;
  ip: string;
  at: string;
  msg: string;
  detail: unknown;
}

export interface ExternalTrace {
  barcode: string;
  units: ExternalUnit[];
  flow: { status: string; loadingOrder: string; lastUpdate: string } | null;
  reads: ExternalTraceRead[];
  returns: WarrantyReturn[];
  logs: ExternalAuditLog[];
}

export interface ExternalManualExitRequest {
  barcodes: string[];
  exitType: ExternalExitType;
  document: string;
  observation: string;
}

export interface ExternalManualExitResult {
  results: { barcode: string; ok: boolean; msg: string; reference?: string }[];
  done: number;
  failed: number;
}

export const EXTERNAL_AUDIT_ACTION_LABELS: Record<string, string> = {
  ENTRY: 'Ingreso',
  ENTRY_REJECTED: 'Ingreso rechazado',
  ENTRY_VOIDED: 'Ingreso anulado',
  EXIT: 'Salida manual',
  EXIT_REJECTED: 'Salida rechazada',
  PRODUCT_CREATED: 'Producto creado',
  PRODUCT_UPDATED: 'Producto actualizado',
  PRODUCT_IMPORTED: 'Catálogo por Excel',
  UNITS_IDENTIFIED: 'Unidades identificadas',
  RETURN_RECEIVED: 'Devolución recibida',
  RETURN_REJECTED: 'Devolución rechazada',
  RETURN_CLOSED: 'Devolución cerrada'
};

// ---------------------------------------------------------------- Catálogo
export type ExternalProductOrigin = 'IMPORTACION' | 'MAQUILA';

export interface ExternalProduct {
  _id?: string;
  gtin14: string;
  gtin13?: string;
  reference: string;
  productName: string;
  summumProduct: string;
  category: string;
  client: string;
  origin: ExternalProductOrigin;
  supplier: string;
  manufacturedIn: string;
  color: string;
  voltage: string;
  specs: string;
  active: boolean;
  source?: 'MANUAL' | 'EXCEL';
  lastUpdate?: string;
  updatedBy?: ExternalActor;
}

/** Body de POST /external/products (el GTIN puede ir con 13 o 14 dígitos). */
export type ExternalProductRequest = Omit<ExternalProduct, '_id' | 'gtin14' | 'gtin13' | 'source' | 'lastUpdate' | 'updatedBy'> & {
  gtin: string;
};

export interface ExternalUnidentifiedGtin {
  gtin14: string;
  units: number;
  lastBarcode: string;
  lastEntryAt: string;
}

export interface ExternalCatalog {
  products: ExternalProduct[];
  unidentified: ExternalUnidentifiedGtin[];
}

export interface ExternalSaveProductResult {
  product: ExternalProduct;
  unitsUpdated: number;
  created: boolean;
}

export interface ExternalImportResult {
  results: { rowNumber: number; gtin: string; reference: string; ok: boolean; created: boolean; msg: string }[];
  truncated: boolean;
}

// ---------------------------------------------------------------- Devoluciones / Garantías
export type WarrantyReturnType = 'WARRANTY' | 'RETURN';
export type WarrantyReturnCondition = 'GOOD' | 'DAMAGED' | 'TO_REVIEW';
export type WarrantyReturnStatus = 'RECEIVED' | 'CLOSED';
export type WarrantyReturnResolution = 'RESTOCK' | 'REPAIRED' | 'REPLACED' | 'SCRAPPED' | 'RETURNED_TO_SUPPLIER';

export const WARRANTY_RETURN_TYPE_LABELS: Record<WarrantyReturnType, string> = {
  WARRANTY: 'Garantía',
  RETURN: 'Devolución'
};

export const WARRANTY_RETURN_CONDITION_LABELS: Record<WarrantyReturnCondition, string> = {
  GOOD: 'Buen estado',
  DAMAGED: 'Dañado',
  TO_REVIEW: 'Por revisar'
};

export const WARRANTY_RETURN_RESOLUTION_LABELS: Record<WarrantyReturnResolution, string> = {
  RESTOCK: 'Reintegrado a bodega',
  REPAIRED: 'Reparado',
  REPLACED: 'Cambiado al cliente',
  SCRAPPED: 'Dado de baja',
  RETURNED_TO_SUPPLIER: 'Devuelto a proveedor'
};

export interface WarrantyReturn {
  _id: string;
  barcode: string;
  serial: string;
  origin: 'OWN' | 'EXTERNAL' | 'UNKNOWN';
  product: string;
  reference: string;
  productName: string;
  client: string;
  previousExit: { found: boolean; kind: '' | 'DISPATCHED' | 'EXITED'; loadingOrder: string; at: string };
  type: WarrantyReturnType;
  customer: string;
  document: string;
  reason: string;
  condition: WarrantyReturnCondition;
  observation: string;
  status: WarrantyReturnStatus;
  receivedBy: ExternalActor;
  receivedAt: string;
  resolution: { type: WarrantyReturnResolution | ''; observation: string; by: ExternalActor; at: string };
}

export interface WarrantyReturnRequest {
  barcode: string;
  type: WarrantyReturnType;
  customer: string;
  document: string;
  reason: string;
  condition: WarrantyReturnCondition;
  observation?: string;
}

export interface WarrantyReturnReceiveResult {
  return: WarrantyReturn;
  warnings: string[];
}

export interface WarrantyReturnListRequest {
  status?: WarrantyReturnStatus | '';
  type?: WarrantyReturnType | '';
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface WarrantyReturnCloseRequest {
  returnId: string;
  resolution: WarrantyReturnResolution;
  observation: string;
}
