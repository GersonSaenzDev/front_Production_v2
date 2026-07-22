// src/app/maintenance/view-news/view-news.ts
import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import {
  AddInterventionRequest,
  ApprovalRole,
  MaintenanceListFilters,
  MaintenancePriority,
  MaintenanceRequest,
  MaintenanceStatus,
  MaintenanceType,
  UpdateMaintenanceRequest,
} from '../../interfaces/maintenance.interface';
import {
  Machine,
  ProductionAreaGrouped,
  ProductionSubArea,
} from '../../interfaces/production-news.interface';
import { MaintenanceTechnician } from '../../interfaces/rh-staff.interface';
import { MaintenanceServices } from '../../services/maintenance-services';
import { NewsServices } from '../../services/news-services';
import { RhStaffServices } from '../../services/rh-staff-services';

@Component({
  selector: 'app-maintenance-view-news',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './view-news.html',
  styleUrl: './view-news.scss',
})
export class ViewNews implements OnInit {
  private maintenanceService = inject(MaintenanceServices);
  private rhStaffService = inject(RhStaffServices);
  private newsServices = inject(NewsServices);
  private toastr = inject(ToastrService);

  readonly statuses: MaintenanceStatus[] = ['PENDIENTE', 'EN_PROCESO', 'COMPLETADO', 'CANCELADO'];
  readonly priorities: MaintenancePriority[] = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'];
  readonly maintenanceTypes: MaintenanceType[] = ['PREVENTIVO', 'CORRECTIVO', 'PREDICTIVO'];

  technicians: MaintenanceTechnician[] = [];

  filters: { status: string; maintenanceType: string; machineCode: string; area: string } = {
    status: '',
    maintenanceType: '',
    machineCode: '',
    area: '',
  };

  orders: MaintenanceRequest[] = [];
  isLoading = false;

  // Detalle
  showDetailModal = false;
  detailOrder: MaintenanceRequest | null = null;

  // Edición
  showEditModal = false;
  isSaving = false;
  editOrder: MaintenanceRequest | null = null;
  editForm: EditForm = this.buildEmptyEditForm();

  // Áreas + departamentos (servicio agrupado) para el modal de edición
  groupedAreas: ProductionAreaGrouped[] = [];
  availableDepartments: ProductionSubArea[] = [];

  // Buscador predictivo de máquinas en edición
  machinesByArea: Machine[] = [];
  predictiveMachineList: Machine[] = [];
  showMachineDropdown = false;
  private isSelectingMachine = false;

  // Buscador predictivo de técnicos (por nombre o documento) en edición
  predictiveTechnicianList: MaintenanceTechnician[] = [];
  showTechnicianDropdown = false;
  private isSelectingTechnician = false;

  // Nueva intervención (acción de contención)
  newIntervention: { technicianCodes: string; workDone: string; startAt: string; endAt: string } = {
    technicianCodes: '',
    workDone: '',
    startAt: '',
    endAt: '',
  };
  isAddingIntervention = false;

  ngOnInit(): void {
    this.loadTechnicians();
    this.loadGroupedAreas();
    this.search();
  }

  private loadGroupedAreas(): void {
    this.newsServices.getProductionAreasGrouped().subscribe({
      next: (res) => {
        if (res.ok) this.groupedAreas = res.msg;
      },
      error: (err) => console.error('Error cargando áreas agrupadas:', err),
    });
  }

  private loadTechnicians(): void {
    this.rhStaffService.getMaintenanceTechnicians().subscribe({
      next: (techs) => (this.technicians = techs),
      error: (err) => console.error('Error cargando técnicos de mantenimiento:', err),
    });
  }

  // ============================================================
  //  LISTADO
  // ============================================================

  search(): void {
    const filters: MaintenanceListFilters = {};
    if (this.filters.status) filters.status = this.filters.status as MaintenanceStatus;
    if (this.filters.maintenanceType)
      filters.maintenanceType = this.filters.maintenanceType as MaintenanceType;
    if (this.filters.machineCode.trim()) filters.machineCode = this.filters.machineCode.trim();
    if (this.filters.area.trim()) filters.area = this.filters.area.trim();

    this.isLoading = true;
    this.maintenanceService.listMaintenance(filters).subscribe({
      next: (res) => {
        this.orders = res?.ok && res.data ? res.data : [];
      },
      error: (err: Error) => {
        this.orders = [];
        this.toastr.error(err.message || 'No se pudieron cargar las solicitudes.', 'Error');
      },
      complete: () => (this.isLoading = false),
    });
  }

  clearFilters(): void {
    this.filters = { status: '', maintenanceType: '', machineCode: '', area: '' };
    this.search();
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

  // ============================================================
  //  DETALLE
  // ============================================================

  openDetail(order: MaintenanceRequest): void {
    this.detailOrder = order;
    this.resetNewIntervention();
    this.showDetailModal = true;
  }

  closeDetail(): void {
    this.showDetailModal = false;
    this.detailOrder = null;
  }

  // ============================================================
  //  EDICIÓN / ASIGNACIÓN
  // ============================================================

  openEdit(order: MaintenanceRequest): void {
    this.editOrder = order;

    const { area, department } = this.parseArea(order.area);
    this.editForm = {
      status: order.status,
      priority: order.priority,
      maintenanceType: order.maintenanceType,
      assignedTo: order.assignedTo || '',
      machineArea: area,
      machineDepartment: department,
      machineCode: order.machineCode || '',
      machineName: order.machineName || '',
      scheduledDate: order.scheduledDate || '',
      observation: '',
    };

    // Preparar áreas/departamentos y máquinas del área actual.
    const group = this.groupedAreas.find((g) => g.area === area);
    this.availableDepartments = group ? group.subAreas : [];
    this.loadMachinesByArea(area);

    this.predictiveMachineList = [];
    this.showMachineDropdown = false;
    this.predictiveTechnicianList = [];
    this.showTechnicianDropdown = false;
    this.showEditModal = true;
  }

  closeEdit(): void {
    if (this.isSaving) return;
    this.showEditModal = false;
    this.editOrder = null;
  }

  saveEdit(): void {
    if (!this.editOrder) return;
    if (!this.editForm.observation?.trim()) {
      this.toastr.warning('Indique una observación que justifique el cambio.', 'Atención');
      return;
    }

    const payload: UpdateMaintenanceRequest = {
      status: this.editForm.status,
      priority: this.editForm.priority,
      maintenanceType: this.editForm.maintenanceType,
      assignedTo: this.editForm.assignedTo,
      // machineCode no es actualizable por el backend; sí machineName y area.
      machineName: this.editForm.machineName,
      area: this.composeArea(this.editForm.machineArea, this.editForm.machineDepartment),
      scheduledDate: this.editForm.scheduledDate,
      observation: this.editForm.observation.trim(),
    };

    this.isSaving = true;
    this.maintenanceService.updateMaintenance(this.editOrder.id, payload).subscribe({
      next: (res) => {
        if (!res?.ok) {
          this.toastr.error(res?.msg || 'No se pudo actualizar.', 'Error');
          return;
        }
        this.toastr.success('Solicitud actualizada.', 'Mantenimiento');
        this.replaceInList(res.data);
        this.showEditModal = false;
        this.editOrder = null;
      },
      error: (err: Error) => this.toastr.error(err.message || 'Error al actualizar.', 'Error'),
      complete: () => (this.isSaving = false),
    });
  }

  // ============================================================
  //  Vo.Bo (aprobaciones)
  // ============================================================

  approve(order: MaintenanceRequest, role: ApprovalRole): void {
    this.maintenanceService.registerApproval(order.id, { role }).subscribe({
      next: (res) => {
        if (!res?.ok) {
          this.toastr.error(res?.msg || 'No se pudo registrar el Vo.Bo.', 'Error');
          return;
        }
        order.supervisorApproval = res.data.supervisorApproval;
        order.requesterApproval = res.data.requesterApproval;
        this.toastr.success(res.msg || `Vo.Bo ${role} registrado.`, 'Mantenimiento');
      },
      error: (err: Error) => this.toastr.error(err.message || 'Error al registrar Vo.Bo.', 'Error'),
    });
  }

  // ============================================================
  //  INTERVENCIONES
  // ============================================================

  addIntervention(): void {
    if (!this.detailOrder) return;
    const workDone = this.newIntervention.workDone.trim();
    if (!workDone) {
      this.toastr.warning('Describa el trabajo realizado.', 'Atención');
      return;
    }

    const payload: AddInterventionRequest = {
      technicianCodes: this.newIntervention.technicianCodes
        .split(',')
        .map((c) => c.trim())
        .filter((c) => !!c),
      workDone,
      startAt: this.newIntervention.startAt
        ? this.toBackendDateTime(this.newIntervention.startAt)
        : '',
      endAt: this.newIntervention.endAt ? this.toBackendDateTime(this.newIntervention.endAt) : '',
      spareParts: [],
    };

    this.isAddingIntervention = true;
    this.maintenanceService.addIntervention(this.detailOrder.id, payload).subscribe({
      next: (res) => {
        if (!res?.ok) {
          this.toastr.error(res?.msg || 'No se pudo agregar la intervención.', 'Error');
          return;
        }
        this.toastr.success('Acción de contención agregada.', 'Mantenimiento');
        this.detailOrder = res.data;
        this.replaceInList(res.data);
        this.resetNewIntervention();
      },
      error: (err: Error) => this.toastr.error(err.message || 'Error al agregar.', 'Error'),
      complete: () => (this.isAddingIntervention = false),
    });
  }

  // ============================================================
  //  ELIMINAR
  // ============================================================

  remove(order: MaintenanceRequest): void {
    if (!confirm(`¿Eliminar la solicitud MTTO #${order.consecutiveMtto}?`)) return;
    this.maintenanceService.deleteMaintenance(order.id).subscribe({
      next: (res) => {
        if (!res?.ok) {
          this.toastr.error(res?.msg || 'No se pudo eliminar.', 'Error');
          return;
        }
        this.orders = this.orders.filter((o) => o.id !== order.id);
        this.toastr.success('Solicitud eliminada.', 'Mantenimiento');
      },
      error: (err: Error) => this.toastr.error(err.message || 'Error al eliminar.', 'Error'),
    });
  }

  // ============================================================
  //  EDICIÓN: ÁREA + DEPARTAMENTO (servicio agrupado)
  // ============================================================

  onEditAreaChange(area: string): void {
    const group = this.groupedAreas.find((g) => g.area === area);
    this.availableDepartments = group ? group.subAreas : [];
    this.editForm.machineDepartment = '';
    this.editForm.machineCode = '';
    this.editForm.machineName = '';
    this.predictiveMachineList = [];
    this.showMachineDropdown = false;
    this.loadMachinesByArea(area);
  }

  // ============================================================
  //  EDICIÓN: BUSCADOR PREDICTIVO DE MÁQUINAS
  // ============================================================

  private loadMachinesByArea(area: string): void {
    if (!area) {
      this.machinesByArea = [];
      return;
    }
    this.newsServices.getMachinesByArea({ area: area.toUpperCase() }).subscribe({
      next: (res) => (this.machinesByArea = res.ok ? res.msg : []),
      error: (err) => {
        console.error('Error cargando máquinas por área:', err);
        this.machinesByArea = [];
      },
    });
  }

  onEditMachineCodeChange(term: string): void {
    if (this.isSelectingMachine) return;
    const t = (term || '').toString().trim().toLowerCase();
    if (t.length < 1) {
      this.predictiveMachineList = [];
      this.showMachineDropdown = false;
      this.editForm.machineName = '';
      return;
    }
    this.predictiveMachineList = this.machinesByArea
      .filter(
        (m) =>
          (m.machineCode || '').toLowerCase().includes(t) ||
          (m.machineName || '').toLowerCase().includes(t),
      )
      .slice(0, 20);
    this.showMachineDropdown = this.predictiveMachineList.length > 0;
  }

  resolveMachineName(machine: Machine): string {
    return (machine.machineName || '').trim() || 'Definir Nombre';
  }

  selectEditMachine(machine: Machine): void {
    this.isSelectingMachine = true;
    this.editForm.machineCode = machine.machineCode;
    this.editForm.machineName = this.resolveMachineName(machine);
    this.predictiveMachineList = [];
    this.showMachineDropdown = false;
    setTimeout(() => (this.isSelectingMachine = false), 300);
  }

  onMachineBlur(): void {
    setTimeout(() => (this.showMachineDropdown = false), 120);
  }

  onMachineFocus(): void {
    if (this.isSelectingMachine) return;
    if (this.predictiveMachineList.length > 0) this.showMachineDropdown = true;
  }

  // ============================================================
  //  EDICIÓN: BUSCADOR PREDICTIVO DE TÉCNICOS (nombre o documento)
  // ============================================================

  onEditAssignedChange(term: string): void {
    if (this.isSelectingTechnician) return;
    const t = (term || '').toString().trim().toLowerCase();
    if (t.length < 1) {
      this.predictiveTechnicianList = [];
      this.showTechnicianDropdown = false;
      return;
    }
    this.predictiveTechnicianList = this.technicians
      .filter(
        (tech) =>
          (tech.fullName || '').toLowerCase().includes(t) ||
          (tech.document || '').toLowerCase().includes(t),
      )
      .slice(0, 20);
    this.showTechnicianDropdown = this.predictiveTechnicianList.length > 0;
  }

  selectEditTechnician(tech: MaintenanceTechnician): void {
    this.isSelectingTechnician = true;
    this.editForm.assignedTo = tech.fullName;
    this.predictiveTechnicianList = [];
    this.showTechnicianDropdown = false;
    setTimeout(() => (this.isSelectingTechnician = false), 300);
  }

  onTechnicianBlur(): void {
    setTimeout(() => (this.showTechnicianDropdown = false), 120);
  }

  onTechnicianFocus(): void {
    if (this.isSelectingTechnician) return;
    if (this.predictiveTechnicianList.length > 0) this.showTechnicianDropdown = true;
  }

  // ============================================================
  //  HELPERS
  // ============================================================

  /** Compone "Área / Departamento" como lo espera el backend. */
  private composeArea(area?: string, department?: string): string {
    const a = (area || '').trim();
    const d = (department || '').trim();
    return d ? `${a} / ${d}` : a;
  }

  /** Separa un "Área / Departamento" en sus partes. */
  private parseArea(value?: string | null): { area: string; department: string } {
    const raw = (value || '').trim();
    if (!raw) return { area: '', department: '' };
    const [area, ...rest] = raw.split('/').map((p) => p.trim());
    return { area: area || '', department: rest.join(' / ') };
  }

  private replaceInList(updated: MaintenanceRequest): void {
    const idx = this.orders.findIndex((o) => o.id === updated.id);
    if (idx >= 0) this.orders[idx] = updated;
  }

  private buildEmptyEditForm(): EditForm {
    return {
      status: undefined,
      priority: undefined,
      maintenanceType: undefined,
      assignedTo: '',
      machineArea: '',
      machineDepartment: '',
      machineCode: '',
      machineName: '',
      scheduledDate: '',
      observation: '',
    };
  }

  private resetNewIntervention(): void {
    this.newIntervention = { technicianCodes: '', workDone: '', startAt: '', endAt: '' };
  }

  /** Convierte un datetime-local (yyyy-MM-ddTHH:mm) a 'dd/MM/yyyy, HH:mm:ss'. */
  private toBackendDateTime(value: string): string {
    const [datePart, timePart] = value.split('T');
    const [year, month, day] = datePart.split('-');
    const time = timePart ? `${timePart}:00`.slice(0, 8) : '00:00:00';
    return `${day}/${month}/${year}, ${time}`;
  }
}

/** Modelo del formulario de edición (área/departamento separados para los selects). */
interface EditForm {
  status?: MaintenanceStatus;
  priority?: MaintenancePriority;
  maintenanceType?: MaintenanceType;
  assignedTo: string;
  machineArea: string;
  machineDepartment: string;
  machineCode: string;
  machineName: string;
  scheduledDate: string;
  observation: string;
}
