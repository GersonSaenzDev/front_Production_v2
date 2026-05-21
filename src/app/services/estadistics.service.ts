// src/app/services/estadistics.service.ts

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { environment } from 'src/environments/environment';
import {
    EstadisticNewsRequest,
    EstadisticNewsResponse
} from '../interfaces/estadistics.interface';

@Injectable({
    providedIn: 'root'
})
export class EstadisticsService {

    private http = inject(HttpClient);
    private readonly BASE_URL = environment.backendUrl;
    private readonly BASE_API = environment.api;
    private readonly VIEW_NEWS_ESTADISTIC_ENDPOINT = `${this.BASE_URL}${this.BASE_API}/assembly/viewNewsEstadistic`;

    /**
     * @description Manejo centralizado de errores HTTP.
     * @param {any} error - El error capturado.
     * @returns {Observable<never>}
     */
    private handleError(error: any): Observable<never> {
        console.error('EstadisticsService: Error en la petición:', error);
        let errorMessage = 'Ocurrió un error desconocido en el servicio.';

        if (error.error && error.error.msg) {
            errorMessage = error.error.msg;
        } else if (error.message) {
            errorMessage = error.message;
        }

        return throwError(() => new Error(`Falló la consulta al backend: ${errorMessage}`));
    }

    /**
     * @description Obtiene las novedades de producción para estadísticas según la fecha.
     * @param {EstadisticNewsRequest} body - Objeto con la fecha a consultar (DD/MM/YYYY).
     * @returns {Observable<EstadisticNewsResponse>}
     */
    getViewNewsEstadistic(body: EstadisticNewsRequest): Observable<EstadisticNewsResponse> {
        // console.log('ESTADISTICS SERVICE - CONTROL: Petición a viewNewsEstadistic con body:', body);

        return this.http.post<EstadisticNewsResponse>(this.VIEW_NEWS_ESTADISTIC_ENDPOINT, body)
            .pipe(
                catchError(this.handleError.bind(this)),
                map(response => {
                    console.log('ESTADISTICS SERVICE - CONTROL: Respuesta del backend (viewNewsEstadistic):', response);
                    return response;
                })
            );
    }
}
