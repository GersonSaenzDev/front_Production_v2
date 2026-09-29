// src/app/services/dashInventory-services.ts

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  AreaCountResponse,
  AuditNoteRequest,
  AuditNoteResponse,
  BarcodeRequest,
  ConfirmedCountResponse,
  DuplicatesResponse,
  GlobalCountResponse,
  InsertInventoryRequest,
  InsertInventoryResponse,
  NotCompliantResponse,
  SeeGroupsResponse,
  StorageResponse,
  TeamCountResponse,
  TeamItemsResponse,
  UpdateBarcodeRequest,
  UpdateBarcodeResponse,
  UpdateOrderResponse,
  ViewInventoriesResponse,
  ViewOrderResponse
} from '../interfaces/dashInventory.interface';
import {
  CompletePickingRequest,
  CompletePickingResponse,
  LoadingOrderAccess,
  LoadingOrderApiResponse,
  LoadingOrderDetailRequest,
  LoadingOrderListRequest,
  LoadingOrderRejection,
  LoadingOrderSummary,
  LoadingOrderUploadResponse,
  LoadingOrderView,
  NextPickItemResult,
  PartialCloseRequest,
  ScanSerialRequest,
  ScanSerialResponse,
  VoidReadRequest
} from '../interfaces/loading-order.interface';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class DashInventoryServices {
  private http = inject(HttpClient);
  private readonly BASE_URL = environment.backendUrl; // Cambia por environment.backendUrl si lo tienes
  private readonly BASE_API = environment.api;
  private readonly SEE_GROUPS_ENDPOINT = `${this.BASE_URL}${this.BASE_API}/storage/seeGroups`;
  private readonly CONFIRMED_COUNT_ENDPOINT = `${this.BASE_URL}${this.BASE_API}/storage/confirmedCount`;
  private readonly DUPLICATES_ENDPOINT = `${this.BASE_URL}${this.BASE_API}/storage/duplicates`;
  private readonly GLOBALCOUNT_ENDPOINT = `${this.BASE_URL}${this.BASE_API}/storage/countGlobal`;
  private readonly GLOBALCOUNT_TEAMCOUNT = `${this.BASE_URL}${this.BASE_API}/storage/teamCount`;
  private readonly GLOBALCOUNT_AREACOUNT = `${this.BASE_URL}${this.BASE_API}/storage/areaCount`;
  private readonly GLOBALCOUNT_VIEWINVENTORIES = `${this.BASE_URL}${this.BASE_API}/storage/viewInventories`;
  private readonly GLOBALCOUNT_TEAMITEMS = `${this.BASE_URL}${this.BASE_API}/storage/TeamItems`;
  private readonly GLOBALCOUNT_NOTCOMPLIANT = `${this.BASE_URL}${this.BASE_API}/storage/notCompliant`;
  private readonly GLOBALCOUNT_AUDITNOTE = `${this.BASE_URL}${this.BASE_API}/storage/auditNote`;
  private readonly GLOBALCOUNT_STORAGE = `${this.BASE_URL}${this.BASE_API}/storage`;
  private readonly GLOBALCOUNT_INSERTINVENTORY = `${this.BASE_URL}${this.BASE_API}/storage/insertInventory`;
  private readonly UPDATE_ORDER_ENDPOINT = `${this.BASE_URL}${this.BASE_API}/storage/orderPreparation`;
  private readonly VIEW_ORDER_ENDPOINT = `${this.BASE_URL}${this.BASE_API}/storage/viewOrder`;
  private readonly UPDATE_ORDER_ITEMS_ENDPOINT = `${this.BASE_URL}${this.BASE_API}/storage/updateOrderItems`;
  private readonly UPDATE_BARCODE_READ_ENDPOINT = `${this.BASE_URL}${this.BASE_API}/storage/updateBarcodeReadController`;
  // Órdenes de Cargue (OC) -> prealistamiento
  private readonly LOADING_ORDERS_ENDPOINT = `${this.BASE_URL}${this.BASE_API}/storage/loadingOrders`;

  private handleError(error: any) {
    console.error('DashInventoryServices: Error en la petición:', error);
    let errorMessage = 'Ocurrió un error desconocido en el servicio.';
    if (error.error && error.error?.msg) {
      errorMessage = error.error.msg;
    } else if (error.message) {
      errorMessage = error.message;
    }
    return throwError(() => new Error(`Falló la consulta al backend: ${errorMessage}`));
  }

  /**
   * Obtiene los grupos de almacenamiento para una fecha dada.
   * @param date Fecha en formato 'DD/MM/YYYY'
   */
  getStorageGroups(date: string): Observable<SeeGroupsResponse> {
    const body = { date };
    return this.http.post<SeeGroupsResponse>(this.SEE_GROUPS_ENDPOINT, body).pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * Obtiene el conteo confirmado para una fecha dada.
   * @param date Fecha en formato 'DD/MM/YYYY'
   */
  getConfirmedCount(date: string): Observable<ConfirmedCountResponse> {
    const body = { date };
    return this.http.post<ConfirmedCountResponse>(this.CONFIRMED_COUNT_ENDPOINT, body).pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * Obtiene los códigos duplicados para una fecha dada.
   * @param date Fecha en formato 'DD/MM/YYYY'
   */
  getDuplicates(date: string): Observable<DuplicatesResponse> {
    const body = { date };
    return this.http.post<DuplicatesResponse>(this.DUPLICATES_ENDPOINT, body).pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * Obtiene los códigos duplicados para una fecha dada.
   * @param date Fecha en formato 'DD/MM/YYYY'
   */
  getCountGlobal(date: string): Observable<GlobalCountResponse> {
    const body = { date };
    return this.http.post<GlobalCountResponse>(this.GLOBALCOUNT_ENDPOINT, body).pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * Obtiene los códigos duplicados para una fecha dada.
   * @param date Fecha en formato 'DD/MM/YYYY'
   */
  getTeamCount(date: string): Observable<TeamCountResponse> {
    const body = { date };
    return this.http.post<TeamCountResponse>(this.GLOBALCOUNT_TEAMCOUNT, body).pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * Obtiene los códigos duplicados para una fecha dada.
   * @param date Fecha en formato 'DD/MM/YYYY'
   */
  getAreaCount(date: string): Observable<AreaCountResponse> {
    const body = { date };
    return this.http.post<AreaCountResponse>(this.GLOBALCOUNT_AREACOUNT, body).pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * Obtiene el inventario para un rango de fechas.
   * @param dateIni Fecha inicio en formato 'DD/MM/YYYY'
   * @param dateEnd Fecha fin en formato 'DD/MM/YYYY'
   */
  getViewInventories(dateIni: string, dateEnd: string, limit: number = 100, page: number = 1): Observable<ViewInventoriesResponse> {
    const body = { dateIni, dateEnd, limit, page };
    return this.http.post<ViewInventoriesResponse>(this.GLOBALCOUNT_VIEWINVENTORIES, body).pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * Obtiene items agregados por equipo (area, total, codes[])
   * body: { date, teamKey }
   */
  getTeamItems(date: string, payload: { teamKey: string }): Observable<TeamItemsResponse> {
    const body = { date, ...payload };
    return this.http.post<TeamItemsResponse>(this.GLOBALCOUNT_TEAMITEMS, body).pipe(catchError(this.handleError.bind(this)));
  }

  getNotCompliant(dateIni: string, dateEnd: string, payload: { teamKey: string; page?: number; limit?: number }): Observable<NotCompliantResponse> {
    const body = { dateIni, dateEnd, ...payload };
    return this.http.post<NotCompliantResponse>(this.GLOBALCOUNT_NOTCOMPLIANT, body).pipe(catchError(this.handleError.bind(this)));
  }

  getAuditNote(payload: AuditNoteRequest): Observable<AuditNoteResponse> {
    return this.http.post<AuditNoteResponse>(this.GLOBALCOUNT_AUDITNOTE, payload).pipe(catchError(this.handleError.bind(this)));
  }

  getStorage(payload: BarcodeRequest): Observable<StorageResponse> {
    return this.http.post<StorageResponse>(this.GLOBALCOUNT_STORAGE, payload).pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * Igual que getStorage pero SIN transformar el error. La cola offline del lector
   * necesita el HttpErrorResponse crudo (status HTTP y body {ok, msg}) para poder
   * distinguir un rechazo real del backend (ej. barcode con longitud inválida ->
   * error permanente, requiere revisión manual) de una falla de red (transitoria,
   * se reintenta). Con getStorage() ese status se pierde (handleError lo envuelve en
   * un Error genérico sin `status`), por lo que TODO fallo terminaba clasificado como
   * "Sin conexión con el servidor" y la lectura quedaba reintentando para siempre.
   */
  getStorageQueued(payload: BarcodeRequest): Observable<StorageResponse> {
    return this.http.post<StorageResponse>(this.GLOBALCOUNT_STORAGE, payload);
  }

  getInsertInventory(payload: InsertInventoryRequest): Observable<InsertInventoryResponse> {
    return this.http.post<InsertInventoryResponse>(this.GLOBALCOUNT_INSERTINVENTORY, payload).pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * Igual que getInsertInventory pero SIN transformar el error.
   * La cola offline del lector necesita el HttpErrorResponse crudo (status HTTP y
   * body { ok, msg, duplicateBarcode, validationError }) para decidir si reintenta,
   * descarta (duplicado) o marca para revisión (validación).
   */
  insertInventoryQueued(payload: InsertInventoryRequest): Observable<InsertInventoryResponse> {
    return this.http.post<InsertInventoryResponse>(this.GLOBALCOUNT_INSERTINVENTORY, payload);
  }

  /**
   * Sube un archivo .sal para actualizar la preparación de la orden.
   * @param file Archivo obtenido del input type="file"
   */
  updateOrder(file: File): Observable<UpdateOrderResponse> {
    // 1. Creamos el objeto FormData
    const formData = new FormData();

    // 2. Agregamos el archivo con el nombre 'orderPreparation' que pide el backend
    formData.append('orderPreparation', file);

    // 3. Realizamos la petición POST
    return this.http.post<UpdateOrderResponse>(this.UPDATE_ORDER_ENDPOINT, formData).pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * Obtiene la última preparación de la orden (solo pendientes).
   * @returns Observable con la información de la orden y sus códigos de barras.
   */
  viewOrder(): Observable<ViewOrderResponse> {
    // 1. Realizamos la petición GET
    // No necesitamos FormData aquí ya que es una consulta simple
    return this.http.get<ViewOrderResponse>(this.VIEW_ORDER_ENDPOINT).pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * Actualiza los items de la orden.
   * @param payload Objeto con _id, code y codeRead
   * @returns Mensaje de confirmación: "barcode Actualizado correctamente"
   */
  updateOrderItems(payload: UpdateBarcodeRequest): Observable<UpdateBarcodeResponse> {
    return this.http.post<UpdateBarcodeResponse>(this.UPDATE_ORDER_ITEMS_ENDPOINT, payload).pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * Actualiza el controlador de lectura de código de barras.
   * @param payload Objeto con _id, code y codeRead
   * @returns Mensaje de confirmación: "Barcode Cambiado Correctamente"
   */
  updateBarcodeReadController(payload: UpdateBarcodeRequest): Observable<UpdateBarcodeResponse> {
    return this.http.post<UpdateBarcodeResponse>(this.UPDATE_BARCODE_READ_ENDPOINT, payload).pipe(catchError(this.handleError.bind(this)));
  }

  // ===================================================================================
  // ÓRDENES DE CARGUE (OC) -> PREALISTAMIENTO
  // ===================================================================================

  /** Permisos del usuario sobre el flujo de OC. La lista de administrativos vive solo en el backend. */
  getLoadingOrderAccess(): Observable<LoadingOrderApiResponse<LoadingOrderAccess>> {
    return this.http
      .get<LoadingOrderApiResponse<LoadingOrderAccess>>(`${this.LOADING_ORDERS_ENDPOINT}/access`)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * (Administrativo) Carga el archivo .PRN de Órdenes de Cargue del ERP.
   * Sin catchError: el componente necesita el HttpErrorResponse crudo para mostrar los errores
   * de formato por línea (400) y las OC rechazadas por duplicadas (409).
   */
  uploadLoadingOrder(file: File): Observable<LoadingOrderUploadResponse> {
    const formData = new FormData();
    formData.append('loadingOrderFile', file);
    return this.http.post<LoadingOrderUploadResponse>(`${this.LOADING_ORDERS_ENDPOINT}/upload`, formData);
  }

  /** Primera OC de la cola (FIFO). El operario no elige la OC. 404 = no hay OC pendientes. */
  getNextLoadingOrder(): Observable<LoadingOrderApiResponse<LoadingOrderView>> {
    return this.http.get<LoadingOrderApiResponse<LoadingOrderView>>(`${this.LOADING_ORDERS_ENDPOINT}/next`);
  }

  /** Detalle y avance de una OC (lecturas y auditoría opcionales). */
  getLoadingOrderDetail(payload: LoadingOrderDetailRequest): Observable<LoadingOrderApiResponse<LoadingOrderView>> {
    return this.http
      .post<LoadingOrderApiResponse<LoadingOrderView>>(`${this.LOADING_ORDERS_ENDPOINT}/detail`, payload)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /** (Administrativo) Listado / cola de OC con filtros. */
  listLoadingOrders(payload: LoadingOrderListRequest): Observable<LoadingOrderApiResponse<LoadingOrderSummary[]>> {
    return this.http
      .post<LoadingOrderApiResponse<LoadingOrderSummary[]>>(`${this.LOADING_ORDERS_ENDPOINT}/list`, payload)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /** (Administrativo) Auditoría de archivos/OC rechazados en el cargue. */
  listLoadingOrderRejections(loadingOrder?: string): Observable<LoadingOrderApiResponse<LoadingOrderRejection[]>> {
    return this.http
      .post<LoadingOrderApiResponse<LoadingOrderRejection[]>>(`${this.LOADING_ORDERS_ENDPOINT}/rejections`, loadingOrder ? { loadingOrder } : {})
      .pipe(catchError(this.handleError.bind(this)));
  }

  /** (Administrativo) Define si la OC admite cierre parcial. */
  setLoadingOrderPartialClose(payload: PartialCloseRequest): Observable<LoadingOrderApiResponse<{ _id: string; allowPartialClose: boolean }>> {
    return this.http
      .post<LoadingOrderApiResponse<{ _id: string; allowPartialClose: boolean }>>(`${this.LOADING_ORDERS_ENDPOINT}/partialClose`, payload)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /** Siguiente producto a alistar, con texto para lectura por voz. */
  getNextPickItem(loadingOrderId: string): Observable<LoadingOrderApiResponse<NextPickItemResult>> {
    return this.http
      .post<LoadingOrderApiResponse<NextPickItemResult>>(`${this.LOADING_ORDERS_ENDPOINT}/nextItem`, { loadingOrderId })
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * Lectura de un serial EAN128 (27 dígitos). Sin catchError: un rechazo de negocio llega como
   * 409 con { msg, rejectReason } y el componente lo muestra al operario.
   */
  scanLoadingOrderSerial(payload: ScanSerialRequest): Observable<ScanSerialResponse> {
    return this.http.post<ScanSerialResponse>(`${this.LOADING_ORDERS_ENDPOINT}/scan`, payload);
  }

  /** Anula una lectura de prealistamiento (motivo obligatorio; la lectura no se borra). */
  voidLoadingOrderRead(payload: VoidReadRequest): Observable<LoadingOrderApiResponse<{ readId: string; serial: string }>> {
    return this.http
      .post<LoadingOrderApiResponse<{ readId: string; serial: string }>>(`${this.LOADING_ORDERS_ENDPOINT}/voidRead`, payload)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * Cierra el prealistamiento (parcial solo si la OC lo admite, con motivo). Sin catchError:
   * un 409 trae los pendientes (`data.pending`) para mostrarlos.
   */
  completeLoadingOrderPicking(payload: CompletePickingRequest): Observable<CompletePickingResponse> {
    return this.http.post<CompletePickingResponse>(`${this.LOADING_ORDERS_ENDPOINT}/complete`, payload);
  }
}
