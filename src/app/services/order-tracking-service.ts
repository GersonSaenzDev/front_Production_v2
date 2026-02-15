// src/app/services/order-tracking.service.ts

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { environment } from 'src/environments/environment';
import { 
    OrderTrackingResponse, 
    OrderLoadingResponse 
} from '../interfaces/order-tracking.interface';

@Injectable({
    providedIn: 'root'
})
export class OrderTrackingService {

    private http = inject(HttpClient);
    
    // --- Configuración de Endpoints ---
    private readonly BASE_URL = environment.backendUrl;
    private readonly ENDPOINT = `${this.BASE_URL}/api/v1/customerHouse`;
    
    // Rutas específicas centralizadas
    private readonly LOADING_URL   = `${this.ENDPOINT}/orderLoading`;
    private readonly TRACKING_URL  = `${this.ENDPOINT}/viewOrderTracking`;
    private readonly PROCESSED_URL = `${this.ENDPOINT}/viewProcessedTrackings`;

    /**
     * @description Manejo centralizado de errores HTTP.
     */
    private handleError(error: any): Observable<never> {
        console.error('OrderTrackingService: Error en la petición:', error);
        let errorMessage = 'Ocurrió un error desconocido.';
        
        if (error.error && error.error.msg) {
            errorMessage = error.error.msg;
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        return throwError(() => new Error(errorMessage));
    }

    /**
     * @description Carga un archivo de órdenes (txt/xlsx) para un cliente específico.
     */
    uploadOrderFile(orderLoading: File, customerName: string): Observable<OrderLoadingResponse> {
        const formData = new FormData();
        formData.append('orderLoading', orderLoading);
        formData.append('customerName', customerName);

        return this.http.post<OrderLoadingResponse>(this.LOADING_URL, formData)
            .pipe(
                catchError(this.handleError.bind(this))
            );
    }

    /**
     * @description Obtiene el listado de seguimiento de órdenes.
     */
    getViewOrderTracking(): Observable<OrderTrackingResponse> {
        return this.http.get<OrderTrackingResponse>(this.TRACKING_URL)
            .pipe(
                catchError(this.handleError.bind(this)),
                map(res => {
                    console.log('ORDER TRACKING: Registros recuperados:', res.count);
                    return res;
                })
            );
    }

    /**
     * @description Obtiene el listado de trackings ya procesados.
     */
    getProcessedTrackings(): Observable<OrderTrackingResponse> {
        return this.http.get<OrderTrackingResponse>(this.PROCESSED_URL)
            .pipe(
                catchError(this.handleError.bind(this))
            );
    }

    /**
     * @description Valida el archivo y el cliente antes de procesar.
     */
    validateUpload(file: File | null, client: string): { valid: boolean; error?: string } {
        if (!file) return { valid: false, error: 'Debe seleccionar un archivo.' };
        if (!client || client.trim() === '') return { valid: false, error: 'Debe seleccionar un cliente.' };

        const allowedExtensions = ['txt', 'xlsx'];
        const fileExtension = file.name.split('.').pop()?.toLowerCase();

        if (!fileExtension || !allowedExtensions.includes(fileExtension)) {
            return { valid: false, error: 'Formato no permitido. Use .txt o .xlsx' };
        }

        return { valid: true };
    }
}