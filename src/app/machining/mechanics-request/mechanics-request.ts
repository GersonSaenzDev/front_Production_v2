// src/app/machining/mechanics-request/mechanics-request.ts
//
// "Solicitud Herramental (SME)": formulario del Jefe de Mecánica para crear la solicitud según
// el formato controlado SME55003. Se puede prellenar desde una novedad (Gestión de Solicitudes →
// "Generar solicitud"); en ese caso la solicitud queda ligada a quien reportó la novedad, que
// será el único que podrá aceptar y evaluar la intervención.
import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { MaintenanceAssignee, MaintenancePriority } from '../../interfaces/maintenance.interface';
import {
  CreateMechanicsRequest,
  MECHANICS_REQUESTED_WORK,
  MECHANICS_SME_REQUEST_TYPES,
  MechanicsExternalWork,
  MechanicsMaterial,
  MountingHit
} from '../../interfaces/mechanics.interface';
import { ProductionAreaGrouped, ProductionSubArea } from '../../interfaces/production-news.interface';
import { MaintenanceTechnician } from '../../interfaces/rh-staff.interface';
import { AuthService } from '../../services/auth-services';
import { MechanicsDraft, MechanicsDraftService } from '../../services/mechanics-draft-service';
import { MechanicsServices } from '../../services/mechanics-services';
import { NewsServices } from '../../services/news-services';
import { RhStaffServices } from '../../services/rh-staff-services';
import { WORK_ORDER_PRIORITIES } from '../../theme/layout/admin/navigation/work-order-acceptance/work-order.util';
import { toBackendDate, toBackendDateTime, toDatetimeLocal } from '../mechanics-time.util';

@Component({
  selector: 'app-mechanics-request',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './mechanics-request.html',
  styleUrl: './mechanics-request.scss'
})
export class MechanicsRequestForm implements OnInit {
  private fb = inject(FormBuilder);
  private mechanicsService = inject(MechanicsServices);
  private rhStaffService = inject(RhStaffServices);
  private newsServices = inject(NewsServices);
  private authService = inject(AuthService);
  private draftService = inject(MechanicsDraftService);
  private router = inject(Router);
  private toastr = inject(ToastrService);

  readonly requestedWorkOptions = MECHANICS_REQUESTED_WORK;
  readonly smeRequestTypes = MECHANICS_SME_REQUEST_TYPES;
  readonly priorities: MaintenancePriority[] = WORK_ORDER_PRIORITIES;

  groupedAreas: ProductionAreaGrouped[] = [];
  availableDepartments: ProductionSubArea[] = [];

  // Persona encargada (1 o N mecánicos) — buscador predictivo por nombre o documento.
  technicians: MaintenanceTechnician[] = [];
  predictiveTechnicianList: MaintenanceTechnician[] = [];
  showTechnicianDropdown = false;
  private isSelectingTechnician = false;
  assigneeSearchTerm = '';
  selectedAssignees: MaintenanceAssignee[] = [];

  // Tablas del formato
  mountingHits: MountingHit[] = [];
  materials: MechanicsMaterial[] = [];
  externalWork: MechanicsExternalWork[] = [];

  form!: FormGroup;
  isSubmitting = false;

  loadedFromNews = false;
  sourceCategory = '';
  private sourceNewsId: string | null = null;

  ngOnInit(): void {
    const user = this.authService.userData();
    this.form = this.fb.group({
      // SOLICITANTE (A)
      toolName: [''],
      toolCode: [''],
      operationNumber: [''],
      operationTotal: [''],
      operationDescription: [''],
      description: ['', [Validators.required, Validators.minLength(5)]],
      requestedWork: [''],
      area: ['', Validators.required],
      department: ['', Validators.required],
      machineCode: [''],
      machineName: [''],
      requestedBy: [user?.full_name || ''],
      reportedAt: [''],
      // SME (A)
      smeRequestType: [''],
      changeNumber: [''],
      projectNumber: [''],
      receivedAt: [''],
      agreedDeliveryDate: [''],
      diagnosis: [''],
      priority: ['MEDIA'],
      scheduledDate: ['']
    });

    this.form.get('area')?.valueChanges.subscribe((area) => this.handleAreaChange(area));
    this.loadTechnicians();

    const draft = this.draftService.consumeDraft();
    this.loadGroupedAreas(() => {
      if (draft) this.applyDraft(draft);
    });
  }

  // ============================================================
  //  PRELLENADO DESDE UNA NOVEDAD
  // ============================================================

  private applyDraft(draft: MechanicsDraft): void {
    this.sourceNewsId = draft.sourceNewsId;
    this.sourceCategory = draft.sourceCategory || '';
    this.loadedFromNews = true;

    const group = this.groupedAreas.find((g) => g.area === draft.area);
    this.availableDepartments = group ? group.subAreas : [];

    this.form.get('area')?.setValue(draft.area || '', { emitEvent: false });
    this.form.patchValue({
      department: draft.department || '',
      machineCode: draft.machineCode || '',
      machineName: draft.machineName || '',
      description: draft.description || '',
      requestedBy: draft.requestedBy?.trim() || this.form.value.requestedBy,
      reportedAt: draft.reportedAt ? toDatetimeLocal(draft.reportedAt) : '',
      receivedAt: toDatetimeLocal(this.nowBackend())
    });
  }

  dismissDraftNotice(): void {
    this.loadedFromNews = false;
  }

  // ============================================================
  //  ÁREAS + DEPARTAMENTOS (servicio agrupado)
  // ============================================================

  private loadGroupedAreas(onLoaded?: () => void): void {
    this.newsServices.getProductionAreasGrouped().subscribe({
      next: (res) => {
        if (res.ok) this.groupedAreas = res.msg;
      },
      error: (err) => {
        console.error('Error cargando áreas agrupadas:', err);
        onLoaded?.();
      },
      complete: () => onLoaded?.()
    });
  }

  private handleAreaChange(area: string): void {
    const group = this.groupedAreas.find((g) => g.area === area);
    this.availableDepartments = group ? group.subAreas : [];
    this.form.get('department')?.setValue('', { emitEvent: false });
  }

  // ============================================================
  //  PERSONA ENCARGADA (buscador predictivo)
  // ============================================================

  private loadTechnicians(): void {
    this.rhStaffService.getMechanicsTechnicians().subscribe({
      next: (techs) => (this.technicians = techs),
      error: (err) => console.error('Error cargando personal de mecánica:', err)
    });
  }

  onAssigneeSearchChange(term: string): void {
    if (this.isSelectingTechnician) return;
    const t = (term || '').toString().trim().toLowerCase();
    if (t.length < 1) {
      this.predictiveTechnicianList = [];
      this.showTechnicianDropdown = false;
      return;
    }
    const selectedDocs = new Set(this.selectedAssignees.map((a) => a.document));
    this.predictiveTechnicianList = this.technicians
      .filter(
        (tech) =>
          !selectedDocs.has(tech.document) &&
          ((tech.fullName || '').toLowerCase().includes(t) || (tech.document || '').toLowerCase().includes(t))
      )
      .slice(0, 20);
    this.showTechnicianDropdown = this.predictiveTechnicianList.length > 0;
  }

  addAssignee(tech: MaintenanceTechnician): void {
    this.isSelectingTechnician = true;
    if (!this.selectedAssignees.some((a) => a.document === tech.document)) {
      this.selectedAssignees.push({ document: tech.document, fullName: tech.fullName, specialty: tech.specialty });
    }
    this.assigneeSearchTerm = '';
    this.predictiveTechnicianList = [];
    this.showTechnicianDropdown = false;
    setTimeout(() => (this.isSelectingTechnician = false), 300);
  }

  removeAssignee(index: number): void {
    this.selectedAssignees.splice(index, 1);
  }

  onTechnicianBlur(): void {
    setTimeout(() => (this.showTechnicianDropdown = false), 120);
  }

  onTechnicianFocus(): void {
    if (this.isSelectingTechnician) return;
    if (this.predictiveTechnicianList.length > 0) this.showTechnicianDropdown = true;
  }

  // ============================================================
  //  TABLAS DEL FORMATO
  // ============================================================

  addMountingHit(): void {
    this.mountingHits.push({ hits: null, date: '' });
  }

  addMaterial(): void {
    this.materials.push({ code: '', description: '', unit: '', quantity: 1 });
  }

  addExternalWork(): void {
    this.externalWork.push({ description: '', provider: '', orderNumber: '' });
  }

  removeRow<T>(list: T[], index: number): void {
    list.splice(index, 1);
  }

  // ============================================================

  isFieldInvalid(field: string): boolean {
    const control = this.form.get(field);
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastr.warning('Revise los campos obligatorios del formulario.', 'Atención');
      return;
    }

    const v = this.form.getRawValue();
    const text = (value: string | null | undefined) => (value || '').trim();
    const payload: CreateMechanicsRequest = {
      area: text(v.area),
      department: text(v.department),
      description: text(v.description)
    };

    // Solo se envían los opcionales con contenido.
    const optional: (keyof CreateMechanicsRequest)[] = [
      'toolName',
      'toolCode',
      'operationNumber',
      'operationTotal',
      'operationDescription',
      'machineCode',
      'machineName',
      'requestedBy',
      'changeNumber',
      'projectNumber',
      'diagnosis'
    ];
    for (const key of optional) {
      const value = text(v[key]);
      if (value) (payload as unknown as Record<string, string>)[key] = value;
    }
    if (v.requestedWork) payload.requestedWork = v.requestedWork;
    if (v.smeRequestType) payload.smeRequestType = v.smeRequestType;
    if (v.priority) payload.priority = v.priority;
    if (v.reportedAt) payload.reportedAt = toBackendDateTime(v.reportedAt);
    if (v.receivedAt) payload.receivedAt = toBackendDateTime(v.receivedAt);
    if (v.agreedDeliveryDate) payload.agreedDeliveryDate = toBackendDate(v.agreedDeliveryDate);
    if (v.scheduledDate) payload.scheduledDate = toBackendDate(v.scheduledDate);

    const hits = this.mountingHits
      .filter((h) => h.hits !== null || h.date)
      .map((h) => ({ hits: h.hits, date: h.date ? toBackendDate(h.date) : '' }));
    if (hits.length) payload.mountingHits = hits;
    const materials = this.materials.filter((m) => m.description?.trim());
    if (materials.length) payload.materials = materials;
    const external = this.externalWork.filter((w) => w.description?.trim());
    if (external.length) payload.externalWork = external;
    if (this.selectedAssignees.length) payload.assignees = this.selectedAssignees;
    if (this.sourceNewsId) payload.sourceNewsId = this.sourceNewsId;

    this.isSubmitting = true;
    this.mechanicsService.createMechanics(payload).subscribe({
      next: (res) => {
        this.isSubmitting = false;
        if (!res?.ok) {
          this.toastr.error(res?.msg || 'No se pudo crear la solicitud.', 'Error');
          return;
        }
        const consecutive = res.data?.consecutiveSme;
        this.toastr.success(consecutive ? `Solicitud creada. SME #${consecutive}` : 'Solicitud creada.', 'Mecánica');
        const fromNews = !!this.sourceNewsId;
        this.resetForm();
        // Desde una novedad se vuelve a la gestión para seguir asignando.
        if (fromNews) this.router.navigate(['/machining/mechanicsManagement']);
      },
      error: (err: Error) => {
        this.isSubmitting = false;
        this.toastr.error(err.message || 'Error al crear la solicitud.', 'Fallo de conexión');
      }
    });
  }

  resetForm(): void {
    const user = this.authService.userData();
    this.form.reset({
      toolName: '',
      toolCode: '',
      operationNumber: '',
      operationTotal: '',
      operationDescription: '',
      description: '',
      requestedWork: '',
      area: '',
      department: '',
      machineCode: '',
      machineName: '',
      requestedBy: user?.full_name || '',
      reportedAt: '',
      smeRequestType: '',
      changeNumber: '',
      projectNumber: '',
      receivedAt: '',
      agreedDeliveryDate: '',
      diagnosis: '',
      priority: 'MEDIA',
      scheduledDate: ''
    });
    this.availableDepartments = [];
    this.selectedAssignees = [];
    this.assigneeSearchTerm = '';
    this.mountingHits = [];
    this.materials = [];
    this.externalWork = [];
    this.loadedFromNews = false;
    this.sourceCategory = '';
    this.sourceNewsId = null;
  }

  /** Fecha/hora actual en formato backend, para precargar "Fecha recibido". */
  private nowBackend(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}:00`;
  }
}
