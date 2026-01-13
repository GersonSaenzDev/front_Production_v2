// src/app/services/printingLabels-services.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { environment } from 'src/environments/environment';
import { 
  LabelParametersRequest, 
  LabelParametersResponse, 
  LabelPrintingRequest, 
  LabelPrintingResponse, 
  ViewAddRequest, 
  ViewAddResponse,
  ReprintLabelRequest,
  ReprintLabelResponse,
  VoidLabelRequest,
  VoidLabelResponse
} from '../interfaces/printingLabel.interfaces';
import { CurrentConsecutiveResponse } from './currentConsecutive.interface';

@Injectable({
  providedIn: 'root'
})
export class PrintingLabelsService { 

  private http = inject(HttpClient);
  private readonly BASE_URL = environment.backendUrl;
  private readonly BASE_API = environment.api;

  private readonly ENDPOINTS = {
    parameters: `${this.BASE_URL}${this.BASE_API}/printing/labelParameters`,
    consecutive: `${this.BASE_URL}${this.BASE_API}/printing/currentConsecutive`,
    printing: `${this.BASE_URL}${this.BASE_API}/printing/labelPrinting`,
    viewAdd: `${this.BASE_URL}${this.BASE_API}/printing/viewAdd`,
    scan: `${this.BASE_URL}${this.BASE_API}/printing/barcodeReadingScan`,
    reprint: `${this.BASE_URL}${this.BASE_API}/printing/reprintLabel`,
    remove: `${this.BASE_URL}${this.BASE_API}/printing/labelRemove`,
  };

  private handleError(error: any) {
    let errorMessage = error.error?.msg || error.message || 'Error desconocido en el servicio';
    return throwError(() => new Error(`Falló la consulta al backend: ${errorMessage}`));
  }

  postLabelParameters(body: LabelParametersRequest): Observable<LabelParametersResponse> {
    return this.http.post<LabelParametersResponse>(this.ENDPOINTS.parameters, body)
      .pipe(catchError(this.handleError.bind(this)));
  }

  postCurrentConsecutive(body: LabelParametersRequest): Observable<CurrentConsecutiveResponse> {
    return this.http.post<CurrentConsecutiveResponse>(this.ENDPOINTS.consecutive, body)
      .pipe(catchError(this.handleError.bind(this)));
  }

  postLabelPrinting(body: LabelPrintingRequest): Observable<LabelPrintingResponse> {
    return this.http.post<LabelPrintingResponse>(this.ENDPOINTS.printing, body)
    .pipe(catchError(this.handleError.bind(this)));
  }

  predictiveViewAdd(body: ViewAddRequest): Observable<ViewAddResponse> {
    return this.http.post<ViewAddResponse>(this.ENDPOINTS.viewAdd, body)
      .pipe(catchError(this.handleError.bind(this)));
  }

  postBarcodeReadingScan(body: any): Observable<any> {
    return this.http.post<any>(this.ENDPOINTS.scan, body)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * @description Realiza la petición de reimpresión al backend
   */
  reprintLabel(body: ReprintLabelRequest): Observable<ReprintLabelResponse> {
    return this.http.post<ReprintLabelResponse>(this.ENDPOINTS.reprint, body)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * @description Realiza la anulación de una etiqueta en el sistema
   * @param body Datos de la etiqueta y motivo de anulación
   */
  labelRemove(body: VoidLabelRequest): Observable<VoidLabelResponse> {
    return this.http.post<VoidLabelResponse>(this.ENDPOINTS.remove, body)
      .pipe(
        catchError(this.handleError.bind(this))
      );
  }
}