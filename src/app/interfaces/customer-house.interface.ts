// src/app/interfaces/customer-house.interface.ts

/**
 * @description Línea de producto dentro de un despacho de flete multicliente.
 */
export interface FreightDispatchItemInput {
  client: string;
  destinationCity: string;
  product: string;
  quantity: number;
  unitValue: number;
  unitVolume: number;
}

/**
 * @description Payload para registrar un despacho de flete (POST /customerHouse/freightDispatch).
 */
export interface FreightDispatchRequest {
  dispatchNumber: string;
  dispatchDate: string; // Formato: "DD/MM/YYYY"
  carrier: string;
  totalFreightCost: number;
  items: FreightDispatchItemInput[];
}

/**
 * @description Línea de producto ya procesada por el backend, con el prorrateo de flete calculado.
 */
export interface FreightDispatchItem extends FreightDispatchItemInput {
  itemVolume: number;
  volumePercentage: number;
  allocatedFreightCost: number;
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
 * @description Despacho de flete multicliente, con el prorrateo por línea y su trazabilidad.
 */
export interface FreightDispatch {
  _id: string;
  dispatchNumber: string;
  dispatchDate: string; // "DD/MM/YYYY"
  carrier: string;
  totalFreightCost: number;
  totalVolume: number;
  items: FreightDispatchItem[];
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
