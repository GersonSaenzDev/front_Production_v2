/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/services/price-list-services.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import {
  PriceListUploadResponse,
  PriceListListPayload,
  PriceListListResponse,
  PriceListDetailPayload,
  PriceListDetailResponse
} from '../interfaces/price-list.interface';

@Injectable({
  providedIn: 'root'
})
export class PriceListServices {
  private http = inject(HttpClient);
  private readonly BASE_URL = environment.backendUrl;
  private readonly BASE_API = environment.api;
  private readonly PRICE_LIST_ENDPOINT = `${this.BASE_URL}${this.BASE_API}/master/priceList`;
  private readonly PRICE_LIST_LIST_ENDPOINT = `${this.BASE_URL}${this.BASE_API}/master/priceList/list`;
  private readonly PRICE_LIST_DETAIL_ENDPOINT = `${this.BASE_URL}${this.BASE_API}/master/priceList/detail`;

  // El header `x-token` lo agrega automáticamente el authInterceptor para
  // cualquier petición al backend, por lo que no se setea manualmente aquí.

  private handleError(error: any) {
    if (error?.error?.msg) {
      return throwError(() => new Error(error.error.msg));
    }
    const fallback = error?.message || 'Ocurrió un error desconocido en el servicio.';
    return throwError(() => new Error(`Falló la consulta al backend: ${fallback}`));
  }

  /**
   * @description Carga el archivo de lista de precios (POST /master/priceList).
   * @param {File} priceListFile - Archivo Excel con la lista de precios a cargar.
   * @returns {Observable<PriceListUploadResponse>}
   */
  uploadPriceList(priceListFile: File): Observable<PriceListUploadResponse> {
    const formData = new FormData();
    formData.append('priceListFile', priceListFile);

    return this.http
      .post<PriceListUploadResponse>(this.PRICE_LIST_ENDPOINT, formData)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * @description Busca la lista de precios con filtros opcionales combinables por AND (POST /master/priceList/list).
   * @param {PriceListListPayload} payload - Filtros opcionales (ean, internalCode, model, productRange, productLine, search).
   * @returns {Observable<PriceListListResponse>}
   */
  getPriceList(payload: PriceListListPayload = {}): Observable<PriceListListResponse> {
    return this.http
      .post<PriceListListResponse>(this.PRICE_LIST_LIST_ENDPOINT, payload)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * @description Obtiene el detalle de precio de una referencia puntual, incluyendo su auditTrail
   * (POST /master/priceList/detail).
   * @param {PriceListDetailPayload} payload - Identificador por `ean`, `internalCode` o `model`.
   * @returns {Observable<PriceListDetailResponse>}
   */
  getPriceListDetail(payload: PriceListDetailPayload): Observable<PriceListDetailResponse> {
    return this.http
      .post<PriceListDetailResponse>(this.PRICE_LIST_DETAIL_ENDPOINT, payload)
      .pipe(catchError(this.handleError.bind(this)));
  }
}
