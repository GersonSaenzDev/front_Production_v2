// src/app/services/dashInventory-services.ts

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AreaCountResponse, AuditNoteRequest, AuditNoteResponse, BarcodeRequest, ConfirmedCountResponse, DuplicatesResponse, GlobalCountResponse, InsertInventoryRequest, InsertInventoryResponse, NotCompliantResponse, SeeGroupsResponse, StorageResponse, TeamCountResponse, TeamItemsResponse, ViewInventoriesResponse } from '../interfaces/dashInventory.interface';
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

  private handleError(error: any) {
    console.error('DashInventoryServices: Error en la petición:', error);
    let errorMessage = 'Ocurrió un error desconocido en el servicio.';
    if (error.error && error.er?.msg) {
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
    return this.http.post<SeeGroupsResponse>(this.SEE_GROUPS_ENDPOINT, body)
      .pipe(
        catchError(this.handleError.bind(this))
      );
  }

  /**
   * Obtiene el conteo confirmado para una fecha dada.
   * @param date Fecha en formato 'DD/MM/YYYY'
   */
  getConfirmedCount(date: string): Observable<ConfirmedCountResponse> {
    const body = { date };
    return this.http.post<ConfirmedCountResponse>(this.CONFIRMED_COUNT_ENDPOINT, body)
      .pipe(
        catchError(this.handleError.bind(this))
      );
  }

  /**
   * Obtiene los códigos duplicados para una fecha dada.
   * @param date Fecha en formato 'DD/MM/YYYY'
   */
  getDuplicates(date: string): Observable<DuplicatesResponse> {
    const body = { date };
    return this.http.post<DuplicatesResponse>(this.DUPLICATES_ENDPOINT, body)
      .pipe(
        catchError(this.handleError.bind(this))
      );
  }

  /**
   * Obtiene los códigos duplicados para una fecha dada.
   * @param date Fecha en formato 'DD/MM/YYYY'
   */
  getCountGlobal(date: string): Observable<GlobalCountResponse> {
    const body = { date };
    return this.http.post<GlobalCountResponse>(this.GLOBALCOUNT_ENDPOINT, body)
      .pipe(
        catchError(this.handleError.bind(this))
    );
  }

  /**
   * Obtiene los códigos duplicados para una fecha dada.
   * @param date Fecha en formato 'DD/MM/YYYY'
   */
  getTeamCount(date: string): Observable<TeamCountResponse> {
    const body = { date };
    return this.http.post<TeamCountResponse>(this.GLOBALCOUNT_TEAMCOUNT, body)
      .pipe(
        catchError(this.handleError.bind(this))
    );
  }

  /**
   * Obtiene los códigos duplicados para una fecha dada.
   * @param date Fecha en formato 'DD/MM/YYYY'
   */
  getAreaCount(date: string): Observable<AreaCountResponse> {
    const body = { date };
    return this.http.post<AreaCountResponse>(this.GLOBALCOUNT_AREACOUNT, body)
      .pipe(
        catchError(this.handleError.bind(this))
    );
  }
  
  /**
   * Obtiene los códigos duplicados para una fecha dada.
   * @param date Fecha en formato 'DD/MM/YYYY'
   */
  getViewInventories(date: string): Observable<ViewInventoriesResponse> {
    const body = { date };
    return this.http.post<ViewInventoriesResponse>(this.GLOBALCOUNT_VIEWINVENTORIES, body)
      .pipe(
        catchError(this.handleError.bind(this))
    );
  }

  /**
 * Obtiene items agregados por equipo (area, total, codes[])
 * body: { date, teamKey }
 */
  getTeamItems(date: string, payload: { teamKey: string }): Observable<TeamItemsResponse> {
    const body = { date, ...payload };
    return this.http.post<TeamItemsResponse>(this.GLOBALCOUNT_TEAMITEMS, body)
      .pipe(
      catchError(this.handleError.bind(this))
    );
  }

  getNotCompliant(date: string, payload: { teamKey: string }): Observable<NotCompliantResponse> {
    const body = { date, ...payload };
    return this.http.post<NotCompliantResponse>(this.GLOBALCOUNT_NOTCOMPLIANT, body)
      .pipe(
        catchError(this.handleError.bind(this))
      );
  }

  getAuditNote(payload: AuditNoteRequest): Observable<AuditNoteResponse> {
    return this.http.post<AuditNoteResponse>(this.GLOBALCOUNT_AUDITNOTE, payload)
      .pipe(
        catchError(this.handleError.bind(this))
      );
  }

  getStorage(payload: BarcodeRequest): Observable<StorageResponse> {
    return this.http.post<StorageResponse>(this.GLOBALCOUNT_STORAGE, payload)
      .pipe(
        catchError(this.handleError.bind(this))
      );
  }

  getInsertInventory(payload: InsertInventoryRequest): Observable<InsertInventoryResponse> {
    return this.http.post<InsertInventoryResponse>(this.GLOBALCOUNT_INSERTINVENTORY, payload)
      .pipe(
        catchError(this.handleError.bind(this))
      );
  }

}