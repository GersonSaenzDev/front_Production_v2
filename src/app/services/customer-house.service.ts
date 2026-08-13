// src/app/services/customer-house.service.ts

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { environment } from 'src/environments/environment';
import {
  FreightDispatchRequest,
  FreightDispatchResponse,
  FreightDispatchDateRangeFilter,
  FreightDispatchListResponse,
  FreightDispatchDetailResponse,
  FreightNextDispatchNumberResponse
} from '../interfaces/customer-house.interface';

@Injectable({
  providedIn: 'root'
})
export class CustomerHouseService {
  private http = inject(HttpClient);
  private readonly BASE_URL = environment.backendUrl;
  private readonly BASE_API = environment.api;
  private readonly BASE_ENDPOINT = `${this.BASE_URL}${this.BASE_API}/customerHouse`;
  private readonly FREIGHT_DISPATCH_ENDPOINT = `${this.BASE_ENDPOINT}/freightDispatch`;
  private readonly FREIGHT_DISPATCH_LIST_ENDPOINT = `${this.FREIGHT_DISPATCH_ENDPOINT}/list`;
  private readonly FREIGHT_DISPATCH_DETAIL_ENDPOINT = `${this.FREIGHT_DISPATCH_ENDPOINT}/detail`;
  private readonly FREIGHT_DISPATCH_NEXT_NUMBER_ENDPOINT = `${this.FREIGHT_DISPATCH_ENDPOINT}/nextNumber`;

  /**
   * @description Manejo centralizado de errores HTTP.
   * @param {any} error - El error capturado.
   * @returns {Observable<never>}
   */
  private handleError(error: any): Observable<never> {
    console.error('CustomerHouseService: Error en la petición:', error);
    let errorMessage = 'Ocurrió un error desconocido en el servicio.';

    if (error.error && error.error.msg) {
      errorMessage = error.error.msg;
    } else if (error.message) {
      errorMessage = error.message;
    }

    return throwError(() => new Error(`Falló la consulta al backend: ${errorMessage}`));
  }

  /**
   * @description Registra un despacho de flete multicliente. El N° de despacho lo genera
   * el servidor; las facturas PDF adjuntas se reenvían a InduTalent para archivarse.
   * @param {FreightDispatchRequest} body - Datos del despacho a registrar (sin dispatchNumber).
   * @param {File[]} invoiceFiles - Facturas PDF adjuntas (0-n).
   * @param {{invoiceNumber: string}[]} invoiceMeta - Metadata alineada por índice con invoiceFiles.
   * @returns {Observable<FreightDispatchResponse>}
   */
  createFreightDispatch(
    body: FreightDispatchRequest,
    invoiceFiles: File[] = [],
    invoiceMeta: { invoiceNumber: string }[] = []
  ): Observable<FreightDispatchResponse> {
    const formData = new FormData();
    formData.append('payload', JSON.stringify({ ...body, invoiceMeta }));
    invoiceFiles.forEach((file) => formData.append('invoices', file));

    return this.http.post<FreightDispatchResponse>(this.FREIGHT_DISPATCH_ENDPOINT, formData).pipe(
      catchError(this.handleError.bind(this)),
      map((response) => {
        console.log('CUSTOMER HOUSE SERVICE - CONTROL: Respuesta del backend (createFreightDispatch):', response);
        return response;
      })
    );
  }

  /**
   * @description Previsualiza (sin reservar) el próximo N° de despacho, para mostrarlo
   * de solo lectura al abrir el formulario.
   * @returns {Observable<FreightNextDispatchNumberResponse>}
   */
  getNextDispatchNumber(): Observable<FreightNextDispatchNumberResponse> {
    return this.http.get<FreightNextDispatchNumberResponse>(this.FREIGHT_DISPATCH_NEXT_NUMBER_ENDPOINT).pipe(
      catchError(this.handleError.bind(this)),
      map((response) => {
        console.log('CUSTOMER HOUSE SERVICE - CONTROL: Respuesta del backend (getNextDispatchNumber):', response);
        return response;
      })
    );
  }

  /**
   * @description Lista los despachos de flete registrados en un rango de fechas.
   * @param {FreightDispatchDateRangeFilter} body - Rango de fechas a consultar (DD/MM/YYYY).
   * @returns {Observable<FreightDispatchListResponse>}
   */
  listFreightDispatch(body: FreightDispatchDateRangeFilter): Observable<FreightDispatchListResponse> {
    return this.http.post<FreightDispatchListResponse>(this.FREIGHT_DISPATCH_LIST_ENDPOINT, body).pipe(
      catchError(this.handleError.bind(this)),
      map((response) => {
        console.log('CUSTOMER HOUSE SERVICE - CONTROL: Respuesta del backend (listFreightDispatch):', response);
        return response;
      })
    );
  }

  /**
   * @description Obtiene el detalle de los despachos de flete en un rango de fechas.
   * @param {FreightDispatchDateRangeFilter} body - Rango de fechas a consultar (DD/MM/YYYY).
   * @returns {Observable<FreightDispatchDetailResponse>}
   */
  getFreightDispatchDetail(body: FreightDispatchDateRangeFilter): Observable<FreightDispatchDetailResponse> {
    return this.http.post<FreightDispatchDetailResponse>(this.FREIGHT_DISPATCH_DETAIL_ENDPOINT, body).pipe(
      catchError(this.handleError.bind(this)),
      map((response) => {
        console.log('CUSTOMER HOUSE SERVICE - CONTROL: Respuesta del backend (getFreightDispatchDetail):', response);
        return response;
      })
    );
  }
}
