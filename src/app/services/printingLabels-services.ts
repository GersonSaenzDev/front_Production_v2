// src/app/services/printingLabels-services.ts

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { environment } from 'src/environments/environment';
import { LabelParametersRequest, LabelParametersResponse, LabelPrintingRequest, LabelPrintingResponse, ViewAddRequest, ViewAddResponse } from '../interfaces/printingLabel.interfaces';
import { CurrentConsecutiveResponse } from './currentConsecutive.interface';

@Injectable({
    providedIn: 'root'
})
// 💡 AJUSTE: Renombrado a PrintingLabelsService para mayor claridad
export class PrintingLabelsService { 

    private http = inject(HttpClient);
    private readonly BASE_URL = environment.backendUrl;
    private readonly BASE_API = environment.api;
    // Endpoint para el registro de parámetros de etiquetas
    private readonly LABEL_PARAMETERS_ENDPOINT = `${this.BASE_URL}${this.BASE_API}/printing/labelParameters`; 
    private readonly CURRENT_CONSECUTIVE_ENDPOINT = `${this.BASE_URL}${this.BASE_API}/printing/currentConsecutive`; 
    private readonly LABEL_PRINTING_ENDPOINT = `${this.BASE_URL}${this.BASE_API}/printing/labelPrinting`; 
    private readonly VIEW_ADD_ENDPOINT = `${this.BASE_URL}${this.BASE_API}/printing/viewAdd`; 

    private handleError(error: any) {
        let errorMessage = 'Ocurrió un error desconocido en el servicio.';
        if (error.error && error.error.msg) {
            errorMessage = error.error.msg;
        } else if (error.message) {
            errorMessage = error.message;
        }
        return throwError(() => new Error(`Falló la consulta al backend: ${errorMessage}`));
    }


    /**
     * @description Envía los parámetros de la etiqueta para su registro.
     * @param {LabelParametersRequest} body - Objeto con los datos de la referencia y la etiqueta.
     * @returns {Observable<LabelParametersResponse>}
     */
    postLabelParameters(body: LabelParametersRequest): Observable<LabelParametersResponse> {
        
        return this.http.post<LabelParametersResponse>(this.LABEL_PARAMETERS_ENDPOINT, body)
            .pipe(
                // Manejo de errores común
                catchError(this.handleError.bind(this)),
            );
    }

    /**
     * @description Envía la referencia para obtener el consecutivo actual de impresión.
     * @param {LabelParametersRequest} body - Objeto que contiene únicamente la propiedad 'reference'.
     * @returns {Observable<CurrentConsecutiveResponse>}
     */
    // 💡 AJUSTE CRÍTICO: El tipo de retorno ahora es CurrentConsecutiveResponse
    postCurrentConsecutive(body: LabelParametersRequest): Observable<CurrentConsecutiveResponse> {
        
        // El cuerpo de la solicitud sigue siendo LabelParametersRequest (ej: { "reference": "01117" })
        // pero la respuesta es la nueva interfaz definida.
        return this.http.post<CurrentConsecutiveResponse>(this.CURRENT_CONSECUTIVE_ENDPOINT, body)
            .pipe(
                // Manejo de errores común
                catchError(this.handleError.bind(this)),
            );
    }

    /**
     * @description Envía toda la estructura de datos para registrar la impresión de etiquetas y generar barcodes.
     * @param {LabelPrintingRequest} body - Objeto completo con datos del producto, label, y LabelValidation.
     * @returns {Observable<LabelPrintingResponse>}
     */
    postLabelPrinting(body: LabelPrintingRequest): Observable<LabelPrintingResponse> {
        
        // 💡 AJUSTE: Usamos LabelPrintingRequest para el body y LabelPrintingResponse para el tipo de respuesta.
        return this.http.post<LabelPrintingResponse>(this.LABEL_PRINTING_ENDPOINT, body)
            .pipe(
                // Manejo de errores común
                catchError(this.handleError.bind(this)),
            );
    }

    /**
     * @description Realiza una consulta predictiva en el campo 'process'.
     * @param {ViewAddRequest} body - Objeto que contiene el término de búsqueda ('process').
     * @returns {Observable<ViewAddResponse>} - Arreglo de procesos encontrados.
     */
    predictiveViewAdd(body: ViewAddRequest): Observable<ViewAddResponse> {
        
        // Usamos la nueva interfaz ViewAddRequest para el body y ViewAddResponse para la respuesta
        return this.http.post<ViewAddResponse>(this.VIEW_ADD_ENDPOINT, body)
            .pipe(
                // Manejo de errores común
                catchError(this.handleError.bind(this)),
            );
    }
}