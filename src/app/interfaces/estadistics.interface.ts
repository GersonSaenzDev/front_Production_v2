// src/app/interfaces/estadistics.interface.ts

/**
 * @description Estructura de datos para consultar las estadísticas de novedades por fecha.
 */
export interface EstadisticNewsRequest {
    date: string;                     // Formato: "DD/MM/YYYY"
}

/**
 * @description Identidad del actor que interviene en la novedad
 *              (quien reporta / asigna / responde / modifica).
 */
export interface EstadisticNewsActor {
    uid: string;
    userApp: string;
    name: string;
    area: string;
    subArea: string;
}

/**
 * @description Bloque ORIGEN: área que reportó la novedad.
 */
export interface EstadisticNewsOrigin {
    area: string;
    subArea: string;
    location: string;
    machineCode: string;
    machineName: string;
    partCode: string;
    partName: string;
    reportedBy: EstadisticNewsActor;
    reportedAt: string;               // "DD/MM/YYYY, HH:MM:SS"
}

/**
 * @description Bloque ASIGNACIÓN: área a la que se le cargó la novedad.
 */
export interface EstadisticNewsAssignment {
    currentArea: string;
    currentSubArea: string;
    assignedAt: string;               // "DD/MM/YYYY, HH:MM:SS"
    assignedBy: EstadisticNewsActor;
}

/**
 * @description Bloque PARADA: aplica cuando la novedad es una parada de línea.
 *              Los tiempos solo vienen cuando corresponde.
 */
export interface EstadisticNewsStop {
    stopType?: string;
    startTime?: string;               // HH:MM
    endTime?: string;                 // HH:MM
    totalTime?: string;               // HH:MM
    isOngoing: boolean;
}

/**
 * @description Respuesta o cierre registrado sobre una novedad.
 */
export interface EstadisticNewsResponseItem {
    responseType: string;
    area: string;
    subArea: string;
    respondedBy: EstadisticNewsActor;
    respondedAt: string;              // "DD/MM/YYYY, HH:MM:SS"
    responseText: string;
    observation: string;
    actionTaken: string;
    rootCause: string;
    attachments: string[];
    _id: string;
}

/**
 * @description Estado previo de la novedad guardado en una entrada de auditoría.
 */
export interface EstadisticNewsPreviousState {
    status: string;
    hasResponse: boolean;
    needsRedirect: boolean;
    isClosed: boolean;
    assignment: EstadisticNewsAssignment;
    stop: EstadisticNewsStop;
}

/**
 * @description Entrada del historial de auditoría de la novedad.
 */
export interface EstadisticNewsAuditTrail {
    action: string;                   // Ej: "CREATE", "CLOSE"
    modifiedBy: EstadisticNewsActor;
    modifiedAt: string;               // "DD/MM/YYYY, HH:MM:SS"
    observation: string;
    previousState: EstadisticNewsPreviousState | null;
}

/**
 * @description Novedad de producción con su estado, trazabilidad y respuestas.
 */
export interface EstadisticNews {
    _id: string;
    newsDate: string;                 // "DD/MM/YYYY"
    category: string;                 // Ej: "Parada de Línea", "Reporte de Material"
    reference: string;
    detail: string;
    origin: EstadisticNewsOrigin;
    assignment: EstadisticNewsAssignment;
    stop: EstadisticNewsStop;
    status: string;                   // Ej: "pending", "closed"
    hasResponse: boolean;
    needsRedirect: boolean;
    isClosed: boolean;
    responses: EstadisticNewsResponseItem[];
    auditTrail: EstadisticNewsAuditTrail[];
    dateCreate: string;               // "DD/MM/YYYY, HH:MM:SS"

    // -----------------------------------------------------------------
    // CAMPOS LEGACY (vienen vacíos — se mantienen mientras el backend los envíe)
    // -----------------------------------------------------------------
    assemblyLine: string;
    responsible: string;
    responsibleNote: string;
    stopType: string;
    startTime: string;
    endTime: string;
    totalTime: string;
    __v: number;
}

/**
 * @description Respuesta del backend con el listado de novedades para estadísticas.
 */
export interface EstadisticNewsResponse {
    ok: boolean;
    msg: EstadisticNews[];
}
