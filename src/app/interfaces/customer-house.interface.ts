// src/app/interfaces/customer-house.interface.ts

/**
 * @description Estados posibles de un despacho de flete.
 */
export type FreightDispatchStatus = 'Pendiente' | 'Finalizado' | 'Parcial' | 'Siniestro Parcial' | 'Siniestro Completo';

/**
 * @description Línea de producto dentro de un despacho de flete multicliente.
 * El flete de cada línea (freightCost) lo asigna manualmente el usuario (no
 * hay prorrateo automático por volumen) y no es obligatorio: puede quedar
 * pendiente de diligenciar tras cargar una factura.
 */
export interface FreightDispatchItemInput {
  client: string;
  destinationCity: string;
  ean: string;
  product: string;
  quantity: number;
  unitValue: number;
  totalValue: number; // Costo total del producto (cantidad × valor unitario), sin IVA
  freightCost: number | null;
  invoiceNumber?: string;
}

/**
 * @description Referencia a la factura PDF original archivada en el disco de
 * red compartido, con huella de integridad SHA-256.
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
  totalValue: number; // "TOTAL IMPORTE" extraído del PDF (valor de los productos, sin IVA)
  uploadedAt: string;
  uploadedBy: string;
}

/**
 * @description Entrada de historial: costo adicional vigente en un momento
 * dado. El valor "actual" del despacho es siempre la última entrada.
 */
export interface FreightCostEntry {
  value: number;
  observation: string;
  modifiedBy: string;
  modifiedAt: string;
}

/**
 * @description Costo adicional a agregar desde el formulario (creación o
 * actualización). La descripción es obligatoria: identifica a qué corresponde
 * el valor (ej. "Recargo por zona", "Reproceso de entrega").
 */
export interface FreightCostEntryInput {
  value: number;
  observation: string;
}

/**
 * @description Entrada de historial: detalle de creación y, luego, novedades
 * de entrega, agregadas desde la actualización del despacho.
 */
export interface FreightDetailEntry {
  description: string;
  modifiedBy: string;
  modifiedAt: string;
}

/**
 * @description Payload para registrar un despacho de flete (POST /customerHouse/freightDispatch).
 * El N° de despacho lo genera el servidor (consecutivo AAAAMM####), no se envía desde el formulario.
 */
export interface FreightDispatchRequest {
  dispatchDate: string; // Formato: "DD/MM/YYYY"
  warehouseExitDate: string; // Texto libre (ya no es una fecha)
  carrier: string;
  totalFreightCost: number;
  additionalCosts: FreightCostEntryInput[]; // Costos adicionales iniciales del historial additionalCosts[], cada uno con su descripción
  creationDetail: string; // Primera entrada del historial details[]
  items: FreightDispatchItemInput[];
}

/**
 * @description Payload para actualizar un despacho existente (PATCH /customerHouse/freightDispatch/:id).
 */
export interface FreightDispatchUpdateRequest {
  additionalCosts?: FreightCostEntryInput[]; // Nuevos costos adicionales a agregar al historial, cada uno con su descripción
  detail: string;
  status?: FreightDispatchStatus;
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
  warehouseExitDate: string;
  carrier: string;
  totalFreightCost: number;
  additionalCosts: FreightCostEntry[];
  items: FreightDispatchItem[];
  invoiceDocuments: FreightInvoiceDocument[];
  details: FreightDetailEntry[];
  status: FreightDispatchStatus;
  auditTrail: FreightDispatchAuditEntry[];
  userCreate: string;
  dateCreate: string; // "DD/MM/YYYY, HH:MM:SS"
  userUpdate?: string;
  dateUpdate?: string;
  __v?: number;
}

/**
 * @description Respuesta del backend al registrar/actualizar un despacho de flete.
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
