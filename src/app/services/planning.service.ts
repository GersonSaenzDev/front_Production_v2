// src/app/services/planning.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import {
  MonthlyPlanningPayload,
  MonthlyPlanningResponse,
  WeeklyPlanningPayload,
  WeeklyPlanningResponse,
  PlanningDayResponse
} from '../interfaces/planning.interface';

@Injectable({
  providedIn: 'root'
})
export class PlanningService {
  private http = inject(HttpClient);
  private readonly BASE_URL = environment.backendUrl;
  private readonly BASE_API = environment.api;
  private readonly MONTHLY_ENDPOINT = `${this.BASE_URL}${this.BASE_API}/plannig/monthly`;
  private readonly WEEKLY_ENDPOINT = `${this.BASE_URL}${this.BASE_API}/plannig/weekly`;
  private readonly DAY_ENDPOINT = `${this.BASE_URL}${this.BASE_API}/plannig/day`;

  // El header `x-token` lo agrega automáticamente el authInterceptor para
  // cualquier petición al backend, por lo que no se setea manualmente aquí.

  private handleError(error: any) {
    // Error de negocio: el backend respondió con el contrato { ok: false, msg }.
    if (error?.error?.msg) {
      return throwError(() => new Error(error.error.msg));
    }
    // Error de transporte / servidor caído / desconocido.
    const fallback = error?.message || 'Ocurrió un error desconocido en el servicio.';
    return throwError(() => new Error(`Falló la consulta al backend: ${fallback}`));
  }

  /**
   * @description Carga la planeación mensual desde un archivo Excel (POST /plannig/monthly).
   * @param {MonthlyPlanningPayload} payload - Archivo y metadatos del mes a planear.
   * @returns {Observable<MonthlyPlanningResponse>}
   */
  uploadMonthlyPlanning(payload: MonthlyPlanningPayload): Observable<MonthlyPlanningResponse> {
    const formData = new FormData();
    formData.append('planningFile', payload.planningFile);
    formData.append('planningMonth', payload.planningMonth);
    formData.append('planningYear', payload.planningYear);
    formData.append('planningLabel', payload.planningLabel);

    return this.http
      .post<MonthlyPlanningResponse>(this.MONTHLY_ENDPOINT, formData)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * @description Ejecuta el ajuste semanal de la planeación desde un archivo Excel (POST /plannig/weekly).
   * @param {WeeklyPlanningPayload} payload - Archivo, rango de semana y metadatos del ajuste.
   * @returns {Observable<WeeklyPlanningResponse>}
   */
  uploadWeeklyPlanning(payload: WeeklyPlanningPayload): Observable<WeeklyPlanningResponse> {
    const formData = new FormData();
    formData.append('planningFile', payload.planningFile);
    formData.append('planningMonth', payload.planningMonth);
    formData.append('planningYear', payload.planningYear);
    formData.append('weekStart', payload.weekStart);
    formData.append('weekEnd', payload.weekEnd);
    formData.append('observation', payload.observation);
    formData.append('planningLabel', payload.planningLabel);

    return this.http
      .post<WeeklyPlanningResponse>(this.WEEKLY_ENDPOINT, formData)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * @description Obtiene la planeación de un día específico (GET /plannig/day).
   * @param {string} date - Fecha en formato 'YYYY-MM-DD'.
   * @returns {Observable<PlanningDayResponse>}
   */
  getPlanningByDay(date: string): Observable<PlanningDayResponse> {
    const body = { date };
    return this.http
      .post<PlanningDayResponse>(this.DAY_ENDPOINT, body)
      .pipe(catchError(this.handleError.bind(this)));
  }
}
