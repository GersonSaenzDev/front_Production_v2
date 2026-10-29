// src/app/services/mechanics-draft-service.ts
import { Injectable } from '@angular/core';

/**
 * Datos de una novedad (productionNews) para prellenar la Solicitud de Mecánica (SME55003).
 */
export interface MechanicsDraft {
  sourceNewsId: string;
  /** Referencia/categoría de la novedad de origen, solo para el aviso informativo del form. */
  sourceReference?: string;
  sourceCategory?: string;
  area: string;
  department: string;
  machineCode: string;
  machineName: string;
  description: string;
  requestedBy: string;
  /** Formato backend 'DD/MM/YYYY, HH:mm:ss'. */
  reportedAt: string;
}

/**
 * Puente en memoria entre "Gestión de Solicitudes" y "Solicitud Herramental (SME)": abre el
 * formulario ya prellenado con los datos de una novedad (mismo patrón que MaintenanceDraftService).
 */
@Injectable({
  providedIn: 'root'
})
export class MechanicsDraftService {
  private draft: MechanicsDraft | null = null;

  setDraft(draft: MechanicsDraft): void {
    this.draft = draft;
  }

  /** Devuelve el borrador pendiente (si hay) y lo limpia, para que no se reaplique dos veces. */
  consumeDraft(): MechanicsDraft | null {
    const draft = this.draft;
    this.draft = null;
    return draft;
  }
}
