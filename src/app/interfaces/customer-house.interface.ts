// src/app/interfaces/customer-house.interface.ts

/**
 * @description Línea de producto dentro de un despacho de flete multicliente.
 * El flete de cada línea (freightCost) lo asigna manualmente el usuario (no
 * hay prorrateo automático por volumen).
 */
export interface FreightDispatchItemInput {
  client: string;
  destinationCity: string;
  ean: string;
  product: string;
  quantity: number;
  unitValue: number;
  freightCost: number;
  invoiceNumber?: string;
}

/**
 * @description Referencia a la factura PDF original archivada en InduTalent
 * (DOCUMENTS_NETWORK_PATH/invoicesAndOrders), con huella de integridad SHA-256.
 */
export interface FreightInvoiceDocument {
  storedFilename: string;
  relativePath: string;
  fullPath: string;
  originalName: string;
  extension: string;
  mimeType: string;
  originalSize: number;
  storedSize: number;
  fileHash: string;
  hashAlgorithm: string;
  invoiceNumber: string;
  uploadedAt: string;
  uploadedBy: string;
}

/**
 * @description Payload para registrar un despacho de flete (POST /customerHouse/freightDispatch).
 * El N° de despacho lo genera el servidor (consecutivo AAAAMM####), no se envía desde el formulario.
 */
export interface FreightDispatchRequest {
  dispatchDate: string; // Formato: "DD/MM/YYYY"
  warehouseExitDate: string; // Formato: "DD/MM/YYYY"
  carrier: string;
  totalFreightCost: number;
  additionalCosts: number;
  items: FreightDispatchItemInput[];
}

/**
 * @description Línea de producto ya procesada por el backend.
 */
export interface FreightDispatchItem extends FreightDispatchItemInput {
  freightCostPerUnit: number;
  _id: string;
}

/**
 * @description Entrada del historial de auditoría de un despacho de flete.
 */
export interface FreightDispatchAuditEntry {
  action: string;
  modifiedBy: string;
  modifiedAt: string; // "DD/MM/YYYY, HH:MM:SS"
  observation: string;
}

/**
 * @description Despacho de flete multicliente, con sus líneas y su trazabilidad.
 */
export interface FreightDispatch {
  _id: string;
  dispatchNumber: string;
  dispatchDate: string; // "DD/MM/YYYY"
  warehouseExitDate: string; // "DD/MM/YYYY"
  carrier: string;
  totalFreightCost: number;
  additionalCosts: number;
  items: FreightDispatchItem[];
  invoiceDocuments: FreightInvoiceDocument[];
  status: boolean;
  auditTrail: FreightDispatchAuditEntry[];
  userCreate: string;
  dateCreate: string; // "DD/MM/YYYY, HH:MM:SS"
  __v?: number;
}

/**
 * @description Respuesta del backend al registrar un despacho de flete.
 */
export interface FreightDispatchResponse {
  ok: boolean;
  msg: string;
  data: FreightDispatch;
}

/**
 * @description Respuesta del backend con el próximo N° de despacho previsualizado.
 */
export interface FreightNextDispatchNumberResponse {
  ok: boolean;
  msg: string;
  data: { dispatchNumber: string };
}

/**
 * @description Filtro por rango de fechas usado tanto en el listado como en el detalle de despachos.
 */
export interface FreightDispatchDateRangeFilter {
  dateIni: string; // Formato: "DD/MM/YYYY"
  dateEnd: string; // Formato: "DD/MM/YYYY"
}

/**
 * @description Respuesta del backend con el listado de despachos de flete en un rango de fechas.
 */
export interface FreightDispatchListResponse {
  ok: boolean;
  msg: string;
  total: number;
  data: FreightDispatch[];
}

/**
 * @description Respuesta del backend con el detalle de despachos de flete en un rango de fechas.
 */
export interface FreightDispatchDetailResponse {
  ok: boolean;
  msg: FreightDispatch;
}
