// src/app/interfaces/printingLabel.interfaces.ts

// --- Solicitud (Body) enviada al servidor (POST) ---
export interface LabelDetailsRequest {
    code: number;
    note: string;
}

export interface LabelParametersRequest {
    productName: string;
    EAN: string;
    reference: string;
    codRef: string;
    label: LabelDetailsRequest;
}

// --- Respuesta recibida del servidor ---
export interface LabelDetailsResponse {
    number: number; // En la respuesta, 'code' se llama 'number'
    note: string;
}

export interface LabelData {
    productName: string;
    EAN: string;
    reference: string;
    codRef: number; // En la respuesta, 'codRef' parece ser un número.
    label: LabelDetailsResponse;
    dateCreate: string;
    id: string;
}

export interface LabelParametersResponse {
    ok: boolean;
    msg: string; // Mensaje de éxito/error, por ejemplo: "Etiqueta registrada exitosamente"
    data?: LabelData; // El objeto de datos completo, es opcional en caso de un error general (ok: false).
}