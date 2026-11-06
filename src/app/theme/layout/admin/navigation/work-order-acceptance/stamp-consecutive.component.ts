import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { Observable } from 'rxjs';
import { StampArea, StampCounterResponse, StampCounterStatus } from '../../../../../interfaces/maintenance.interface';
import { MaintenanceServices } from '../../../../../services/maintenance-services';
import { MechanicsServices } from '../../../../../services/mechanics-services';

/**
 * Campo "Consecutivo Summum" de los formularios de creación de Mantenimiento y Mecánica.
 *
 * Reemplaza el sello fechero manual: el número lo asigna el SERVIDOR al guardar (atómico, nunca
 * se repite). Aquí solo se muestra el próximo número de referencia y, al Jefe del área, un panel
 * para fijar el último número usado (arranque o corrección), con motivo auditable.
 */
@Component({
  selector: 'app-stamp-consecutive',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './stamp-consecutive.component.html',
  styleUrl: './stamp-consecutive.component.scss',
})
export class StampConsecutiveComponent implements OnInit {
  private maintenanceService = inject(MaintenanceServices);
  private mechanicsService = inject(MechanicsServices);
  private toastr = inject(ToastrService);

  /** Área dueña del contador. */
  @Input({ required: true }) serviceArea!: StampArea;
  /** Etiqueta del campo en el formulario. */
  @Input() label = 'Consecutivo Summum';

  status: StampCounterStatus | null = null;
  loading = false;
  loadError = false;

  /** Panel de ajuste (solo Jefe). */
  adjustOpen = false;
  adjustValue: number | null = null;
  adjustReason = '';
  saving = false;

  ngOnInit(): void {
    this.load();
  }

  /** Recarga el estado (lo llama el formulario tras crear una solicitud). */
  load(): void {
    this.loading = true;
    this.loadError = false;
    this.request$().subscribe({
      next: (res) => {
        this.loading = false;
        this.status = res.ok ? res.data : null;
        this.loadError = !res.ok;
      },
      error: () => {
        this.loading = false;
        this.loadError = true;
      },
    });
  }

  toggleAdjust(): void {
    this.adjustOpen = !this.adjustOpen;
    if (this.adjustOpen) {
      this.adjustValue = this.status?.lastUsed ?? null;
      this.adjustReason = '';
    }
  }

  get adjustPreview(): string {
    const v = this.adjustValue;
    return Number.isInteger(v) && (v as number) >= 0 ? String((v as number) + 1).padStart(10, '0') : '—';
  }

  /** El nuevo valor es menor al actual (los números ya entregados se saltan en el servidor). */
  get isLowering(): boolean {
    const current = this.status?.lastUsed;
    const v = this.adjustValue;
    return !!this.status?.configured && typeof current === 'number' && typeof v === 'number' && v < current;
  }

  get canSaveAdjust(): boolean {
    const v = this.adjustValue;
    return (
      !this.saving &&
      Number.isInteger(v) &&
      (v as number) >= 0 &&
      v !== this.status?.lastUsed &&
      this.adjustReason.trim().length >= 5
    );
  }

  saveAdjust(): void {
    if (!this.canSaveAdjust) return;
    this.saving = true;
    const service = this.serviceArea === 'SME' ? this.mechanicsService : this.maintenanceService;
    service.setStampCounter(this.adjustValue as number, this.adjustReason.trim()).subscribe({
      next: (res) => {
        this.saving = false;
        if (!res.ok) {
          this.toastr.error(res.msg || 'No se pudo ajustar el consecutivo.', 'Consecutivo');
          return;
        }
        this.status = res.data;
        this.adjustOpen = false;
        this.toastr.success(res.msg || 'Consecutivo actualizado.', 'Consecutivo');
      },
      error: (err: Error) => {
        this.saving = false;
        this.toastr.error(err.message || 'No se pudo ajustar el consecutivo.', 'Consecutivo');
      },
    });
  }

  private request$(): Observable<StampCounterResponse> {
    return this.serviceArea === 'SME' ? this.mechanicsService.getStampCounter() : this.maintenanceService.getStampCounter();
  }
}
