// src/app/services/mechanics-services.ts

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  ApprovalRequest,
  DeleteMaintenanceResponse,
  RequesterEvaluationRequest,
  RequesterPendingResponse
} from '../interfaces/maintenance.interface';
import {
  CreateMechanicsRequest,
  MechanicsInterventionInput,
  MechanicsListFilters,
  MechanicsListResponse,
  MechanicsRequest,
  MechanicsResponse,
  MechanicsUpdateInterventionRequest,
  UpdateMechanicsRequest
} from '../interfaces/mechanics.interface';
import { environment } from 'src/environments/environment';

/**
 * Solicitudes de Mecánica (SME55003). Mismo contrato que MaintenanceServices: el backend
 * comparte el ciclo de la orden de trabajo entre ambas áreas.
 */
@Injectable({
  providedIn: 'root'
})
export class MechanicsServices {
  private http = inject(HttpClient);
  private readonly BASE_URL = environment.backendUrl;
  // El backend monta el módulo en /api/v1/mechanics (environment.api === '/api/v1').
  private readonly BASE_API = `${this.BASE_URL}${environment.api}/mechanics`;

  private handleError(error: { error?: { msg?: string }; message?: string }) {
    console.error('MechanicsServices: Error en la petición:', error);
    let errorMessage = 'Ocurrió un error desconocido en el servicio.';
    if (error.error && error.error?.msg) {
      errorMessage = error.error.msg;
    } else if (error.message) {
      errorMessage = error.message;
    }
    return throwError(() => new Error(`Falló la consulta al backend: ${errorMessage}`));
  }

  /** Crea una solicitud de mecánica. Requeridos: area, department, description. */
  createMechanics(payload: CreateMechanicsRequest): Observable<MechanicsResponse> {
    return this.http.post<MechanicsResponse>(this.BASE_API, payload).pipe(catchError(this.handleError.bind(this)));
  }

  /** Lista solicitudes con filtros opcionales por query string. */
  listMechanics(filters: MechanicsListFilters = {}): Observable<MechanicsListResponse> {
    let params = new HttpParams();
    if (filters.consecutiveSme) params = params.set('consecutiveSme', filters.consecutiveSme);
    if (filters.status) params = params.set('status', filters.status);
    if (filters.area) params = params.set('area', filters.area);
    if (filters.assignedToMe) params = params.set('assignedToMe', 'true');
    return this.http.get<MechanicsListResponse>(this.BASE_API, { params }).pipe(catchError(this.handleError.bind(this)));
  }

  getMechanicsById(id: string): Observable<MechanicsResponse> {
    return this.http.get<MechanicsResponse>(`${this.BASE_API}/${id}`).pipe(catchError(this.handleError.bind(this)));
  }

  /** Actualiza cabecera / estado. `observation` queda en el auditTrail con el estado anterior. */
  updateMechanics(id: string, payload: UpdateMechanicsRequest): Observable<MechanicsResponse> {
    return this.http.put<MechanicsResponse>(`${this.BASE_API}/${id}`, payload).pipe(catchError(this.handleError.bind(this)));
  }

  addIntervention(id: string, payload: MechanicsInterventionInput): Observable<MechanicsResponse> {
    return this.http.post<MechanicsResponse>(`${this.BASE_API}/${id}/interventions`, payload).pipe(catchError(this.handleError.bind(this)));
  }

  updateIntervention(id: string, interventionId: string, payload: MechanicsUpdateInterventionRequest): Observable<MechanicsResponse> {
    return this.http
      .put<MechanicsResponse>(`${this.BASE_API}/${id}/interventions/${interventionId}`, payload)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /** Habilita puntualmente (Jefe de Mecánica) que el técnico corrija una intervención ya registrada. */
  unlockInterventionEdit(id: string, interventionId: string): Observable<MechanicsResponse> {
    return this.http
      .patch<MechanicsResponse>(`${this.BASE_API}/${id}/interventions/${interventionId}/unlock-edit`, {})
      .pipe(catchError(this.handleError.bind(this)));
  }

  registerApproval(id: string, payload: ApprovalRequest): Observable<MechanicsResponse> {
    return this.http.patch<MechanicsResponse>(`${this.BASE_API}/${id}/approval`, payload).pipe(catchError(this.handleError.bind(this)));
  }

  /** El solicitante acepta y evalúa (1-5 + comentario). Calificación 1 reabre la solicitud. */
  evaluateByRequester(id: string, payload: RequesterEvaluationRequest): Observable<MechanicsResponse> {
    return this.http
      .post<MechanicsResponse>(`${this.BASE_API}/${id}/requester-evaluation`, payload)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /** Intervenciones esperando aceptación: las del usuario (mine) y las de su área (`scope`). */
  getRequesterPending(scope?: string): Observable<RequesterPendingResponse<MechanicsRequest>> {
    let params = new HttpParams();
    if (scope) params = params.set('scope', scope);
    return this.http
      .get<RequesterPendingResponse<MechanicsRequest>>(`${this.BASE_API}/requester/pending`, { params })
      .pipe(catchError(this.handleError.bind(this)));
  }

  deleteMechanics(id: string): Observable<DeleteMaintenanceResponse> {
    return this.http.delete<DeleteMaintenanceResponse>(`${this.BASE_API}/${id}`).pipe(catchError(this.handleError.bind(this)));
  }
}
