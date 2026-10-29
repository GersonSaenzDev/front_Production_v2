// src/app/services/rh-staff-services.ts

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import {
  ActiveStaff,
  ActiveStaffResponse,
  MaintenanceTechnician,
} from '../interfaces/rh-staff.interface';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root',
})
export class RhStaffServices {
  private http = inject(HttpClient);
  private readonly BASE_URL = environment.backendUrlRH;
  // El backend de RH monta el módulo staff en /api/v1/staff (environment.api === '/api/v1').
  private readonly STAFF_API = `${this.BASE_URL}${environment.api}/staff`;
  private readonly ACTIVE_STAFF_ENDPOINT = `${this.STAFF_API}/activeStaff`;
  private readonly BY_DEPARTMENT_ENDPOINT = `${this.STAFF_API}/byDepartment`;

  /** Término para identificar al personal de mantenimiento por área/departamento. */
  private readonly MAINTENANCE_KEYWORD = 'MANTENIMIENTO';
  /** Término para identificar al personal de Mecánica (departamento MECANICA). */
  private readonly MECHANICS_KEYWORD = 'MECANICA';

  private handleError(error: any) {
    console.error('RhStaffServices: Error en la petición:', error);
    let errorMessage = 'Ocurrió un error desconocido en el servicio.';
    if (error.error && error.error?.msg) {
      errorMessage = error.error.msg;
    } else if (error.message) {
      errorMessage = error.message;
    }
    return throwError(() => new Error(`Falló la consulta al backend de RH: ${errorMessage}`));
  }

  /** Personal activo completo (RH/Biometrics). */
  getActiveStaff(): Observable<ActiveStaffResponse> {
    return this.http
      .get<ActiveStaffResponse>(this.ACTIVE_STAFF_ENDPOINT)
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * Personal activo filtrado en el servidor por departamento y/o área
   * (coincidencia parcial, sin distinguir mayúsculas).
   */
  getStaffByDepartment(departament?: string, area?: string): Observable<ActiveStaffResponse> {
    let params = new HttpParams();
    if (departament) params = params.set('departament', departament);
    if (area) params = params.set('area', area);
    return this.http
      .get<ActiveStaffResponse>(this.BY_DEPARTMENT_ENDPOINT, { params })
      .pipe(catchError(this.handleError.bind(this)));
  }

  /**
   * Técnicos de mantenimiento con su especialidad (jobTitle/position).
   * Intenta el endpoint dedicado (/byDepartment); si falla o llega vacío,
   * cae a /activeStaff y filtra en el cliente. Así funciona aunque el
   * endpoint dedicado aún no esté desplegado en el backend de RH.
   */
  getMaintenanceTechnicians(): Observable<MaintenanceTechnician[]> {
    return this.getTechniciansByKeyword(this.MAINTENANCE_KEYWORD);
  }

  /**
   * Personal de Mecánica (mecánicos y auxiliares) con su especialidad. Mismo mecanismo y
   * fallback que getMaintenanceTechnicians.
   */
  getMechanicsTechnicians(): Observable<MaintenanceTechnician[]> {
    return this.getTechniciansByKeyword(this.MECHANICS_KEYWORD);
  }

  private getTechniciansByKeyword(keyword: string): Observable<MaintenanceTechnician[]> {
    return this.getStaffByDepartment(keyword, keyword).pipe(
      map((res) => (res?.ok && res.data ? res.data : [])),
      catchError(() => of([] as ActiveStaff[])),
      switchMap((list) => (list.length ? of(list) : this.keywordFromActiveStaff(keyword))),
      map((list) => list.map((s) => this.toTechnician(s))),
    );
  }

  /** Fallback: trae el personal activo completo y filtra por área/departamento (solo Activo) en el cliente. */
  private keywordFromActiveStaff(keyword: string): Observable<ActiveStaff[]> {
    return this.getActiveStaff().pipe(
      map((res) => {
        const list = res?.ok && res.data ? res.data : [];
        return list.filter((s) => this.matchesKeyword(s, keyword) && this.isActive(s));
      }),
      catchError(() => of([] as ActiveStaff[])),
    );
  }

  private isActive(staff: ActiveStaff): boolean {
    // Si el backend no envía el estado, no descartamos (el endpoint ya excluye retiro/renuncia).
    return !staff.CurrentEmployeeStatus || staff.CurrentEmployeeStatus === 'Activo';
  }

  private matchesKeyword(staff: ActiveStaff, keyword: string): boolean {
    // Sin tildes: RH puede tener "MECÁNICA" o "MECANICA".
    const norm = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const kw = norm(keyword);
    const area = norm(staff.staffAssignment?.area || '');
    const dept = norm(staff.staffAssignment?.departament || '');
    return area.includes(kw) || dept.includes(kw);
  }

  private toTechnician(staff: ActiveStaff): MaintenanceTechnician {
    const assignment = staff.staffAssignment || {};
    // La especialidad real está en `position` (ej. ELECTRICO 2, PLOMERO).
    // `jobTitle` suele ser genérico ("EMPLEADO"), así que lo ignoramos como especialidad.
    const position = (assignment.position || '').trim();
    const jobTitle = (assignment.jobTitle || '').trim();
    const specialty =
      position || (jobTitle.toLowerCase() === 'empleado' ? '' : jobTitle) || 'Sin especialidad';
    return {
      document: staff.document,
      fullName: staff.full_name,
      specialty,
      area: assignment.area || '',
      departament: assignment.departament || '',
      isAssistant: /AUXILIAR/i.test(`${position} ${jobTitle}`),
    };
  }
}
