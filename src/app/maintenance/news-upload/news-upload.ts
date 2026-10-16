// src/app/maintenance/news-upload/news-upload.ts
//
// "Cargue de Novedad": pantalla del TÉCNICO de Mantenimiento (no del Jefe). Muestra las
// solicitudes donde el técnico logueado aparece en `assignees` o en las que participó como
// AYUDANTE (backend filtra por su propio documento del token, ver
// MaintenanceServices.listMaintenance({ assignedToMe: true })).
//
// - Puede registrar VARIAS sesiones de trabajo (reparaciones de varios días/momentos).
// - Puede vincular 1 ayudante (Auxiliar de Mantenimiento) por nombre o documento: el backend
//   guarda un registro por persona con el mismo tiempo y actividad.
// - Una sesión ya registrada solo se corrige si el Jefe la habilita desde "Visualizar
//   Novedades" (editUnlocked); el permiso se consume al guardar.
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
  PersonRef,
  SparePart,
  UpdateInterventionRequest
} from '../../interfaces/maintenance.interface';
import { MaintenanceTechnician } from '../../interfaces/rh-staff.interface';
import { AuthService } from '../../services/auth-services';
import { MaintenanceServices } from '../../services/maintenance-services';
import { RhStaffServices } from '../../services/rh-staff-services';
import { calculateMinutes, formatMinutes, toBackendDateTime, toDatetimeLocal } from '../maintenance-time.util';

interface InterventionFormModel {
  workDone: string;
  startAt: string;
  endAt: string;
  notes: string;
  helper: PersonRef | null;
  escalateToTechnicalDesk: boolean;
  escalationReason: string;
  spareParts: SparePart[];
}

@Component({
  selector: 'app-maintenance-news-upload',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './news-upload.html',
  styleUrl: './news-upload.scss'
})
export class NewsUpload implements OnInit {
  private authService = inject(AuthService);
  private maintenanceService = inject(MaintenanceServices);
  private rhStaffService = inject(RhStaffServices);
  private toastr = inject(ToastrService);

  get myDocument(): string {
    return this.authService.userData()?.uid || '';
  }

  get myFullName(): string {
    return this.authService.userData()?.full_name || '';
  }

  readonly formatMinutes = formatMinutes;

  orders: MaintenanceRequest[] = [];
  isLoading = false;

  selectedOrder: MaintenanceRequest | null = null;
  isLoadingOrder = false;
  form: InterventionFormModel = this.buildEmptyForm();
  isSaving = false;
  /** Sesión (registro RESPONSABLE propio) que se está corrigiendo con permiso del Jefe. */
  editingIntervention: Intervention | null = null;
  showForm = false;

  // Ayudante: buscador predictivo por nombre o documento (solo Auxiliares de Mantenimiento).
  private staff: MaintenanceTechnician[] = [];
  helperSearchTerm = '';
  helperResults: MaintenanceTechnician[] = [];
  showHelperDropdown = false;
  private isSelectingHelper = false;

  ngOnInit(): void {
    this.load();
    this.rhStaffService.getMaintenanceTechnicians().subscribe({
      next: (list) => (this.staff = list),
      error: (err) => console.error('Error cargando personal de mantenimiento:', err)
    });
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
      complete: () => (this.isLoading = false)
    });
  }

  /** Selecciona la solicitud y la vuelve a consultar: así ve al instante si el Jefe habilitó una corrección. */
  select(order: MaintenanceRequest): void {
    this.selectedOrder = order;
    this.resetForm();
    this.isLoadingOrder = true;
    this.maintenanceService.getMaintenanceById(order.id).subscribe({
      next: (res) => {
        if (res?.ok && res.data && this.selectedOrder?.id === order.id) {
          this.selectedOrder = res.data;
          this.replaceInList(res.data);
        }
      },
      error: (err: Error) => console.error('Error refrescando la solicitud:', err),
      complete: () => (this.isLoadingOrder = false)
    });
  }

  closeDetail(): void {
    this.selectedOrder = null;
    this.resetForm();
  }

  /** Soy técnico asignado (puedo registrar sesiones); si solo fui ayudante, es de consulta. */
  get isAssignee(): boolean {
    return !!this.selectedOrder?.assignees?.some((a) => a.document === this.myDocument);
  }

  /** Mis registros (como responsable o ayudante) en la solicitud seleccionada, en orden de registro. */
  get mySessions(): Intervention[] {
    if (!this.selectedOrder) return [];
    const doc = this.myDocument;
    return this.selectedOrder.interventions.filter((i) => i.technicianCodes?.includes(doc));
  }

  get myTotalMinutes(): number {
    return this.mySessions.reduce((sum, i) => sum + (i.durationMinutes || 0), 0);
  }

  /** Solo el registro propio como RESPONSABLE se corrige; el del ayudante se replica solo. */
  canCorrect(it: Intervention): boolean {
    return it.role !== 'AYUDANTE' && it.editUnlocked;
  }

  /** Ayudante vinculado previamente por mí en esta solicitud (para precargarlo). */
  private get myLinkedHelper(): PersonRef | null {
    const me = this.selectedOrder?.assignees?.find((a) => a.document === this.myDocument);
    return me?.helper?.document ? { document: me.helper.document, fullName: me.helper.fullName } : null;
  }

  startNew(): void {
    this.form = this.buildEmptyForm();
    this.form.helper = this.myLinkedHelper;
    this.editingIntervention = null;
    this.showForm = true;
  }

  startEdit(it: Intervention): void {
    this.form = {
      workDone: it.workDone || '',
      startAt: toDatetimeLocal(it.startAt),
      endAt: toDatetimeLocal(it.endAt),
      notes: it.notes || '',
      helper: it.helper?.document ? { ...it.helper } : null,
      escalateToTechnicalDesk: it.escalateToTechnicalDesk,
      escalationReason: it.escalationReason || '',
      spareParts: it.spareParts ? it.spareParts.map((sp) => ({ ...sp })) : []
    };
    this.editingIntervention = it;
    this.showForm = true;
  }

  cancelForm(): void {
    this.resetForm();
  }

  /** Minutos calculados en vivo para mostrar antes de guardar. */
  get formMinutes(): number | null {
    return calculateMinutes(this.form.startAt, this.form.endAt);
  }

  addSparePartRow(): void {
    this.form.spareParts.push({ code: '', description: '', quantity: 1 });
  }

  removeSparePartRow(index: number): void {
    this.form.spareParts.splice(index, 1);
  }

  // ============================================================
  //  AYUDANTE (Auxiliar de Mantenimiento, máx. 1)
  // ============================================================

  /** Auxiliares de Mantenimiento; si RH no marca a nadie como auxiliar, todo el personal de mantenimiento. */
  private get helperPool(): MaintenanceTechnician[] {
    const assistants = this.staff.filter((s) => s.isAssistant);
    return (assistants.length ? assistants : this.staff).filter((s) => s.document !== this.myDocument);
  }

  get helperPoolIsFallback(): boolean {
    return this.staff.length > 0 && !this.staff.some((s) => s.isAssistant);
  }

  onHelperSearchChange(term: string): void {
    if (this.isSelectingHelper) return;
    const t = (term || '').toString().trim().toLowerCase();
    if (!t) {
      this.helperResults = [];
      this.showHelperDropdown = false;
      return;
    }
    this.helperResults = this.helperPool
      .filter((s) => (s.fullName || '').toLowerCase().includes(t) || (s.document || '').toLowerCase().includes(t))
      .slice(0, 20);
    this.showHelperDropdown = this.helperResults.length > 0;
  }

  selectHelper(s: MaintenanceTechnician): void {
    this.isSelectingHelper = true;
    this.form.helper = { document: s.document, fullName: s.fullName };
    this.helperSearchTerm = '';
    this.helperResults = [];
    this.showHelperDropdown = false;
    setTimeout(() => (this.isSelectingHelper = false), 300);
  }

  removeHelper(): void {
    this.form.helper = null;
  }

  onHelperBlur(): void {
    setTimeout(() => (this.showHelperDropdown = false), 120);
  }

  onHelperFocus(): void {
    if (this.isSelectingHelper) return;
    if (this.helperResults.length > 0) this.showHelperDropdown = true;
  }

  // ============================================================
  //  GUARDAR
  // ============================================================

  submit(): void {
    if (!this.selectedOrder) return;

    const workDone = this.form.workDone.trim();
    if (!workDone) {
      this.toastr.warning('Describa el trabajo realizado.', 'Atención');
      return;
    }
    if (!this.form.startAt || !this.form.endAt) {
      this.toastr.warning('Indique fecha y hora de inicio y de fin de la actividad.', 'Atención');
      return;
    }
    if (this.formMinutes === null) {
      this.toastr.warning('La hora de fin debe ser posterior a la de inicio.', 'Atención');
      return;
    }
    if (this.form.escalateToTechnicalDesk && !this.form.escalationReason.trim()) {
      this.toastr.warning('Indique el motivo para escalar a mesa técnica.', 'Atención');
      return;
    }

    const common = {
      workDone,
      startAt: toBackendDateTime(this.form.startAt),
      endAt: toBackendDateTime(this.form.endAt),
      notes: this.form.notes.trim(),
      spareParts: this.form.spareParts.filter((sp) => sp.description?.trim()),
      escalateToTechnicalDesk: this.form.escalateToTechnicalDesk,
      escalationReason: this.form.escalationReason.trim(),
      helper: this.form.helper
    };

    const editing = this.editingIntervention;
    const request$ = editing
      ? this.maintenanceService.updateIntervention(this.selectedOrder.id, editing.id, {
          ...common,
          observation: 'Corrección del técnico (habilitada por el Jefe)'
        } as UpdateInterventionRequest)
      : this.maintenanceService.addIntervention(this.selectedOrder.id, {
          ...common,
          technicianCodes: [this.myDocument]
        } as AddInterventionRequest);

    this.isSaving = true;
    request$.subscribe({
      next: (res) => {
        if (!res?.ok) {
          this.toastr.error(res?.msg || 'No se pudo guardar la actividad.', 'Error');
          return;
        }
        this.toastr.success(editing ? 'Corrección guardada.' : res.msg || 'Actividad registrada.', 'Mantenimiento');
        this.selectedOrder = res.data;
        this.replaceInList(res.data);
        this.resetForm();
      },
      error: (err: Error) => this.toastr.error(err.message || 'Error al guardar la actividad.', 'Error'),
      complete: () => (this.isSaving = false)
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

  private resetForm(): void {
    this.form = this.buildEmptyForm();
    this.editingIntervention = null;
    this.showForm = false;
    this.helperSearchTerm = '';
    this.helperResults = [];
    this.showHelperDropdown = false;
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
      helper: null,
      escalateToTechnicalDesk: false,
      escalationReason: '',
      spareParts: []
    };
  }
}
