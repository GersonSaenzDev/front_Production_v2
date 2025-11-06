// src/app/interfaces/printingLabel.interfaces.ts (Versión CORREGIDA y ÚNICA)

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

export interface ProductReference {
   _id: string;
   productName: string;
   EAN: string;
   reference: string;
   codRef: string;
   label: {
      number: string;
      note: string;
   };
}

// ====================================================================
// ¡SOLO UNA DECLARACIÓN DE GENERATEDLABEL!
// ====================================================================
export interface GeneratedLabel {
   number: string;
   // Definición correcta con los 5 estados:
   status: 'pending' | 'created' | 'validated' | 'missing' | 'error'; 
}

// ====================================================================
// INTERFACES PARA LOS SUBDOCUMENTOS DE VALIDACIÓN
// ====================================================================

/** Esquema para un código de barras individual */
export interface BarcodeEntry {
      code: string;
}

/** Esquema para la información de validación de impresión (PrintedBarcode) */
export interface PrintedValidationInfo {
      printedDate: string;
      LabelCount: string; 
}

/** Esquema para la información de validación de lectura (barcodeRead) */
export interface ReadValidationInfo {
      readDate: string;
      countLabelRead: string; 
}

/** Estructura de la validación para un tipo de código (ej: PrintedBarcode128) */
export interface BarcodeValidationStructure<TValidation> {
      [key: string]: [BarcodeEntry[], TValidation]; 
}

// ====================================================================
// INTERFACES PRINCIPALES DE SOLICITUD Y RESPUESTA
// ====================================================================

/** Estructura del objeto 'label' en la solicitud */
export interface LabelPrintingLabel {
      quantityLabels: string;
      consecutiveStart: string;
      consecutiveEnd: string;
      LabelValidation: {
            PrintedBarcode13: [BarcodeEntry[], PrintedValidationInfo];
            PrintedBarcode128: [BarcodeEntry[], PrintedValidationInfo];
            barcodeReadEAN13: [BarcodeEntry[], ReadValidationInfo];
            barcodeReadEAN128: [BarcodeEntry[], ReadValidationInfo];
      };
}

/** Solicitud para el endpoint POST /printing/labelPrinting */
export interface LabelPrintingRequest {
      productName: string;
      EAN: string;
      reference: string;
      codRef: string;
      label: LabelPrintingLabel;
}

/** Respuesta esperada del backend (ok: true, msg: "...") */
export interface LabelPrintingResponse {
      ok: boolean;
      msg: string;
      data?: any; // Opcional: el objeto guardado
}
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

export interface ProductReference {
  _id: string;
  productName: string;
  EAN: string;
  reference: string;
  codRef: string;
  label: {
    number: string;
    note: string;
  };
}

// ====================================================================
// ¡SOLO UNA DECLARACIÓN DE GENERATEDLABEL!
// ====================================================================
export interface GeneratedLabel {
  number: string;
  // Definición correcta con los 5 estados:
  status: 'pending' | 'created' | 'validated' | 'missing' | 'error'; 
}

// ====================================================================
// INTERFACES PARA LOS SUBDOCUMENTOS DE VALIDACIÓN
// ====================================================================

/** Esquema para un código de barras individual */
export interface BarcodeEntry {
    code: string;
}

/** Esquema para la información de validación de impresión (PrintedBarcode) */
export interface PrintedValidationInfo {
    printedDate: string;
    LabelCount: string; 
}

/** Esquema para la información de validación de lectura (barcodeRead) */
export interface ReadValidationInfo {
    readDate: string;
    countLabelRead: string; 
}

// ====================================================================
// INTERFACES PRINCIPALES DE SOLICITUD Y RESPUESTA
// ====================================================================

/** Estructura del objeto 'label' en la solicitud */
export interface LabelPrintingLabel {
    quantityLabels: string;
    consecutiveStart: string;
    consecutiveEnd: string;
    LabelValidation: {
        PrintedBarcode13: [BarcodeEntry[], PrintedValidationInfo];
        PrintedBarcode128: [BarcodeEntry[], PrintedValidationInfo];
        barcodeReadEAN13: [BarcodeEntry[], ReadValidationInfo];
        barcodeReadEAN128: [BarcodeEntry[], ReadValidationInfo];
    };
}

/** Solicitud para el endpoint POST /printing/labelPrinting */
export interface LabelPrintingRequest {
    productName: string;
    EAN: string;
    reference: string;
    codRef: string;
    label: LabelPrintingLabel;
}

/** Respuesta esperada del backend (ok: true, msg: "...") */
export interface LabelPrintingResponse {
    ok: boolean;
    msg: string;
    data?: any; // Opcional: el objeto guardado
}