// src/app/services/printingLabels-services.ts

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { environment } from 'src/environments/environment';
import { LabelParametersRequest, LabelParametersResponse } from '../interfaces/printingLabel.interfaces';

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
        
        // 💡 AJUSTE: Usamos el método POST y las interfaces correctas.
        // El 'map' de la respuesta ya no es necesario ya que la respuesta
        // exitosa del backend ya contiene 'ok' y 'msg'.
        return this.http.post<LabelParametersResponse>(this.LABEL_PARAMETERS_ENDPOINT, body)
            .pipe(
                // Manejo de errores común
                catchError(this.handleError.bind(this)),
            );
    }
}