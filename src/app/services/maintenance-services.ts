// src/app/services/maintenance-services.ts

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  AddInterventionRequest,
  ApprovalRequest,
  ApprovalResponse,
  CreateMaintenanceRequest,
  DeleteMaintenanceResponse,
  MaintenanceListFilters,
  MaintenanceListResponse,
  MaintenanceResponse,
  SeedConsecutiveRequest,
  SeedConsecutiveResponse,
  UpdateInterventionRequest,
  UpdateMaintenanceRequest,
} from '../interfaces/maintenance.interface';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root',
})
export class MaintenanceServices {
  private http = inject(HttpClient);
  private readonly BASE_URL = environment.backendUrl;
  // El backend monta el módulo en /api/v1/maintenance (environment.api === '/api/v1').
  private readonly BASE_API = `${this.BASE_URL}${environment.api}/maintenance`;

  private readonly SEED_CONSECUTIVE_ENDPOINT = `${this.BASE_API}/consecutive/seed`;

  private handleError(error: any) {
    console.error('MaintenanceServices: Error en la petición:', error);
    let errorMessage = 'Ocurrió un error desconocido en el servicio.';
    if (error.error && error.error?.msg) {
      errorMessage = error.error.msg;
    } else if (error.message) {
      errorMessage = error.message;
    }
    return throwError(() => new Error(`Falló la consulta al backend: ${errorMessage}`));
  }

  /**
   * Inicializa el consecutivo MTTO. Debe ejecutarse UNA sola vez antes de crear
   * la primera solicitud. Use `force: true` para reinicializar uno existente.
   */
  seedConsecutive(payload: SeedConsecutiveRequest): Observable<SeedConsecutiveResponse> {
    return this.http
      .post<SeedConsecutiveResponse>(this.SEED_CONSECUTIVE_ENDPOINT, payload)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * Crea una solicitud de mantenimiento.
   * Requeridos: machineCode, maintenanceType, description.
   * El consecutivoMtto lo asigna el backend.
   */
  createMaintenance(payload: CreateMaintenanceRequest): Observable<MaintenanceResponse> {
    return this.http
      .post<MaintenanceResponse>(this.BASE_API, payload)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * Lista solicitudes de mantenimiento con filtros opcionales por query string.
   */
  listMaintenance(filters: MaintenanceListFilters = {}): Observable<MaintenanceListResponse> {
    let params = new HttpParams();
    if (filters.consecutiveMtto != null) {
      params = params.set('consecutiveMtto', String(filters.consecutiveMtto));
    }
    if (filters.status) {
      params = params.set('status', filters.status);
    }
    if (filters.machineCode) {
      params = params.set('machineCode', filters.machineCode);
    }
    if (filters.area) {
      params = params.set('area', filters.area);
    }
    if (filters.maintenanceType) {
      params = params.set('maintenanceType', filters.maintenanceType);
    }
    return this.http
      .get<MaintenanceListResponse>(this.BASE_API, { params })
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * Obtiene una solicitud de mantenimiento por id.
   */
  getMaintenanceById(id: string): Observable<MaintenanceResponse> {
    return this.http
      .get<MaintenanceResponse>(`${this.BASE_API}/${id}`)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * Actualiza la cabecera / estado de una solicitud.
   * `observation` queda registrado en el auditTrail con el estado anterior.
   */
  updateMaintenance(id: string, payload: UpdateMaintenanceRequest): Observable<MaintenanceResponse> {
    return this.http
      .put<MaintenanceResponse>(`${this.BASE_API}/${id}`, payload)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * Agrega una acción de contención (intervención) a una solicitud.
   */
  addIntervention(id: string, payload: AddInterventionRequest): Observable<MaintenanceResponse> {
    return this.http
      .post<MaintenanceResponse>(`${this.BASE_API}/${id}/interventions`, payload)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * Actualiza una acción de contención concreta de una solicitud.
   */
  updateIntervention(
    id: string,
    interventionId: string,
    payload: UpdateInterventionRequest,
  ): Observable<MaintenanceResponse> {
    return this.http
      .put<MaintenanceResponse>(`${this.BASE_API}/${id}/interventions/${interventionId}`, payload)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * Registra el Vo.Bo (visto bueno) de SUPERVISOR o SOLICITANTE.
   */
  registerApproval(id: string, payload: ApprovalRequest): Observable<ApprovalResponse> {
    return this.http
      .patch<ApprovalResponse>(`${this.BASE_API}/${id}/approval`, payload)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * Elimina (borrado lógico) una solicitud de mantenimiento.
   */
  deleteMaintenance(id: string): Observable<DeleteMaintenanceResponse> {
    return this.http
      .delete<DeleteMaintenanceResponse>(`${this.BASE_API}/${id}`)
      .pipe(catchError(this.handleError.bind(this)));
  }
}
