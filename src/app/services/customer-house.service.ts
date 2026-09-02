// src/app/services/customer-house.service.ts

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { environment } from 'src/environments/environment';
import {
  FreightDispatchRequest,
  FreightDispatchResponse,
  FreightDispatchUpdateRequest,
  FreightDispatchDateRangeFilter,
  FreightDispatchListResponse,
  FreightDispatchDetailResponse,
  FreightNextDispatchNumberResponse,
  FreightCarrierCreateRequest,
  FreightCarrierUpdateRequest,
  FreightCarrierListFilters,
  FreightCarrierDetailQuery,
  FreightRateUpsertRequest,
  FreightRateDeleteRequest,
  FreightAdditionalCostUpsertRequest,
  FreightAdditionalCostDeleteRequest,
  FreightCarrierStatusRequest,
  FreightCarrierDeleteRequest,
  FreightCarrierResponse,
  FreightCarrierListResponse,
  FreightCarrierDetailResponse,
  FreightVehicleTypesResponse
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
  private readonly FREIGHT_DISPATCH_INVOICE_DOCUMENT_ENDPOINT = `${this.FREIGHT_DISPATCH_ENDPOINT}/invoiceDocument`;

  // Transportadoras (carriers) y sus tarifas de flete.
  private readonly CARRIER_ENDPOINT = `${this.BASE_ENDPOINT}/carrier`;
  private readonly CARRIER_LIST_ENDPOINT = `${this.CARRIER_ENDPOINT}/list`;
  private readonly CARRIER_DETAIL_ENDPOINT = `${this.CARRIER_ENDPOINT}/detail`;
  private readonly CARRIER_VEHICLE_TYPES_ENDPOINT = `${this.CARRIER_ENDPOINT}/vehicleTypes`;

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
   * el servidor; las facturas PDF adjuntas se archivan en el disco de red compartido.
   * Los campos de transportadora/vehículo/cubicaje (carrierId, vehicleType, mainDestination,
   * ratedFreightValue, vehicleCapacityM3 e items[].volumeM3) viajan dentro del mismo `payload`.
   * @param {FreightDispatchRequest} body - Datos del despacho a registrar (sin dispatchNumber).
   * @param {File[]} invoiceFiles - Facturas PDF adjuntas (0-n).
   * @param {{invoiceNumber: string, totalValue: number}[]} invoiceMeta - Metadata alineada por índice con invoiceFiles.
   * @returns {Observable<FreightDispatchResponse>}
   */
  createFreightDispatch(
    body: FreightDispatchRequest,
    invoiceFiles: File[] = [],
    invoiceMeta: { invoiceNumber: string; totalValue: number }[] = []
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

  /**
   * @description Actualiza un despacho de flete: agrega una novedad/detalle de entrega,
   * opcionalmente una nueva entrada de costos adicionales, y opcionalmente cambia el estado.
   * @param {string} id - _id del despacho.
   * @param {FreightDispatchUpdateRequest} body - { additionalCosts?, detail, status? }.
   * @returns {Observable<FreightDispatchResponse>}
   */
  updateFreightDispatch(id: string, body: FreightDispatchUpdateRequest): Observable<FreightDispatchResponse> {
    return this.http.patch<FreightDispatchResponse>(`${this.FREIGHT_DISPATCH_ENDPOINT}/${id}`, body).pipe(
      catchError(this.handleError.bind(this)),
      map((response) => {
        console.log('CUSTOMER HOUSE SERVICE - CONTROL: Respuesta del backend (updateFreightDispatch):', response);
        return response;
      })
    );
  }

  /**
   * @description Descarga/visualiza una factura PDF ya archivada.
   * @param {string} relativePath - invoiceDocuments[].relativePath del despacho.
   * @returns {Observable<Blob>}
   */
  downloadInvoiceDocument(relativePath: string): Observable<Blob> {
    return this.http
      .get(this.FREIGHT_DISPATCH_INVOICE_DOCUMENT_ENDPOINT, {
        params: { relativePath },
        responseType: 'blob'
      })
      .pipe(catchError(this.handleError.bind(this)));
  }

  // ==========================================================================
  // TRANSPORTADORAS (carriers): tarifas de flete por destino + tipo de vehículo
  // (rates[]) y costos adicionales al flete (additionalCosts[]). CRUD con
  // borrado lógico (status: false) y auditoría por movimiento. La identidad del
  // usuario la resuelve el backend desde el token.
  // ==========================================================================

  /**
   * @description Catálogo de tipos de vehículo admitidos en las tarifas (para el picker del formulario).
   * @returns {Observable<FreightVehicleTypesResponse>}
   */
  getCarrierVehicleTypes(): Observable<FreightVehicleTypesResponse> {
    return this.http.get<FreightVehicleTypesResponse>(this.CARRIER_VEHICLE_TYPES_ENDPOINT).pipe(
      catchError(this.handleError.bind(this)),
      map((response) => {
        console.log('CUSTOMER HOUSE SERVICE - CONTROL: Respuesta del backend (getCarrierVehicleTypes):', response);
        return response;
      })
    );
  }

  /**
   * @description Lista transportadoras. Filtros opcionales combinados por AND; sin `status`
   * se devuelven activas e inactivas.
   * @param {FreightCarrierListFilters} filters - { name?, status?, destination?, vehicleType? }.
   * @returns {Observable<FreightCarrierListResponse>}
   */
  listCarriers(filters: FreightCarrierListFilters = {}): Observable<FreightCarrierListResponse> {
    return this.http.post<FreightCarrierListResponse>(this.CARRIER_LIST_ENDPOINT, filters).pipe(
      catchError(this.handleError.bind(this)),
      map((response) => {
        console.log('CUSTOMER HOUSE SERVICE - CONTROL: Respuesta del backend (listCarriers):', response);
        return response;
      })
    );
  }

  /**
   * @description Detalle de una transportadora (incluye rates y auditTrail). El detalle viene en `msg`.
   * @param {FreightCarrierDetailQuery} query - { id } o { name }.
   * @returns {Observable<FreightCarrierDetailResponse>}
   */
  getCarrierDetail(query: FreightCarrierDetailQuery): Observable<FreightCarrierDetailResponse> {
    return this.http.post<FreightCarrierDetailResponse>(this.CARRIER_DETAIL_ENDPOINT, query).pipe(
      catchError(this.handleError.bind(this)),
      map((response) => {
        console.log('CUSTOMER HOUSE SERVICE - CONTROL: Respuesta del backend (getCarrierDetail):', response);
        return response;
      })
    );
  }

  /**
   * @description Registra una transportadora (con tarifas y costos adicionales iniciales
   * opcionales). El nombre es único sin distinguir mayúsculas; estado inicial activo.
   * @param {FreightCarrierCreateRequest} body - Cabecera + rates? + additionalCosts? iniciales.
   * @returns {Observable<FreightCarrierResponse>}
   */
  createCarrier(body: FreightCarrierCreateRequest): Observable<FreightCarrierResponse> {
    return this.http.post<FreightCarrierResponse>(this.CARRIER_ENDPOINT, body).pipe(
      catchError(this.handleError.bind(this)),
      map((response) => {
        console.log('CUSTOMER HOUSE SERVICE - CONTROL: Respuesta del backend (createCarrier):', response);
        return response;
      })
    );
  }

  /**
   * @description Actualiza datos de cabecera de la transportadora y/o REEMPLAZA por completo
   * su tabla de tarifas (si `body.rates` viene definido) y/o su catálogo de costos adicionales
   * (si `body.additionalCosts` viene definido). `observation` es obligatoria y queda en el auditTrail.
   * @param {string} id - _id de la transportadora.
   * @param {FreightCarrierUpdateRequest} body - Cabecera parcial + rates? + additionalCosts? + observation.
   * @returns {Observable<FreightCarrierResponse>}
   */
  updateCarrier(id: string, body: FreightCarrierUpdateRequest): Observable<FreightCarrierResponse> {
    return this.http.put<FreightCarrierResponse>(`${this.CARRIER_ENDPOINT}/${id}`, body).pipe(
      catchError(this.handleError.bind(this)),
      map((response) => {
        console.log('CUSTOMER HOUSE SERVICE - CONTROL: Respuesta del backend (updateCarrier):', response);
        return response;
      })
    );
  }

  /**
   * @description Alta o edición de UNA línea de tarifa (upsert por destination + vehicleType).
   * @param {string} id - _id de la transportadora.
   * @param {FreightRateUpsertRequest} body - { destination, vehicleType, value, observation? }.
   * @returns {Observable<FreightCarrierResponse>}
   */
  upsertCarrierRate(id: string, body: FreightRateUpsertRequest): Observable<FreightCarrierResponse> {
    return this.http.post<FreightCarrierResponse>(`${this.CARRIER_ENDPOINT}/${id}/rate`, body).pipe(
      catchError(this.handleError.bind(this)),
      map((response) => {
        console.log('CUSTOMER HOUSE SERVICE - CONTROL: Respuesta del backend (upsertCarrierRate):', response);
        return response;
      })
    );
  }

  /**
   * @description Elimina UNA línea de tarifa. El backend exige body, por eso se usa `delete` con `body`.
   * @param {string} id - _id de la transportadora.
   * @param {FreightRateDeleteRequest} body - { destination, vehicleType, observation? }.
   * @returns {Observable<FreightCarrierResponse>}
   */
  deleteCarrierRate(id: string, body: FreightRateDeleteRequest): Observable<FreightCarrierResponse> {
    return this.http.delete<FreightCarrierResponse>(`${this.CARRIER_ENDPOINT}/${id}/rate`, { body }).pipe(
      catchError(this.handleError.bind(this)),
      map((response) => {
        console.log('CUSTOMER HOUSE SERVICE - CONTROL: Respuesta del backend (deleteCarrierRate):', response);
        return response;
      })
    );
  }

  /**
   * @description Alta o edición de UN costo adicional al flete (upsert por descripción).
   * @param {string} id - _id de la transportadora.
   * @param {FreightAdditionalCostUpsertRequest} body - { description, value, observation? }.
   * @returns {Observable<FreightCarrierResponse>}
   */
  upsertCarrierAdditionalCost(id: string, body: FreightAdditionalCostUpsertRequest): Observable<FreightCarrierResponse> {
    return this.http.post<FreightCarrierResponse>(`${this.CARRIER_ENDPOINT}/${id}/additionalCost`, body).pipe(
      catchError(this.handleError.bind(this)),
      map((response) => {
        console.log('CUSTOMER HOUSE SERVICE - CONTROL: Respuesta del backend (upsertCarrierAdditionalCost):', response);
        return response;
      })
    );
  }

  /**
   * @description Elimina UN costo adicional por su descripción. El backend exige body,
   * por eso se usa `delete` con `body`.
   * @param {string} id - _id de la transportadora.
   * @param {FreightAdditionalCostDeleteRequest} body - { description, observation? }.
   * @returns {Observable<FreightCarrierResponse>}
   */
  deleteCarrierAdditionalCost(id: string, body: FreightAdditionalCostDeleteRequest): Observable<FreightCarrierResponse> {
    return this.http.delete<FreightCarrierResponse>(`${this.CARRIER_ENDPOINT}/${id}/additionalCost`, { body }).pipe(
      catchError(this.handleError.bind(this)),
      map((response) => {
        console.log('CUSTOMER HOUSE SERVICE - CONTROL: Respuesta del backend (deleteCarrierAdditionalCost):', response);
        return response;
      })
    );
  }

  /**
   * @description Cambio de estado explícito de la transportadora (reactivar / desactivar).
   * @param {string} id - _id de la transportadora.
   * @param {FreightCarrierStatusRequest} body - { status, observation }.
   * @returns {Observable<FreightCarrierResponse>}
   */
  setCarrierStatus(id: string, body: FreightCarrierStatusRequest): Observable<FreightCarrierResponse> {
    return this.http.patch<FreightCarrierResponse>(`${this.CARRIER_ENDPOINT}/${id}/status`, body).pipe(
      catchError(this.handleError.bind(this)),
      map((response) => {
        console.log('CUSTOMER HOUSE SERVICE - CONTROL: Respuesta del backend (setCarrierStatus):', response);
        return response;
      })
    );
  }

  /**
   * @description Borrado lógico de la transportadora (status -> false). El documento nunca se
   * elimina. El backend exige body, por eso se usa `delete` con `body`.
   * @param {string} id - _id de la transportadora.
   * @param {FreightCarrierDeleteRequest} body - { observation }.
   * @returns {Observable<FreightCarrierResponse>}
   */
  deleteCarrier(id: string, body: FreightCarrierDeleteRequest): Observable<FreightCarrierResponse> {
    return this.http.delete<FreightCarrierResponse>(`${this.CARRIER_ENDPOINT}/${id}`, { body }).pipe(
      catchError(this.handleError.bind(this)),
      map((response) => {
        console.log('CUSTOMER HOUSE SERVICE - CONTROL: Respuesta del backend (deleteCarrier):', response);
        return response;
      })
    );
  }
}
