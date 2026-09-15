// src/app/maintenance/news-upload/news-upload.ts
//
// "Cargue de Novedad": pantalla del TÉCNICO de Mantenimiento (no del Jefe). Solo muestra las
// solicitudes donde el técnico logueado aparece en `assignees` (backend filtra por su propio
// documento del token, ver MaintenanceServices.listMaintenance({ assignedToMe: true })), y le
// permite registrar SU PROPIA intervención una sola vez. Si necesita corregirla, debe esperar
// a que el Jefe la habilite puntualmente desde "Visualizar Novedades" (editUnlocked).
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import {
  AddInterventionRequest,
  Intervention,
  MaintenancePriority,
  MaintenanceRequest,
  MaintenanceStatus,
  SparePart,
} from '../../interfaces/maintenance.interface';
import { AuthService } from '../../services/auth-services';
import { MaintenanceServices } from '../../services/maintenance-services';

interface InterventionFormModel {
  workDone: string;
  startAt: string;
  endAt: string;
  notes: string;
  otherTechnicianCodes: string;
  escalateToTechnicalDesk: boolean;
  escalationReason: string;
  spareParts: SparePart[];
}

@Component({
  selector: 'app-maintenance-news-upload',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './news-upload.html',
  styleUrl: './news-upload.scss',
})
export class NewsUpload implements OnInit {
  private authService = inject(AuthService);
  private maintenanceService = inject(MaintenanceServices);
  private toastr = inject(ToastrService);

  get myDocument(): string {
    return this.authService.userData()?.uid || '';
  }

  get myFullName(): string {
    return this.authService.userData()?.full_name || '';
  }

  orders: MaintenanceRequest[] = [];
  isLoading = false;

  selectedOrder: MaintenanceRequest | null = null;
  form: InterventionFormModel = this.buildEmptyForm();
  isSaving = false;
  /** true mientras el técnico está corrigiendo una intervención ya registrada (editUnlocked). */
  isEditing = false;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.isLoading = true;
    this.maintenanceService.listMaintenance({ assignedToMe: true }).subscribe({
      next: (res) => {
        this.orders = res?.ok && res.data ? res.data : [];
        if (this.selectedOrder) {
          this.selectedOrder = this.orders.find((o) => o.id === this.selectedOrder!.id) || null;
        }
      },
      error: (err: Error) => {
        this.orders = [];
        this.toastr.error(err.message || 'No se pudieron cargar tus novedades asignadas.', 'Error');
      },
      complete: () => (this.isLoading = false),
    });
  }

  select(order: MaintenanceRequest): void {
    this.selectedOrder = order;
    this.form = this.buildEmptyForm();
    this.isEditing = false;
  }

  closeDetail(): void {
    this.selectedOrder = null;
    this.form = this.buildEmptyForm();
    this.isEditing = false;
  }

  /** Mi propia intervención dentro de la solicitud seleccionada (si ya la registré). */
  get myIntervention(): Intervention | null {
    if (!this.selectedOrder) return null;
    const doc = this.myDocument;
    return this.selectedOrder.interventions.find((i) => i.technicianCodes?.includes(doc)) || null;
  }

  get canEditMyIntervention(): boolean {
    return !!this.myIntervention?.editUnlocked;
  }

  startEdit(): void {
    const it = this.myIntervention;
    if (!it) return;
    this.form = {
      workDone: it.workDone || '',
      startAt: this.toDatetimeLocal(it.startAt),
      endAt: this.toDatetimeLocal(it.endAt),
      notes: it.notes || '',
      otherTechnicianCodes: (it.technicianCodes || []).filter((c) => c !== this.myDocument).join(', '),
      escalateToTechnicalDesk: it.escalateToTechnicalDesk,
      escalationReason: it.escalationReason || '',
      spareParts: it.spareParts ? it.spareParts.map((sp) => ({ ...sp })) : [],
    };
    this.isEditing = true;
  }

  cancelEdit(): void {
    this.form = this.buildEmptyForm();
    this.isEditing = false;
  }

  addSparePartRow(): void {
    this.form.spareParts.push({ code: '', description: '', quantity: 1 });
  }

  removeSparePartRow(index: number): void {
    this.form.spareParts.splice(index, 1);
  }

  submit(): void {
    if (!this.selectedOrder) return;

    const workDone = this.form.workDone.trim();
    if (!workDone) {
      this.toastr.warning('Describa el trabajo realizado.', 'Atención');
      return;
    }
    if (this.form.escalateToTechnicalDesk && !this.form.escalationReason.trim()) {
      this.toastr.warning('Indique el motivo para escalar a mesa técnica.', 'Atención');
      return;
    }

    const technicianCodes = [
      this.myDocument,
      ...this.form.otherTechnicianCodes
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
    ].filter(Boolean);

    const payload: AddInterventionRequest = {
      technicianCodes,
      workDone,
      startAt: this.form.startAt ? this.toBackendDateTime(this.form.startAt) : '',
      endAt: this.form.endAt ? this.toBackendDateTime(this.form.endAt) : '',
      notes: this.form.notes.trim(),
      spareParts: this.form.spareParts.filter((sp) => sp.description?.trim()),
      escalateToTechnicalDesk: this.form.escalateToTechnicalDesk,
      escalationReason: this.form.escalationReason.trim(),
    };

    const existing = this.myIntervention;
    const request$ = existing
      ? this.maintenanceService.updateIntervention(this.selectedOrder.id, existing.id, payload)
      : this.maintenanceService.addIntervention(this.selectedOrder.id, payload);

    this.isSaving = true;
    request$.subscribe({
      next: (res) => {
        if (!res?.ok) {
          this.toastr.error(res?.msg || 'No se pudo guardar la intervención.', 'Error');
          return;
        }
        this.toastr.success(existing ? 'Corrección guardada.' : 'Intervención registrada.', 'Mantenimiento');
        this.selectedOrder = res.data;
        this.replaceInList(res.data);
        this.form = this.buildEmptyForm();
        this.isEditing = false;
      },
      error: (err: Error) => this.toastr.error(err.message || 'Error al guardar la intervención.', 'Error'),
      complete: () => (this.isSaving = false),
    });
  }

  statusClass(status: MaintenanceStatus): string {
    switch (status) {
      case 'PENDIENTE':
        return 'badge bg-secondary';
      case 'EN_PROCESO':
        return 'badge bg-info text-dark';
      case 'COMPLETADO':
        return 'badge bg-success';
      case 'CANCELADO':
        return 'badge bg-danger';
      default:
        return 'badge bg-light text-dark';
    }
  }

  priorityClass(priority: MaintenancePriority): string {
    switch (priority) {
      case 'BAJA':
        return 'badge bg-light text-dark';
      case 'MEDIA':
        return 'badge bg-primary';
      case 'ALTA':
        return 'badge bg-warning text-dark';
      case 'CRITICA':
        return 'badge bg-danger';
      default:
        return 'badge bg-light text-dark';
    }
  }

  private replaceInList(updated: MaintenanceRequest): void {
    const idx = this.orders.findIndex((o) => o.id === updated.id);
    if (idx >= 0) this.orders[idx] = updated;
  }

  private buildEmptyForm(): InterventionFormModel {
    return {
      workDone: '',
      startAt: '',
      endAt: '',
      notes: '',
      otherTechnicianCodes: '',
      escalateToTechnicalDesk: false,
      escalationReason: '',
      spareParts: [],
    };
  }

  /** Convierte 'dd/MM/yyyy, HH:mm:ss' (backend) a datetime-local 'yyyy-MM-ddTHH:mm'. */
  private toDatetimeLocal(value: string): string {
    if (!value) return '';
    const [datePart, timePart] = value.split(',').map((p) => p.trim());
    if (!datePart) return '';
    const [day, month, year] = datePart.split('/');
    const time = (timePart || '00:00:00').slice(0, 5);
    return `${year}-${month}-${day}T${time}`;
  }

  /** Convierte un datetime-local (yyyy-MM-ddTHH:mm) a 'dd/MM/yyyy, HH:mm:ss'. */
  private toBackendDateTime(value: string): string {
    const [datePart, timePart] = value.split('T');
    const [year, month, day] = datePart.split('-');
    const time = timePart ? `${timePart}:00`.slice(0, 8) : '00:00:00';
    return `${day}/${month}/${year}, ${time}`;
  }
}
