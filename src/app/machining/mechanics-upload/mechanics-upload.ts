// src/app/machining/mechanics-upload/mechanics-upload.ts
//
// "Cargue de Intervención": pantalla del MECÁNICO (no del Jefe). Mismo comportamiento que
// "Cargue de Novedad" de Mantenimiento:
//   - Ve las solicitudes SME donde está asignado o en las que participó como auxiliar.
//   - Registra VARIAS sesiones de trabajo (trabajo realizado, inicio/fin = H. Hom) indicando la
//     máquina-herramienta y el tiempo de máquina (H. Máq) de la tabla "TIEMPO EMPLEADO".
//   - Puede vincular 1 auxiliar: el backend guarda un registro por persona con el mismo tiempo.
//   - Una sesión ya registrada solo se corrige si el Jefe la habilita (se consume al guardar).
import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { MaintenanceStatus, PersonRef } from '../../interfaces/maintenance.interface';
import {
  MECHANICS_MACHINE_TYPES,
  MechanicsIntervention,
  MechanicsInterventionInput,
  MechanicsMachineType,
  MechanicsRequest,
  MechanicsUpdateInterventionRequest
} from '../../interfaces/mechanics.interface';
import { MaintenanceTechnician } from '../../interfaces/rh-staff.interface';
import { AuthService } from '../../services/auth-services';
import { MechanicsServices } from '../../services/mechanics-services';
import { RhStaffServices } from '../../services/rh-staff-services';
import {
  workOrderPriorityClass,
  workOrderStatusClass,
  workOrderStatusLabel
} from '../../theme/layout/admin/navigation/work-order-acceptance/work-order.util';
import { calculateMinutes, formatMinutes, toBackendDateTime, toDatetimeLocal } from '../mechanics-time.util';

interface InterventionFormModel {
  workDone: string;
  startAt: string;
  endAt: string;
  notes: string;
  helper: PersonRef | null;
  machineType: MechanicsMachineType | '';
  machineMinutes: number | null;
}

@Component({
  selector: 'app-mechanics-upload',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './mechanics-upload.html',
  styleUrl: './mechanics-upload.scss'
})
export class MechanicsUpload implements OnInit {
  private authService = inject(AuthService);
  private mechanicsService = inject(MechanicsServices);
  private rhStaffService = inject(RhStaffServices);
  private toastr = inject(ToastrService);

  readonly formatMinutes = formatMinutes;
  readonly statusLabel = workOrderStatusLabel;
  readonly priorityClass = workOrderPriorityClass;
  readonly machineTypes = MECHANICS_MACHINE_TYPES;

  get myDocument(): string {
    return this.authService.userData()?.uid || '';
  }

  get myFullName(): string {
    return this.authService.userData()?.full_name || '';
  }

  orders: MechanicsRequest[] = [];
  isLoading = false;

  selectedOrder: MechanicsRequest | null = null;
  isLoadingOrder = false;
  form: InterventionFormModel = this.buildEmptyForm();
  isSaving = false;
  editingIntervention: MechanicsIntervention | null = null;
  showForm = false;

  // Auxiliar: buscador predictivo por nombre o documento.
  private staff: MaintenanceTechnician[] = [];
  helperSearchTerm = '';
  helperResults: MaintenanceTechnician[] = [];
  showHelperDropdown = false;
  private isSelectingHelper = false;

  ngOnInit(): void {
    this.load();
    this.rhStaffService.getMechanicsTechnicians().subscribe({
      next: (list) => (this.staff = list),
      error: (err) => console.error('Error cargando personal de mecánica:', err)
    });
  }

  load(): void {
    this.isLoading = true;
    this.mechanicsService.listMechanics({ assignedToMe: true }).subscribe({
      next: (res) => {
        this.orders = res?.ok && res.data ? res.data : [];
        if (this.selectedOrder) {
          this.selectedOrder = this.orders.find((o) => o.id === this.selectedOrder!.id) || null;
        }
      },
      error: (err: Error) => {
        this.orders = [];
        this.toastr.error(err.message || 'No se pudieron cargar tus solicitudes asignadas.', 'Error');
      },
      complete: () => (this.isLoading = false)
    });
  }

  /** Selecciona y vuelve a consultar: así ve al instante si el Jefe habilitó una corrección. */
  select(order: MechanicsRequest): void {
    this.selectedOrder = order;
    this.resetForm();
    this.isLoadingOrder = true;
    this.mechanicsService.getMechanicsById(order.id).subscribe({
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

  statusClass(status: MaintenanceStatus): string {
    return workOrderStatusClass(status);
  }

  machineTypeLabel(value: string | null | undefined): string {
    return this.machineTypes.find((o) => o.value === value)?.label || '—';
  }

  get isAssignee(): boolean {
    return !!this.selectedOrder?.assignees?.some((a) => a.document === this.myDocument);
  }

  /** Cerrada: ya no se registra trabajo nuevo (el Jefe puede reabrirla). */
  get isClosed(): boolean {
    return this.selectedOrder?.status === 'COMPLETADO' || this.selectedOrder?.status === 'CANCELADO';
  }

  get mySessions(): MechanicsIntervention[] {
    if (!this.selectedOrder) return [];
    const doc = this.myDocument;
    return this.selectedOrder.interventions.filter((i) => i.technicianCodes?.includes(doc));
  }

  get myTotalMinutes(): number {
    return this.mySessions.reduce((sum, i) => sum + (i.durationMinutes || 0), 0);
  }

  canCorrect(it: MechanicsIntervention): boolean {
    return it.role !== 'AYUDANTE' && it.editUnlocked;
  }

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

  startEdit(it: MechanicsIntervention): void {
    this.form = {
      workDone: it.workDone || '',
      startAt: toDatetimeLocal(it.startAt),
      endAt: toDatetimeLocal(it.endAt),
      notes: it.notes || '',
      helper: it.helper?.document ? { ...it.helper } : null,
      machineType: it.machineType || '',
      machineMinutes: it.machineMinutes
    };
    this.editingIntervention = it;
    this.showForm = true;
  }

  cancelForm(): void {
    this.resetForm();
  }

  get formMinutes(): number | null {
    return calculateMinutes(this.form.startAt, this.form.endAt);
  }

  // ---------- Auxiliar (máx. 1) ----------

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

  // ---------- Guardar ----------

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
    if (this.form.machineMinutes !== null && this.form.machineMinutes < 0) {
      this.toastr.warning('El tiempo de máquina no puede ser negativo.', 'Atención');
      return;
    }

    const common = {
      workDone,
      startAt: toBackendDateTime(this.form.startAt),
      endAt: toBackendDateTime(this.form.endAt),
      notes: this.form.notes.trim(),
      helper: this.form.helper,
      ...(this.form.machineType ? { machineType: this.form.machineType } : {}),
      ...(this.form.machineMinutes !== null ? { machineMinutes: this.form.machineMinutes } : {})
    };

    const editing = this.editingIntervention;
    const request$ = editing
      ? this.mechanicsService.updateIntervention(this.selectedOrder.id, editing.id, {
          ...common,
          observation: 'Corrección del mecánico (habilitada por el Jefe)'
        } as MechanicsUpdateInterventionRequest)
      : this.mechanicsService.addIntervention(this.selectedOrder.id, {
          ...common,
          spareParts: [],
          technicianCodes: [this.myDocument]
        } as MechanicsInterventionInput);

    this.isSaving = true;
    request$.subscribe({
      next: (res) => {
        if (!res?.ok) {
          this.toastr.error(res?.msg || 'No se pudo guardar la actividad.', 'Error');
          return;
        }
        this.toastr.success(editing ? 'Corrección guardada.' : res.msg || 'Actividad registrada.', 'Mecánica');
        this.selectedOrder = res.data;
        this.replaceInList(res.data);
        this.resetForm();
      },
      error: (err: Error) => this.toastr.error(err.message || 'Error al guardar la actividad.', 'Error'),
      complete: () => (this.isSaving = false)
    });
  }

  private resetForm(): void {
    this.form = this.buildEmptyForm();
    this.editingIntervention = null;
    this.showForm = false;
    this.helperSearchTerm = '';
    this.helperResults = [];
    this.showHelperDropdown = false;
  }

  private replaceInList(updated: MechanicsRequest): void {
    const idx = this.orders.findIndex((o) => o.id === updated.id);
    if (idx >= 0) this.orders[idx] = updated;
  }

  private buildEmptyForm(): InterventionFormModel {
    return { workDone: '', startAt: '', endAt: '', notes: '', helper: null, machineType: '', machineMinutes: null };
  }
}
