// src/app/services/news-services.ts

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { environment } from 'src/environments/environment';
import { 
    ProductionNewsRequest, 
    ProductionNewsResponse,
    WarehouseNewsRequest,
    WarehouseNewsResponse 
} from '../interfaces/production-news.interface';

@Injectable({
    providedIn: 'root'
})
export class NewsServices {

    private http = inject(HttpClient);
    private readonly BASE_URL = environment.backendUrl;
    private readonly PRODUCTION_NEWS_ENDPOINT = `${this.BASE_URL}/api/v1/assembly/productionNews`;
    private readonly WAREHOUSE_NEWS_ENDPOINT = `${this.BASE_URL}/api/v1/storage/newsWarehouse`;

    /**
     * @description Manejo centralizado de errores HTTP.
     * @param {any} error - El error capturado.
     * @returns {Observable<never>}
     */
    private handleError(error: any): Observable<never> {
        console.error('NewsServices: Error en la petición:', error);
        let errorMessage = 'Ocurrió un error desconocido en el servicio.';
        
        if (error.error && error.error.msg) {
            errorMessage = error.error.msg;
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        return throwError(() => new Error(`Falló la consulta al backend: ${errorMessage}`));
    }

    /**
     * @description Crea una nueva novedad de producción.
     * @param {ProductionNewsRequest} newsData - Los datos de la novedad a registrar.
     * @returns {Observable<ProductionNewsResponse>}
     */
    createProductionNews(newsData: ProductionNewsRequest): Observable<ProductionNewsResponse> {
        console.log('NEWS SERVICES - CONTROL: Petición a productionNews con body:', newsData);

        return this.http.post<ProductionNewsResponse>(this.PRODUCTION_NEWS_ENDPOINT, newsData)
            .pipe(
                catchError(this.handleError.bind(this)),
                map(response => {
                    console.log('NEWS SERVICES - CONTROL: Respuesta del backend (productionNews):', response);
                    return response;
                })
            );
    }

    /**
     * @description Crea una nueva novedad de bodega/almacén.
     * @param {WarehouseNewsRequest} newsData - Los datos de la novedad de bodega a registrar.
     * @returns {Observable<WarehouseNewsResponse>}
     */
    createWarehouseNews(newsData: WarehouseNewsRequest): Observable<WarehouseNewsResponse> {
        console.log('NEWS SERVICES - CONTROL: Petición a newsWarehouse con body:', newsData);

        return this.http.post<WarehouseNewsResponse>(this.WAREHOUSE_NEWS_ENDPOINT, newsData)
            .pipe(
                catchError(this.handleError.bind(this)),
                map(response => {
                    console.log('NEWS SERVICES - CONTROL: Respuesta del backend (newsWarehouse):', response);
                    return response;
                })
            );
    }

    /**
     * @description Valida que los campos obligatorios estén presentes antes de enviar (Producción).
     * @param {ProductionNewsRequest} newsData - Los datos a validar.
     * @returns {object} - Objeto con valid (boolean) y errors (array de strings).
     */
    validateProductionNews(newsData: ProductionNewsRequest): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        // Validación de campos obligatorios
        if (!newsData.newsDate) errors.push('La fecha de novedad es obligatoria');
        if (!newsData.category) errors.push('La categoría es obligatoria');
        if (!newsData.assemblyLine) errors.push('La línea de ensamble es obligatoria');
        if (!newsData.responsible) errors.push('El área responsable es obligatoria'); // 💡 AJUSTE
        if (!newsData.reference) errors.push('La referencia es obligatoria'); // 💡 AJUSTE
        if (!newsData.detail) errors.push('El detalle es obligatorio');

        // Validación específica para "Parada de Línea"
        if (newsData.category === 'Parada de Linea' || newsData.category === 'Parada de Línea') {
            if (!newsData.stopType) errors.push('El tipo de parada es obligatorio para Parada de Línea');
            if (!newsData.startTime) errors.push('La hora de inicio es obligatoria para Parada de Línea');
            if (!newsData.endTime) errors.push('La hora de fin es obligatoria para Parada de Línea');
            if (!newsData.totalTime) errors.push('El tiempo total es obligatorio para Parada de Línea');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * @description Valida que los campos obligatorios estén presentes antes de enviar (Bodega).
     * @param {WarehouseNewsRequest} newsData - Los datos a validar.
     * @returns {object} - Objeto con valid (boolean) y errors (array de strings).
     */
    validateWarehouseNews(newsData: WarehouseNewsRequest): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        // Validación de campos obligatorios
        if (!newsData.newsDate) errors.push('La fecha de novedad es obligatoria');
        if (!newsData.category) errors.push('La categoría es obligatoria');
        if (!newsData.reference) errors.push('La referencia del producto es obligatoria');
        if (!newsData.reportedAmount) errors.push('La cantidad reportada es obligatoria');
        if (!newsData.description) errors.push('La descripción es obligatoria');

        // Validación de cantidad reportada
        const amount = parseInt(newsData.reportedAmount);
        if (isNaN(amount) || amount <= 0) {
            errors.push('La cantidad reportada debe ser un número mayor a 0');
        }

        // Validación de longitud mínima de descripción
        if (newsData.description && newsData.description.trim().length < 10) {
            errors.push('La descripción debe tener al menos 10 caracteres');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}