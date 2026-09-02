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
  volumeM3?: number; // Volumen de la línea, en m³ (para el cubicaje del viaje)
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
  carrier: string; // Nombre de la transportadora (se conserva por compatibilidad)
  carrierId?: string; // _id de la transportadora elegida del catálogo
  vehicleType?: string; // Tipo de vehículo del viaje (según catálogo de la transportadora)
  mainDestination?: string; // Ciudad/ruta usada para resolver la tarifa del catálogo
  ratedFreightValue?: number; // Valor del flete que traía la tabla de tarifas (trazabilidad)
  vehicleCapacityM3?: number; // Capacidad de carga del vehículo (m³) para el % de aprovechamiento
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
  carrierId?: string;
  vehicleType?: string;
  mainDestination?: string;
  ratedFreightValue?: number;
  vehicleCapacityM3?: number;
  loadedVolumeM3?: number; // Suma de items.volumeM3 (calculado por el servidor)
  volumeUtilizationPct?: number; // loadedVolumeM3 / vehicleCapacityM3 * 100
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

// ============================================================================
// TRANSPORTADORAS (carriers): catálogo de empresas de transporte que prestan
// servicio a Indusel y su tabla de tarifas de flete por destino + tipo de
// vehículo. Ruta base: /customerHouse/carrier. CRUD con borrado lógico
// (status: false) y auditoría por movimiento (auditTrail).
// ============================================================================

/**
 * @description Tipos de vehículo admitidos en las tarifas (enum fijo del backend).
 * Se puede obtener en runtime con getCarrierVehicleTypes().
 */
export type FreightVehicleType = 'PATINETA' | 'SENCILLO' | 'TURBO' | 'TURBO PEQUEÑA' | 'TURBO SENCILLO' | 'SENCILLO SICE TAC';

/**
 * @description Línea de tarifa como se envía al backend. La llave natural es
 * (destination + vehicleType); ambos se normalizan a MAYÚSCULAS en el servidor.
 */
export interface FreightRateInput {
  destination: string;
  vehicleType: FreightVehicleType;
  value: number; // Valor del flete (COP por defecto), >= 0
  observation?: string;
}

/**
 * @description Línea de tarifa ya persistida. El subdocumento no lleva _id, por
 * lo que el shape coincide con el de entrada.
 */
export type FreightRate = FreightRateInput;

/**
 * @description Capacidad de carga (m³) de la transportadora para un tipo de
 * vehículo. La llave natural es `vehicleType` (uno por tipo). Se usa en el
 * registro de despachos para el % de aprovechamiento del viaje.
 */
export interface FreightVehicleCapacityInput {
  vehicleType: FreightVehicleType;
  capacityM3: number; // Volumen útil del vehículo, en metros cúbicos, >= 0
}

/**
 * @description Capacidad ya persistida. El subdocumento no lleva _id, por lo que
 * el shape coincide con el de entrada.
 */
export type FreightVehicleCapacity = FreightVehicleCapacityInput;

/**
 * @description Costo adicional al flete que cobra la transportadora (seguro,
 * cargue/descargue, stand by, entrega en ciudad adicional, etc.). La llave
 * natural es `description` (sin distinguir mayúsculas).
 */
export interface FreightAdditionalCostInput {
  description: string; // Concepto del cargo
  value: number; // Valor monetario del cargo, >= 0
  observation?: string; // Nota / condición
}

/**
 * @description Costo adicional ya persistido: el backend sella quién y cuándo lo
 * registró/editó.
 */
export interface FreightAdditionalCost extends FreightAdditionalCostInput {
  modifiedBy?: string;
  modifiedAt?: string; // "DD/MM/YYYY, HH:MM:SS"
}

/**
 * @description Entrada del historial de auditoría de una transportadora. action:
 * CREATED | UPDATED | RATE_ADDED | RATE_UPDATED | RATE_REMOVED |
 * ADDITIONAL_COST_ADDED | ADDITIONAL_COST_UPDATED | ADDITIONAL_COST_REMOVED |
 * DEACTIVATED | REACTIVATED
 */
export interface FreightCarrierAuditEntry {
  action: string;
  modifiedBy: string;
  modifiedAt: string; // "DD/MM/YYYY, HH:MM:SS"
  observation: string;
  previousState?: unknown; // estado anterior de lo que cambió
}

/**
 * @description Campos de cabecera editables de una transportadora (crear / actualizar).
 */
export interface FreightCarrierInput {
  name: string;
  nit?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  insurancePct?: number; // % sobre el valor declarado de la mercancía (ej. 0.7)
  extraCityValue?: number; // Valor por ciudad adicional en la ruta (ej. 100000)
  offerDate?: string; // Fecha de la carta/oferta de tarifas ("DD/MM/YYYY")
  currency?: string; // Default 'COP'
  notes?: string; // Condiciones (no incluye stand by, descargues, devoluciones, etc.)
}

/**
 * @description Payload para registrar una transportadora (POST /customerHouse/carrier).
 * Puede traer una tabla de tarifas y un catálogo de costos adicionales iniciales.
 */
export interface FreightCarrierCreateRequest extends FreightCarrierInput {
  additionalCosts?: FreightAdditionalCostInput[];
  rates?: FreightRateInput[];
  vehicleCapacities?: FreightVehicleCapacityInput[];
}

/**
 * @description Payload para actualizar una transportadora (PUT /customerHouse/carrier/:id).
 * Cabecera parcial y, opcionalmente, REEMPLAZO total de la tabla de tarifas y/o
 * del catálogo de costos adicionales. `observation` es obligatoria: queda en el
 * auditTrail con el estado anterior.
 */
export interface FreightCarrierUpdateRequest extends Partial<FreightCarrierInput> {
  rates?: FreightRateInput[];
  additionalCosts?: FreightAdditionalCostInput[];
  vehicleCapacities?: FreightVehicleCapacityInput[];
  observation: string;
}

/**
 * @description Alta o edición de UNA línea de tarifa (upsert por destination + vehicleType).
 * POST /customerHouse/carrier/:id/rate
 */
export interface FreightRateUpsertRequest {
  destination: string;
  vehicleType: FreightVehicleType;
  value: number;
  observation?: string;
}

/**
 * @description Eliminación de UNA línea de tarifa. DELETE /customerHouse/carrier/:id/rate (con body).
 */
export interface FreightRateDeleteRequest {
  destination: string;
  vehicleType: FreightVehicleType;
  observation?: string;
}

/**
 * @description Alta o edición de UN costo adicional (upsert por descripción).
 * POST /customerHouse/carrier/:id/additionalCost
 */
export interface FreightAdditionalCostUpsertRequest {
  description: string;
  value: number;
  observation?: string;
}

/**
 * @description Eliminación de UN costo adicional por su descripción.
 * DELETE /customerHouse/carrier/:id/additionalCost (con body).
 */
export interface FreightAdditionalCostDeleteRequest {
  description: string;
  observation?: string;
}

/**
 * @description Cambio de estado explícito (reactivar / desactivar).
 * PATCH /customerHouse/carrier/:id/status
 */
export interface FreightCarrierStatusRequest {
  status: boolean; // true = activo | false = inactivo
  observation: string;
}

/**
 * @description Borrado lógico de una transportadora (status -> false).
 * DELETE /customerHouse/carrier/:id (con body).
 */
export interface FreightCarrierDeleteRequest {
  observation: string;
}

/**
 * @description Filtros del listado de transportadoras (todos opcionales, combinados por AND).
 * Sin `status` se devuelven activas e inactivas.
 */
export interface FreightCarrierListFilters {
  name?: string; // Coincidencia parcial
  status?: boolean;
  destination?: string; // Con al menos una tarifa hacia ese destino
  vehicleType?: FreightVehicleType; // Con al menos una tarifa de ese tipo de vehículo
}

/**
 * @description Identificador para consultar el detalle de una transportadora.
 * Debe traer `id` (Mongo _id) o `name` (match exacto insensible a mayúsculas).
 */
export interface FreightCarrierDetailQuery {
  id?: string;
  name?: string;
}

/**
 * @description Transportadora ya procesada por el backend, con sus tarifas y trazabilidad.
 */
export interface FreightCarrier {
  _id: string;
  name: string;
  nit?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  insurancePct: number;
  extraCityValue: number;
  offerDate?: string;
  currency: string;
  notes?: string;
  additionalCosts: FreightAdditionalCost[];
  rates: FreightRate[];
  vehicleCapacities: FreightVehicleCapacity[];
  status: boolean;
  auditTrail: FreightCarrierAuditEntry[];
  userCreate: string;
  dateCreate: string; // "DD/MM/YYYY, HH:MM:SS"
  userUpdate?: string;
  dateUpdate?: string;
  __v?: number;
}

/**
 * @description Respuesta del backend al crear/actualizar una transportadora, gestionar
 * una tarifa o cambiar su estado (incluido el borrado lógico).
 */
export interface FreightCarrierResponse {
  ok: boolean;
  msg: string;
  data: FreightCarrier;
}

/**
 * @description Respuesta del backend con el listado de transportadoras.
 */
export interface FreightCarrierListResponse {
  ok: boolean;
  msg: string;
  total: number;
  data: FreightCarrier[];
}

/**
 * @description Respuesta del backend con el detalle de una transportadora (viene en `msg`).
 */
export interface FreightCarrierDetailResponse {
  ok: boolean;
  msg: FreightCarrier;
}

/**
 * @description Respuesta del backend con el catálogo de tipos de vehículo.
 */
export interface FreightVehicleTypesResponse {
  ok: boolean;
  msg: string;
  data: FreightVehicleType[];
}
