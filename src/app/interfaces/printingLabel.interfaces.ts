// src/app/interfaces/printingLabel.interfaces.ts (Versión CORREGIDA y ÚNICA)

import { AbstractControl, FormGroup } from "@angular/forms";
import { Subject } from "rxjs";

// --- Solicitud (Body) enviada al servidor (POST) ---
export interface LabelDetailsRequest {
      code: number;
      note: string;
}

export interface LabelRequiresRequest {
      regleta: boolean;
      printQuantity: number;
}

export interface CountryRequest {
      national: boolean;
      country?: string;
}

export interface AdditionalDataEntry {
      process: string;
      note: string;
      stripQuantity: number;
      maxQuantity: number;
}

export interface LabelParametersRequest {
      productName: string;
      EAN: string;
      reference: string;
      codRef: string;
      destination: CountryRequest;
      label: LabelDetailsRequest;
      requires: LabelRequiresRequest;
      maximumPrintQuantity: number;
      additionalData?: AdditionalDataEntry[];
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

// ====================================================================
// 🆕 INTERFACES PARA DATOS ADICIONALES Y CONSULTA PREDICTIVA
// ====================================================================

/** Esquema de la data individual de un proceso devuelto por el DAO (para autocompletado). */
export interface ProcessData {
    process: string; // En este contexto, este sería el valor sugerido para la Clave ('key')
    note: string;
    stripQuantity: number;
    maxQuantity: number;
}

/** Solicitud para el endpoint POST /printing/viewAdd */
export interface ViewAddRequest {
    process: string; // El término de búsqueda que viene del input del usuario
}

/** Respuesta esperada del backend para la consulta predictiva de procesos. */
export interface ViewAddResponse {
    ok: boolean;
    msg: ProcessData[]; // El arreglo de resultados
}


/** Esquema de cada par Clave/Valor que se añade dinámicamente */
export interface AdditionalDataEntry {
    key: string;   // El nombre del campo adicional (Ej: 'Lote')
    value: string; // El valor ingresado por el usuario (Ej: 'L456')
}


// --- Solicitud (Body) enviada al servidor (POST) ---
// 💡 AJUSTE: Extendemos LabelParametersRequest para incluir additionalData
export interface LabelParametersRequest {
    productName: string;
    EAN: string;
    reference: string;
    codRef: string;
    label: LabelDetailsRequest;
    additionalData?: AdditionalDataEntry[]; // 🆕 Nuevo campo OPCIONAL
}

export interface AdditionalDataGroup extends FormGroup {
  // Propiedades personalizadas que añadimos en el componente
  searchSubject: Subject<string>;
  predictiveList: ProcessData[];
  loading: boolean;
  showDropdown: boolean;
  
  // 💡 CORRECCIÓN AQUÍ:
  // Los controles deben coincidir con los creados en createAdditionalDataGroup()
  controls: {
      process: AbstractControl;  // <-- Antes decía 'key'
      quantity: AbstractControl; // <-- Nuevo
      note: AbstractControl;     // <-- Antes decía 'value' o no existía
  };
}