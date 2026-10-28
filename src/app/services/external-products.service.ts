// src/app/services/external-products.service.ts
//
// Importaciones / Externos (ingreso con pistola, inventario, salida manual, catálogo,
// auditoría) y Devoluciones / Garantías. Backend: /api/storage/external/* y /returns/*.
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import {
  ExternalAccess,
  ExternalApiResponse,
  ExternalAuditLog,
  ExternalCatalog,
  ExternalEntryRequest,
  ExternalEntryResult,
  ExternalImportResult,
  ExternalManualExitRequest,
  ExternalManualExitResult,
  ExternalProductRequest,
  ExternalSaveProductResult,
  ExternalStockSummary,
  ExternalTrace,
  ExternalUnitFilters,
  ExternalUnitsResponse,
  WarrantyReturn,
  WarrantyReturnCloseRequest,
  WarrantyReturnListRequest,
  WarrantyReturnReceiveResult,
  WarrantyReturnRequest
} from '../interfaces/external-products.interface';

export interface ExternalAuditFilters {
  from?: string;
  to?: string;
  action?: string;
  module?: 'EXTERNAL' | 'RETURNS' | '';
  userApp?: string;
  barcode?: string;
  page?: number;
  limit?: number;
}

@Injectable({
  providedIn: 'root'
})
export class ExternalProductsService {
  private http = inject(HttpClient);
  private readonly EXTERNAL_ENDPOINT = `${environment.backendUrl}${environment.api}/storage/external`;
  private readonly RETURNS_ENDPOINT = `${environment.backendUrl}${environment.api}/storage/returns`;

  private handleError(error: { error?: { msg?: string }; message?: string }) {
    console.error('ExternalProductsService: Error en la petición:', error);
    const errorMessage = error?.error?.msg || error?.message || 'Ocurrió un error desconocido en el servicio.';
    return throwError(() => new Error(errorMessage));
  }

  getAccess(): Observable<ExternalApiResponse<ExternalAccess>> {
    return this.http
      .get<ExternalApiResponse<ExternalAccess>>(`${this.EXTERNAL_ENDPOINT}/access`)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * Ingreso con pistola. Sin handleError: la cola offline necesita el HttpErrorResponse
   * (status 0 = red -> reintento; 4xx = rechazo del backend).
   */
  registerEntry(payload: ExternalEntryRequest): Observable<ExternalApiResponse<ExternalEntryResult>> {
    return this.http.post<ExternalApiResponse<ExternalEntryResult>>(`${this.EXTERNAL_ENDPOINT}/entry`, payload);
  }

  voidEntry(unitId: string, observation: string): Observable<ExternalApiResponse<{ _id: string; status: string }>> {
    return this.http
      .post<ExternalApiResponse<{ _id: string; status: string }>>(`${this.EXTERNAL_ENDPOINT}/entry/void`, { unitId, observation })
      .pipe(catchError(this.handleError.bind(this)));
  }

  listUnits(filters: ExternalUnitFilters): Observable<ExternalUnitsResponse> {
    return this.http.post<ExternalUnitsResponse>(`${this.EXTERNAL_ENDPOINT}/units`, filters).pipe(catchError(this.handleError.bind(this)));
  }

  getStock(filters: ExternalUnitFilters): Observable<ExternalApiResponse<ExternalStockSummary>> {
    return this.http
      .post<ExternalApiResponse<ExternalStockSummary>>(`${this.EXTERNAL_ENDPOINT}/stock`, filters)
      .pipe(catchError(this.handleError.bind(this)));
  }

  trace(barcode: string): Observable<ExternalApiResponse<ExternalTrace>> {
    return this.http
      .post<ExternalApiResponse<ExternalTrace>>(`${this.EXTERNAL_ENDPOINT}/trace`, { barcode })
      .pipe(catchError(this.handleError.bind(this)));
  }

  manualExit(payload: ExternalManualExitRequest): Observable<ExternalApiResponse<ExternalManualExitResult>> {
    // Sin handleError: un 409 trae el detalle por serial en `data.results`
    return this.http.post<ExternalApiResponse<ExternalManualExitResult>>(`${this.EXTERNAL_ENDPOINT}/exit`, payload);
  }

  listProducts(search = '', includeInactive = false): Observable<ExternalApiResponse<ExternalCatalog>> {
    return this.http
      .post<ExternalApiResponse<ExternalCatalog>>(`${this.EXTERNAL_ENDPOINT}/products/list`, { search, includeInactive })
      .pipe(catchError(this.handleError.bind(this)));
  }

  saveProduct(payload: ExternalProductRequest): Observable<ExternalApiResponse<ExternalSaveProductResult>> {
    return this.http
      .post<ExternalApiResponse<ExternalSaveProductResult>>(`${this.EXTERNAL_ENDPOINT}/products`, payload)
      .pipe(catchError(this.handleError.bind(this)));
  }

  importProducts(file: File): Observable<ExternalApiResponse<ExternalImportResult>> {
    const formData = new FormData();
    formData.append('productsFile', file, file.name);
    // Sin handleError: un 400 trae el detalle por fila en `data.results`
    return this.http.post<ExternalApiResponse<ExternalImportResult>>(`${this.EXTERNAL_ENDPOINT}/products/import`, formData);
  }

  listAudit(filters: ExternalAuditFilters): Observable<ExternalApiResponse<ExternalAuditLog[]>> {
    return this.http
      .post<ExternalApiResponse<ExternalAuditLog[]>>(`${this.EXTERNAL_ENDPOINT}/audit`, filters)
      .pipe(catchError(this.handleError.bind(this)));
  }

  // ---------------------------------------------------------------- Devoluciones / Garantías
  receiveReturn(payload: WarrantyReturnRequest): Observable<ExternalApiResponse<WarrantyReturnReceiveResult>> {
    return this.http
      .post<ExternalApiResponse<WarrantyReturnReceiveResult>>(`${this.RETURNS_ENDPOINT}/receive`, payload)
      .pipe(catchError(this.handleError.bind(this)));
  }

  listReturns(filters: WarrantyReturnListRequest): Observable<ExternalApiResponse<WarrantyReturn[]>> {
    return this.http
      .post<ExternalApiResponse<WarrantyReturn[]>>(`${this.RETURNS_ENDPOINT}/list`, filters)
      .pipe(catchError(this.handleError.bind(this)));
  }

  closeReturn(payload: WarrantyReturnCloseRequest): Observable<ExternalApiResponse<WarrantyReturn>> {
    return this.http
      .post<ExternalApiResponse<WarrantyReturn>>(`${this.RETURNS_ENDPOINT}/close`, payload)
      .pipe(catchError(this.handleError.bind(this)));
  }
}
