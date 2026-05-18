// src/app/interfaces/production-news.interface.ts

/**
 * @description Identidad del actor (quien reporta / responde / cierra una novedad).
 *              El backend exige uid o userApp para registrar la novedad.
 */
export interface NewsActor {
    uid?: string;
    userApp?: string;
    name?: string;
    area?: string;
    subArea?: string;
}

/**
 * @description Máquina/equipo reportado por el área origen.
 */
export interface NewsOriginMachine {
    code: string;
    name: string;
}

/**
 * @description Parte/pieza reportada por el área origen.
 *              `name` queda vacío hasta que se conecte el servicio de búsqueda.
 */
export interface NewsOriginPart {
    code: string;
    name: string;
}

/**
 * @description Bloque ORIGEN: identifica al área que reporta la novedad.
 */
export interface NewsOrigin {
    area: string;
    subArea?: string;
    location?: string;        // Línea/máquina/celda (solo aplica para área Ensamble)
    machine?: NewsOriginMachine;
    part?: NewsOriginPart;
}

/**
 * @description Bloque ASIGNACIÓN: identifica al área a la que se le carga la novedad.
 */
export interface NewsAssignment {
    currentArea: string;
    currentSubArea?: string;
}

/**
 * @description Bloque PARADA: aplica solo cuando category === 'Parada de Línea'.
 */
export interface NewsStop {
    stopType: string;
    startTime: string;        // HH:MM
    endTime: string;          // HH:MM
    totalTime: string;        // HH:MM
}

/**
 * @description Estructura de datos para crear una novedad de producción.
 *              Soporta el formato nuevo (origin/assignment/stop) y mantiene
 *              campos legacy opcionales por compatibilidad con el backend.
 */
export interface ProductionNewsRequest {
    newsDate: string;                 // Formato: "DD/MM/YYYY"
    category: string;                 // Ej: "Parada de Línea", "Reporte de Calidad"
    reference: string;                // Referencia del producto (obligatoria)
    detail: string;                   // Detalle de la novedad (mínimo 50 caracteres)

    reportedBy: NewsActor;            // Identidad del usuario que reporta
    origin: NewsOrigin;               // Área que reporta
    assignment: NewsAssignment;       // Área a la que se le carga la novedad
    stop?: NewsStop;                  // Solo si category === 'Parada de Línea'

    // -----------------------------------------------------------------
    // CAMPOS LEGACY (opcionales — se mantienen mientras el backend los acepte)
    // -----------------------------------------------------------------
    assemblyLine?: string;
    responsible?: string;
    stopType?: string;
    startTime?: string;
    endTime?: string;
    totalTime?: string;
}

/**
 * @description Respuesta del backend al crear una novedad.
 */
export interface ProductionNewsResponse {
    ok: boolean;
    msg: string;
    data?: ProductionNewsData;
    tokenError?: string;
}

/**
 * @description Datos de la novedad creada (opcional en la respuesta).
 */
export interface ProductionNewsData {
    _id: string;
    newsDate: string;
    category: string;
    assemblyLine: string;
    reference?: string;
    responsible?: string; // 💡 AJUSTE: Añadido aquí también
    stopType?: string;
    startTime?: string;
    endTime?: string;
    totalTime?: string;
    detail: string;
    dateCreate: Date;
}

/**
 * @description Estructura de datos para crear una novedad de bodega/almacén.
 */
export interface WarehouseNewsRequest {
    newsDate: string;           // Formato: "DD/MM/YYYY"
    category: string;           // Ej: "Falta de Material", "Daño en Producto"
    reference: string;          // Referencia del producto
    reportedAmount: string;     // Cantidad reportada (se envía como string)
    description: string;        // Descripción detallada de la novedad
}

/**
 * @description Respuesta del backend al crear una novedad de bodega.
 */
export interface WarehouseNewsResponse {
    ok: boolean;
    msg: string;
    data?: WarehouseNewsData;
}

/**
 * @description Datos de la novedad de bodega creada (opcional en la respuesta).
 */
export interface WarehouseNewsData {
    _id: string;
    newsDate: string;
    category: string;
    reference: string;
    reportedAmount: number;
    description: string;
    dateCreate: string;
}

/**
 * @description Sub-área de producción agrupada por área.
 */
export interface ProductionSubArea {
    cod: number;
    subArea: string;
    reportingManager: string;
}

/**
 * @description Área de producción con sus sub-áreas agrupadas.
 */
export interface ProductionAreaGrouped {
    area: string;
    count: number;
    subAreas: ProductionSubArea[];
}

/**
 * @description Respuesta del backend para áreas de producción agrupadas.
 */
export interface ProductionAreasGroupedResponse {
    ok: boolean;
    msg: ProductionAreaGrouped[];
}

/**
 * @description Área de producción (formato plano).
 */
export interface ProductionArea {
    _id: string;
    active: boolean;
    area: string;
    subArea: string;
    reportingManager: string;
}

/**
 * @description Respuesta del backend para áreas de producción (formato plano).
 */
export interface ProductionAreasResponse {
    ok: boolean;
    msg: ProductionArea[];
}

/**
 * @description Estructura de datos para consultar máquinas por área.
 */
export interface MachinesByAreaRequest {
    area: string;
}

/**
 * @description Máquina asociada a un área de producción.
 */
export interface Machine {
    machineCode: string;
    centerCode: string;
    locationCode: string;
    brand: string;
    capacity: string;
    centerName: string;
    locationName: string;
    machineName: string;
    model: string;
    type: string;
}

/**
 * @description Respuesta del backend para máquinas por área.
 */
export interface MachinesByAreaResponse {
    ok: boolean;
    msg: Machine[];
}