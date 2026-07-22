// src/app/maintenance/maintenance-news/maintenance-news.ts
import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { debounceTime, filter } from 'rxjs';
import {
  CreateMaintenanceRequest,
  MaintenancePriority,
  MaintenanceType,
} from '../../interfaces/maintenance.interface';
import {
  Machine,
  ProductionAreaGrouped,
  ProductionSubArea,
} from '../../interfaces/production-news.interface';
import { MaintenanceTechnician } from '../../interfaces/rh-staff.interface';
import { AuthService } from '../../services/auth-services';
import { MaintenanceServices } from '../../services/maintenance-services';
import { NewsServices } from '../../services/news-services';
import { RhStaffServices } from '../../services/rh-staff-services';

@Component({
  selector: 'app-maintenance-news',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './maintenance-news.html',
  styleUrl: './maintenance-news.scss',
})
export class MaintenanceNews implements OnInit {
  private fb = inject(FormBuilder);
  private maintenanceService = inject(MaintenanceServices);
  private rhStaffService = inject(RhStaffServices);
  private newsServices = inject(NewsServices);
  private authService = inject(AuthService);
  private toastr = inject(ToastrService);

  readonly maintenanceTypes: MaintenanceType[] = ['PREVENTIVO', 'CORRECTIVO', 'PREDICTIVO'];
  readonly priorities: MaintenancePriority[] = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'];
  readonly serviceTypes: string[] = ['INTERNO', 'EXTERNO'];

  /** Áreas de producción agrupadas (área + sus departamentos/subáreas). */
  groupedAreas: ProductionAreaGrouped[] = [];
  availableDepartments: ProductionSubArea[] = [];

  /** Máquinas del área seleccionada y resultados del buscador predictivo. */
  machinesByArea: Machine[] = [];
  predictiveMachineList: Machine[] = [];
  showMachineDropdown = false;
  private isSelectingMachine = false;

  /** Técnicos de mantenimiento y resultados del buscador predictivo por nombre/documento. */
  technicians: MaintenanceTechnician[] = [];
  predictiveTechnicianList: MaintenanceTechnician[] = [];
  showTechnicianDropdown = false;
  private isSelectingTechnician = false;

  form!: FormGroup;
  isSubmitting = false;

  ngOnInit(): void {
    const user = this.authService.userData();

    this.form = this.fb.group({
      consecutiveSection: [''],
      machineArea: ['', Validators.required],
      machineDepartment: [''],
      machineCode: ['', Validators.required],
      machineName: [''],
      costCenter: [''],
      maintenanceType: ['', Validators.required],
      serviceType: ['INTERNO'],
      description: ['', [Validators.required, Validators.minLength(10)]],
      failureDescription: [''],
      priority: ['MEDIA'],
      requestedBy: [user?.full_name || ''],
      reportedAt: [''],
      receivedAt: [''],
      scheduledDate: [''],
      assignedTo: [''],
    });

    this.loadGroupedAreas();
    this.loadTechnicians();
    this.setupMachineSearch();
    this.setupTechnicianSearch();

    this.form.get('machineArea')?.valueChanges.subscribe((area) => this.handleAreaChange(area));
  }

  // ============================================================
  //  ÁREAS + DEPARTAMENTOS (servicio agrupado)
  // ============================================================

  private loadGroupedAreas(): void {
    this.newsServices.getProductionAreasGrouped().subscribe({
      next: (res) => {
        if (res.ok) this.groupedAreas = res.msg;
      },
      error: (err) => console.error('Error cargando áreas agrupadas:', err),
    });
  }

  private handleAreaChange(area: string): void {
    const group = this.groupedAreas.find((g) => g.area === area);
    this.availableDepartments = group ? group.subAreas : [];
    this.form.get('machineDepartment')?.setValue('', { emitEvent: false });

    // Reiniciar la máquina al cambiar de área.
    this.form.get('machineCode')?.setValue('', { emitEvent: false });
    this.form.get('machineName')?.setValue('', { emitEvent: false });
    this.predictiveMachineList = [];
    this.showMachineDropdown = false;
    this.loadMachinesByArea(area);
  }

  // ============================================================
  //  BUSCADOR PREDICTIVO DE MÁQUINAS (igual que shared-news)
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

  private setupMachineSearch(): void {
    this.form
      .get('machineCode')
      ?.valueChanges.pipe(
        debounceTime(200),
        filter(() => !this.isSelectingMachine),
      )
      .subscribe((term: string) => {
        const t = (term || '').toString().trim().toLowerCase();
        if (t.length < 1) {
          this.predictiveMachineList = [];
          this.showMachineDropdown = false;
          this.form.get('machineName')?.setValue('', { emitEvent: false });
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
      });
  }

  resolveMachineName(machine: Machine): string {
    return (machine.machineName || '').trim() || 'Definir Nombre';
  }

  selectMachine(machine: Machine): void {
    this.isSelectingMachine = true;
    this.form.get('machineCode')?.setValue(machine.machineCode, { emitEvent: false });
    this.form.get('machineName')?.setValue(this.resolveMachineName(machine), { emitEvent: false });
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
  //  BUSCADOR PREDICTIVO DE TÉCNICOS (por nombre o documento)
  // ============================================================

  private loadTechnicians(): void {
    this.rhStaffService.getMaintenanceTechnicians().subscribe({
      next: (techs) => (this.technicians = techs),
      error: (err) => console.error('Error cargando técnicos de mantenimiento:', err),
    });
  }

  private setupTechnicianSearch(): void {
    this.form
      .get('assignedTo')
      ?.valueChanges.pipe(
        debounceTime(200),
        filter(() => !this.isSelectingTechnician),
      )
      .subscribe((term: string) => {
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
      });
  }

  selectTechnician(tech: MaintenanceTechnician): void {
    this.isSelectingTechnician = true;
    this.form.get('assignedTo')?.setValue(tech.fullName, { emitEvent: false });
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

  isFieldInvalid(field: string): boolean {
    const control = this.form.get(field);
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  /** Área compuesta "Área / Departamento" como la espera el backend. */
  private composeArea(area: string, department: string): string {
    const a = (area || '').trim();
    const d = (department || '').trim();
    return d ? `${a} / ${d}` : a;
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastr.warning('Revise los campos obligatorios del formulario.', 'Atención');
      return;
    }

    const v = this.form.getRawValue();
    const payload: CreateMaintenanceRequest = {
      machineCode: (v.machineCode || '').trim(),
      maintenanceType: v.maintenanceType,
      description: (v.description || '').trim(),
    };

    // Solo enviamos los opcionales con contenido.
    if (v.consecutiveSection?.trim()) payload.consecutiveSection = v.consecutiveSection.trim();
    if (v.machineName?.trim()) payload.machineName = v.machineName.trim();
    const requestArea = this.composeArea(v.machineArea, v.machineDepartment);
    if (requestArea) payload.area = requestArea;
    if (v.costCenter?.trim()) payload.costCenter = v.costCenter.trim();
    if (v.serviceType?.trim()) payload.serviceType = v.serviceType.trim();
    if (v.failureDescription?.trim()) payload.failureDescription = v.failureDescription.trim();
    if (v.priority) payload.priority = v.priority;
    if (v.requestedBy?.trim()) payload.requestedBy = v.requestedBy.trim();
    if (v.reportedAt) payload.reportedAt = this.toBackendDateTime(v.reportedAt);
    if (v.receivedAt) payload.receivedAt = this.toBackendDateTime(v.receivedAt);
    if (v.scheduledDate) payload.scheduledDate = this.toBackendDate(v.scheduledDate);
    if (v.assignedTo?.trim()) payload.assignedTo = v.assignedTo.trim();

    this.isSubmitting = true;
    this.maintenanceService.createMaintenance(payload).subscribe({
      next: (res) => {
        this.isSubmitting = false;
        if (!res?.ok) {
          this.toastr.error(res?.msg || 'No se pudo crear la solicitud.', 'Error');
          return;
        }
        const consecutivo = res.data?.consecutiveMtto;
        this.toastr.success(
          consecutivo ? `Solicitud creada. MTTO #${consecutivo}` : 'Solicitud creada.',
          'Mantenimiento',
        );
        this.resetForm();
      },
      error: (err: Error) => {
        this.isSubmitting = false;
        this.toastr.error(err.message || 'Error al crear la solicitud.', 'Fallo de conexión');
      },
    });
  }

  resetForm(): void {
    const user = this.authService.userData();
    this.form.reset({
      consecutiveSection: '',
      machineArea: '',
      machineDepartment: '',
      machineCode: '',
      machineName: '',
      costCenter: '',
      maintenanceType: '',
      serviceType: 'INTERNO',
      description: '',
      failureDescription: '',
      priority: 'MEDIA',
      requestedBy: user?.full_name || '',
      reportedAt: '',
      receivedAt: '',
      scheduledDate: '',
      assignedTo: '',
    });
    this.availableDepartments = [];
    this.machinesByArea = [];
    this.predictiveMachineList = [];
    this.showMachineDropdown = false;
    this.predictiveTechnicianList = [];
    this.showTechnicianDropdown = false;
  }

  /** Convierte un datetime-local (yyyy-MM-ddTHH:mm) a 'dd/MM/yyyy, HH:mm:ss'. */
  private toBackendDateTime(value: string): string {
    const [datePart, timePart] = value.split('T');
    const [year, month, day] = datePart.split('-');
    const time = timePart ? `${timePart}:00`.slice(0, 8) : '00:00:00';
    return `${day}/${month}/${year}, ${time}`;
  }

  /** Convierte un date (yyyy-MM-dd) a 'dd/MM/yyyy'. */
  private toBackendDate(value: string): string {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }
}
