// src/app/services/maintenance-draft-service.ts
import { Injectable } from '@angular/core';

/**
 * Datos de una novedad (productionNews) para prellenar el formulario de creación
 * de una solicitud de mantenimiento (SMA54001).
 */
export interface MaintenanceDraft {
  sourceNewsId: string;
  /** Referencia/categoría de la novedad de origen, solo para el aviso informativo del form. */
  sourceReference?: string;
  sourceCategory?: string;
  machineArea: string;
  machineDepartment: string;
  machineCode: string;
  machineName: string;
  description: string;
  requestedBy: string;
  /** Formato backend 'DD/MM/YYYY, HH:mm:ss'. */
  reportedAt: string;
}

/**
 * Puente en memoria entre "Visualizar Novedades" y "Novedades Mantenimiento": permite
 * abrir el formulario de creación ya prellenado con los datos de una novedad, sin
 * depender de querystring ni de un endpoint nuevo.
 */
@Injectable({
  providedIn: 'root',
})
export class MaintenanceDraftService {
  private draft: MaintenanceDraft | null = null;

  setDraft(draft: MaintenanceDraft): void {
    this.draft = draft;
  }

  /** Devuelve el borrador pendiente (si hay) y lo limpia, para que no se reaplique dos veces. */
  consumeDraft(): MaintenanceDraft | null {
    const draft = this.draft;
    this.draft = null;
    return draft;
  }
}
