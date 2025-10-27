// src/app/interfaces/production-news.interface.ts

/**
 * @description Estructura de datos para crear una novedad de producción.
 */
export interface ProductionNewsRequest {
    newsDate: string;           // Formato: "DD/MM/YYYY"
    category: string;           // Ej: "Parada de Linea", "Reporte de Calidad"
    assemblyLine: string;       // Ej: "Linea 1", "Linea 9"
    reference?: string;         // Opcional: Referencia del producto
    stopType?: string;          // Opcional (obligatorio si category es "Parada de Línea")
    startTime?: string;         // Opcional: Formato "HH:MM"
    endTime?: string;           // Opcional: Formato "HH:MM"
    totalTime?: string;         // Opcional: Formato "HH:MM" o "HHh MMm"
    detail: string;             // Detalle de la novedad
}

/**
 * @description Respuesta del backend al crear una novedad.
 */
export interface ProductionNewsResponse {
    ok: boolean;
    msg: string;
    data?: ProductionNewsData;
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