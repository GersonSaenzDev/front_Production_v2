// src/app/interfaces/currentConsecutive.interface.ts

/**
 * @interface LabelData
 * @description Define la estructura del objeto 'label' dentro de cada elemento de la respuesta.
 */
export interface LabelData {
    number: string;
    note: string;
}

/**
 * @interface ConsecutiveItem
 * @description Define la estructura de cada objeto dentro del array 'msg'.
 */
export interface ConsecutiveItem {
    _id: string;
    productName: string;
    EAN: string;
    reference: string;
    codRef: string;
    label: LabelData;
}

/**
 * @interface CurrentConsecutiveResponse
 * @description Define la estructura de la respuesta completa del endpoint /printing/currentConsecutive.
 */
export interface CurrentConsecutiveResponse {
    ok: boolean;
    msg: ConsecutiveItem[]; // Es un array de objetos ConsecutiveItem
}