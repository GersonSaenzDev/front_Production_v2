// src/app/interfaces/price-list.interface.ts

/**
 * @description Respuesta del backend al cargar el archivo de lista de precios (POST /master/priceList).
 */
export interface PriceListUploadResponse {
  ok: boolean;
  msg: string;
  upsertedCount: number;
  modifiedCount: number;
  totalRecords: number;
}

/**
 * @description Registro de la lista de precios (colección `priceLists`).
 */
export interface PriceListItem {
  _id: string;
  ean: string;
  internalCode: string;
  model: string;
  description: string;
  productRange: string;
  productLine: string;
  lowestChannelCost: number;
  status: boolean;
  lastUploadFile: string;
  userCreate: string;
  dateCreate: string;
  auditTrail: unknown[];
}

/**
 * @description Filtros opcionales combinables por AND para la búsqueda de precios (POST /master/priceList/list).
 */
export interface PriceListListPayload {
  ean?: string;
  internalCode?: string;
  model?: string;
  productRange?: string;
  productLine?: string;
  search?: string;
}

/**
 * @description Respuesta del backend con el listado de precios (POST /master/priceList/list).
 */
export interface PriceListListResponse {
  ok: boolean;
  msg: PriceListItem[];
}

/**
 * @description Payload para el detalle de una referencia puntual (POST /master/priceList/detail):
 * por `ean`, `internalCode` o `model`.
 */
export interface PriceListDetailPayload {
  ean?: string;
  internalCode?: string;
  model?: string;
}

/**
 * @description Respuesta del backend con el detalle de precio de una referencia (incluye auditTrail).
 */
export interface PriceListDetailResponse {
  ok: boolean;
  msg: PriceListItem;
}
