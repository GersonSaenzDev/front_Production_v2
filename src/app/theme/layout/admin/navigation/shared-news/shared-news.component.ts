// src/app/theme/layout/admin/navigation/shared-news/shared-news.component.ts
import { CommonModule } from '@angular/common';
import { Component, inject, Input, OnInit, ViewChild } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { debounceTime, filter, switchMap, tap } from 'rxjs';
import {
  Machine,
  MechanicsRequestedWork,
  NewsMechanicsRequest,
  ProductionArea,
  ProductionAreaGrouped,
  ProductionNewsRequest,
  ProductionNewsResponse,
  ProductionSubArea
} from '../../../../../interfaces/production-news.interface';
import { AuthService } from '../../../../../services/auth-services';
import { DashboardServices } from '../../../../../services/dashboard-services';
import { NewsServices } from '../../../../../services/news-services';
import { RhStaffServices } from '../../../../../services/rh-staff-services';
import { displayArea } from '../area-display.util';
import { OngoingStopsComponent } from '../ongoing-stops/ongoing-stops.component';
import { RequesterAcceptanceComponent } from '../work-order-acceptance/requester-acceptance.component';
import { Time24Directive, TIME_24_PATTERN } from '../time-24.directive';
import {
  formatDurationLabel,
  formatStopTotal,
  isoToDdMmYyyy,
  minutesBetween,
  parseStopMoment,
  toHHmm,
  toIsoDate
} from '../stop-time.util';

/** Estado de la parada al reportarla: sigue detenida (sin fin) o ya terminó. */
type StopStatus = 'ongoing' | 'finished';

/** Persona elegible como responsable de un proyecto (personal activo de RH). */
interface ResponsibleOption {
  document: string;
  fullName: string;
  departament: string;
}

/** Tolerancia (min) para relojes levemente adelantados; igual a la del backend. */
const FUTURE_TOLERANCE_MINUTES = 5;

/** El Área Destino es Mecánica (sin tildes ni mayúsculas; el catálogo la guarda como 'Mecanica'). */
function isMechanicsArea(area: string | null | undefined): boolean {
  return (area || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase() === 'MECANICA';
}

/** Operación N° debe estar entre 1 y el total ("Operación 2 de 3"). */
function operationRangeValidator(group: AbstractControl): ValidationErrors | null {
  const n = Number(group.get('operationNumber')?.value);
  const total = Number(group.get('operationTotal')?.value);
  if (!n || !total) return null;
  return n > total ? { operationRange: true } : null;
}

@Component({
  selector: 'app-shared-news',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, OngoingStopsComponent, Time24Directive, RequesterAcceptanceComponent],
  templateUrl: './shared-news.component.html',
  styleUrls: ['./shared-news.component.scss']
})
export class SharedNewsComponent implements OnInit {
  @Input() title: string = '';
  @Input() subtitle: string = '';
  @Input() defaultOriginArea: string = '';
  /** Permite cargar la novedad a otra sub-área de la MISMA área origen (ej. Post Venta: Servicio al Cliente -> Servicio Tecnico). */
  @Input() allowSameAreaAssignment: boolean = false;

  private authService = inject(AuthService);
  private dashboardService = inject(DashboardServices);
  private fb = inject(FormBuilder);
  private newsServices = inject(NewsServices);
  private rhStaffService = inject(RhStaffServices);
  private toastr = inject(ToastrService);

  // --- Proyecto + responsable (opcional) ---
  /** Personal activo (se carga una sola vez, al empezar a buscar). */
  private staff: ResponsibleOption[] = [];
  private staffLoaded = false;
  isLoadingStaff = false;
  responsibleSearch = '';
  responsibleOptions: ResponsibleOption[] = [];
  showResponsibleDropdown = false;
  responsibleTouched = false;
  projectResponsible: ResponsibleOption | null = null;

  get projectNameFilled(): boolean {
    return !!(this.novedadForm?.get('projectName')?.value || '').trim();
  }

  private loadStaffOnce(): void {
    if (this.staffLoaded || this.isLoadingStaff) return;
    this.isLoadingStaff = true;
    this.rhStaffService.getActiveStaff().subscribe({
      next: (res) => {
        this.staff = (res?.data || [])
          .filter((s) => !!s.document && !!s.full_name)
          .map((s) => ({ document: s.document, fullName: s.full_name, departament: s.staffAssignment?.departament || '' }));
        this.staffLoaded = true;
        this.isLoadingStaff = false;
        this.filterResponsibles();
      },
      error: (err) => {
        this.isLoadingStaff = false;
        console.error('Error cargando personal activo:', err);
        this.toastr.warning('No se pudo cargar el personal para elegir el responsable.', 'Proyecto');
      }
    });
  }

  onResponsibleSearch(term: string): void {
    this.responsibleSearch = term || '';
    this.loadStaffOnce();
    this.filterResponsibles();
  }

  private filterResponsibles(): void {
    const t = this.responsibleSearch.trim().toLowerCase();
    if (t.length < 2) {
      this.responsibleOptions = [];
      this.showResponsibleDropdown = false;
      return;
    }
    this.responsibleOptions = this.staff
      .filter((p) => p.fullName.toLowerCase().includes(t) || p.document.toLowerCase().includes(t))
      .slice(0, 20);
    this.showResponsibleDropdown = this.responsibleOptions.length > 0;
  }

  onResponsibleFocus(): void {
    this.loadStaffOnce();
    if (this.responsibleOptions.length) this.showResponsibleDropdown = true;
  }

  onResponsibleBlur(): void {
    this.responsibleTouched = true;
    setTimeout(() => (this.showResponsibleDropdown = false), 150);
  }

  selectResponsible(p: ResponsibleOption): void {
    this.projectResponsible = p;
    this.responsibleSearch = '';
    this.responsibleOptions = [];
    this.showResponsibleDropdown = false;
  }

  clearResponsible(): void {
    this.projectResponsible = null;
    this.responsibleTouched = false;
  }

  @ViewChild(OngoingStopsComponent) private ongoingStops?: OngoingStopsComponent;

  get userArea(): string {
    return this.authService.userData()?.area || this.defaultOriginArea || '';
  }

  /** Scope del panel de paradas en curso (mismo criterio que la consulta de novedades). */
  get stopsScope(): string {
    return this.defaultOriginArea || this.userArea;
  }

  get displayTitle(): string {
    if (this.title) return this.title;
    const area = displayArea(this.userArea);
    return area ? `Registro de Novedades de ${area}: ${this.authService.userData()?.departament} ` : 'Registro de Novedades';
  }

  get displaySubtitle(): string {
    if (this.subtitle) return this.subtitle;
    const area = displayArea(this.userArea);
    return area
      ? `Reportar incidentes o novedades del área de ${area}.`
      : 'Reportar incidentes o novedades.';
  }

  /** Etiqueta visible para un área real (solo display; el valor guardado no cambia). */
  displayArea(realName: string | null | undefined): string {
    return displayArea(realName);
  }

  // ============================================================
  //  SOLICITANTE (A) — Herramental Mecánica (SME55003)
  //  Obligatorio cuando el Área Destino es Mecánica.
  // ============================================================

  /** Opciones de "Requiere" del formato (mismo catálogo del backend). */
  readonly mechanicsRequestedWork: { value: MechanicsRequestedWork; label: string; icon: string }[] = [
    { value: 'REPARAR', label: 'Reparar', icon: 'ti-tool' },
    { value: 'MEJORAR_REPONER', label: 'Mejorar / reponer', icon: 'ti-refresh' },
    { value: 'ACONDICIONAR', label: 'Acondicionar', icon: 'ti-adjustments' },
  ];
  readonly maxHitRows = 10;
  /** La novedad va dirigida a Mecánica: se muestra y exige el bloque SOLICITANTE (A). */
  isMechanicsAssignment = false;

  get mechanicsGroup(): FormGroup {
    return this.novedadForm.get('mechanics') as FormGroup;
  }

  get mountingHits(): FormArray<FormGroup> {
    return this.mechanicsGroup.get('mountingHits') as FormArray<FormGroup>;
  }

  categoriasNovedad = [
    'Parada de Proceso',
    'Reporte de Calidad',
    'Reporte de Ingenieria',
    'Reporte de Material',
    'Reporte Mantenimiento',
    'Reporte Mecanica',
    'Reporte Compras',
    'Seguridad y Salud en Trabajo (SST)',
    'Control de Talento Humano',
  ];

  tiposParada = [
    'Pieza Afectada',
    'Mantenimiento',
    'Calidad',
    'Insidente',
    'Master Produccion',
    'Proceso Produccion',
    'Papeleria Logistica',
    'Falta de Material',
    'Compras',
    'Abastecimiento Logistica'
  ];

  lineasNovedad: string[] = [
    'Sobremesa 1',
    'Sobremesa 2',
    'Cubierta 1',
    'Cubierta 2',
    'Apartamento 1',
    'Apartamento 2',
    'Apartamento 3',
    'Apartamento 4',
    'Exportación USA',
    'Multi Linea'
  ];

  originAreas: ProductionArea[] = [];
  groupedAreas: ProductionAreaGrouped[] = [];
  availableAssignmentAreas: ProductionAreaGrouped[] = [];
  availableAssignmentSubAreas: ProductionSubArea[] = [];

  predictiveList: string[] = [];
  novedadForm!: FormGroup;
  isLineaParada = false;
  /** Aviso cuando el fin quedó "antes" del inicio el mismo día y se asume el día siguiente. */
  stopEndHint = '';
  /** Tiempo total legible de la parada finalizada ('3h 05m'). */
  stopTotalLabel = '';
  isOriginEnsamble = false;
  showDropdown: boolean = false;

  machinesByArea: Machine[] = [];
  predictiveMachineList: Machine[] = [];
  showMachineDropdown: boolean = false;

  isSubmitting: boolean = false;
  private isSelecting: boolean = false;
  private isSelectingMachine: boolean = false;

  constructor() {}

  ngOnInit(): void {
    this.novedadForm = this.fb.group({
      fecha: [this.getCurrentDate(), Validators.required],
      categoriaNovedad: ['', Validators.required],
      originArea: [this.defaultOriginArea, Validators.required],
      originSubArea: [''],
      lineaNovedad: [{ value: '', disabled: true }],
      machineCode: [''],
      machineName: [{ value: '', disabled: true }],
      partCode: [''],
      assignmentArea: ['', Validators.required],
      assignmentSubArea: ['', Validators.required],
      productReference: [''],
      tipoNovedad: [''],
      estadoParada: [{ value: 'ongoing' as StopStatus, disabled: true }],
      horaInicio: [{ value: '', disabled: true }],
      fechaFin: [{ value: '', disabled: true }],
      horaFin: [{ value: '', disabled: true }],
      totalParada: [{ value: '00:00', disabled: true }],
      detalle: ['', [Validators.required, Validators.minLength(50)]],
      projectName: [''],
      mechanics: this.buildMechanicsGroup()
    });
    // Deshabilitado = no cuenta para la validez del formulario hasta que el destino sea Mecánica.
    this.mechanicsGroup.disable({ emitEvent: false });
    this.mechanicsGroup.get('toolCodeNA')?.valueChanges.subscribe((na: boolean) => this.applyToolCodeNA(na));

    this.loadProductionAreas();
    this.setupReferenceSearch();
    this.setupMachineSearch();

    this.novedadForm.get('categoriaNovedad')?.valueChanges.subscribe(value => {
      this.handleCategoriaChange(value);
    });

    this.novedadForm.get('originArea')?.valueChanges.subscribe(value => {
      this.handleOriginAreaChange(value);
    });

    this.novedadForm.get('assignmentArea')?.valueChanges.subscribe(value => {
      this.handleAssignmentAreaChange(value);
    });

    this.novedadForm.get('originSubArea')?.valueChanges.subscribe(() => {
      if (!this.allowSameAreaAssignment) return;
      const assignmentArea = this.novedadForm.get('assignmentArea')?.value;
      if (assignmentArea && assignmentArea === this.novedadForm.get('originArea')?.value) {
        this.handleAssignmentAreaChange(assignmentArea);
      }
    });

    this.novedadForm.get('estadoParada')?.valueChanges.subscribe(() => this.applyStopStatus());
    for (const field of ['fecha', 'horaInicio', 'fechaFin', 'horaFin']) {
      this.novedadForm.get(field)?.valueChanges.subscribe(() => this.calculateTotalParada());
    }

    this.handleCategoriaChange(this.novedadForm.get('categoriaNovedad')?.value);
  }

  private loadProductionAreas(): void {
    this.newsServices.getProductionAreas().subscribe({
      next: (res) => {
        if (res.ok) this.originAreas = res.msg;
      },
      error: (err) => console.error('Error cargando áreas (plano):', err)
    });

    this.newsServices.getProductionAreasGrouped().subscribe({
      next: (res) => {
        if (res.ok) {
          this.groupedAreas = res.msg;
          this.availableAssignmentAreas = res.msg;
          
          if (this.defaultOriginArea) {
             this.handleOriginAreaChange(this.defaultOriginArea);
          }
        }
      },
      error: (err) => console.error('Error cargando áreas (agrupado):', err)
    });
  }

  handleCategoriaChange(value: string): void {
    const inicioControl = this.novedadForm.get('horaInicio');
    const tipoControl = this.novedadForm.get('tipoNovedad');
    const estadoControl = this.novedadForm.get('estadoParada');

    this.isLineaParada = value === 'Parada de Proceso';

    if (this.isLineaParada) {
      inicioControl?.setValidators([Validators.required, Validators.pattern(TIME_24_PATTERN)]);
      tipoControl?.setValidators(Validators.required);
      inicioControl?.enable();
      estadoControl?.enable({ emitEvent: false });
      this.novedadForm.get('totalParada')?.enable();
      tipoControl?.enable();
      // Lo más común es reportar la parada en el momento en que ocurre.
      if (!inicioControl?.value) inicioControl?.setValue(toHHmm(new Date()));
      if (!this.novedadForm.get('totalParada')?.value) {
        this.novedadForm.get('totalParada')?.setValue('00:00');
      }
    } else {
      inicioControl?.clearValidators();
      tipoControl?.clearValidators();
      inicioControl?.disable();
      estadoControl?.disable({ emitEvent: false });
      this.novedadForm.get('totalParada')?.disable();
      tipoControl?.disable();
      inicioControl?.setValue('');
      estadoControl?.setValue('ongoing', { emitEvent: false });
      this.novedadForm.get('totalParada')?.setValue('00:00');
      tipoControl?.setValue('');
    }
    inicioControl?.updateValueAndValidity();
    tipoControl?.updateValueAndValidity();
    // El fin depende de si la parada ya terminó (y solo aplica a paradas); si no aplica, se limpia.
    this.applyStopStatus();
  }

  /** true cuando se reporta una parada que ya terminó (se capturan inicio y fin). */
  get isStopFinished(): boolean {
    return this.isLineaParada && this.novedadForm?.get('estadoParada')?.value === 'finished';
  }

  /**
   * Habilita el fin (fecha + hora) solo si la parada ya terminó. Si sigue detenida,
   * se registra sin fin y queda EN CURSO para finalizarla después.
   */
  private applyStopStatus(): void {
    const finControl = this.novedadForm.get('horaFin');
    const fechaFinControl = this.novedadForm.get('fechaFin');

    if (this.isStopFinished) {
      finControl?.setValidators([Validators.required, Validators.pattern(TIME_24_PATTERN)]);
      fechaFinControl?.setValidators(Validators.required);
      finControl?.enable({ emitEvent: false });
      fechaFinControl?.enable({ emitEvent: false });
      if (!fechaFinControl?.value) {
        fechaFinControl?.setValue(this.novedadForm.get('fecha')?.value || this.getCurrentDate(), { emitEvent: false });
      }
    } else {
      finControl?.clearValidators();
      fechaFinControl?.clearValidators();
      finControl?.setValue('', { emitEvent: false });
      fechaFinControl?.setValue('', { emitEvent: false });
      finControl?.disable({ emitEvent: false });
      fechaFinControl?.disable({ emitEvent: false });
    }
    finControl?.updateValueAndValidity({ emitEvent: false });
    fechaFinControl?.updateValueAndValidity({ emitEvent: false });
    this.calculateTotalParada();
  }

  /** Botón "Ahora" de la hora de inicio. */
  setStartNow(): void {
    this.novedadForm.get('horaInicio')?.setValue(toHHmm(new Date()));
    this.novedadForm.get('horaInicio')?.markAsTouched();
  }

  /** Botón "Ahora" del fin: fecha y hora actuales. */
  setEndNow(): void {
    const now = new Date();
    this.novedadForm.get('fechaFin')?.setValue(toIsoDate(now));
    this.novedadForm.get('horaFin')?.setValue(toHHmm(now));
    this.novedadForm.get('horaFin')?.markAsTouched();
  }

  /** Fecha de la novedad en formato corto para las ayudas del formulario. */
  get stopStartDateLabel(): string {
    return isoToDdMmYyyy(this.novedadForm?.get('fecha')?.value || '');
  }

  /**
   * Rango real de la parada. Si el fin queda antes del inicio con la MISMA fecha
   * (turno nocturno: 22:00 → 06:00), se asume que terminó al día siguiente.
   */
  private resolveStopRange(): { start: Date; end: Date | null; endDate: string; nextDay: boolean } | null {
    const v = this.novedadForm.getRawValue();
    const start = parseStopMoment(isoToDdMmYyyy(v.fecha), v.horaInicio);
    if (!start) return null;
    if (!this.isStopFinished) return { start, end: null, endDate: '', nextDay: false };

    const endIso: string = v.fechaFin || v.fecha;
    let end = parseStopMoment(isoToDdMmYyyy(endIso), v.horaFin);
    let nextDay = false;
    if (end && end <= start && endIso === v.fecha) {
      end = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1, end.getHours(), end.getMinutes());
      nextDay = true;
    }
    return { start, end, endDate: end ? isoToDdMmYyyy(toIsoDate(end)) : '', nextDay };
  }

  /** Error de tiempos de la parada ('' si es válido). */
  get stopTimeError(): string {
    if (!this.isLineaParada) return '';
    const range = this.resolveStopRange();
    if (!range) return '';
    const limit = FUTURE_TOLERANCE_MINUTES;
    if (minutesBetween(new Date(), range.start) > limit) return 'La hora de inicio no puede estar en el futuro. Revise la fecha de la novedad.';
    if (!range.end) return '';
    if (range.end <= range.start) return 'El fin de la parada debe ser posterior al inicio.';
    if (minutesBetween(new Date(), range.end) > limit) return 'La hora de fin no puede estar en el futuro.';
    return '';
  }

  handleOriginAreaChange(area: string): void {
    this.isOriginEnsamble = area === 'Ensamble';
    const lineaControl = this.novedadForm.get('lineaNovedad');
    if (this.isOriginEnsamble) {
      lineaControl?.clearValidators();
      lineaControl?.enable();
    } else {
      lineaControl?.clearValidators();
      lineaControl?.disable();
      lineaControl?.setValue('');
    }
    lineaControl?.updateValueAndValidity();
    this.availableAssignmentAreas = this.allowSameAreaAssignment
      ? this.groupedAreas
      : this.groupedAreas.filter(g => g.area !== area);
    if (!this.allowSameAreaAssignment && this.novedadForm.get('assignmentArea')?.value === area) {
      this.novedadForm.patchValue({ assignmentArea: '', assignmentSubArea: '' });
      this.availableAssignmentSubAreas = [];
    }

    this.novedadForm.get('machineCode')?.setValue('', { emitEvent: false });
    this.novedadForm.get('machineName')?.setValue('', { emitEvent: false });
    this.predictiveMachineList = [];
    this.showMachineDropdown = false;
    this.loadMachinesByArea(area);
  }

  private loadMachinesByArea(area: string): void {
    if (!area) {
      this.machinesByArea = [];
      return;
    }
    this.newsServices.getMachinesByArea({ area: area.toUpperCase() }).subscribe({
      next: (res) => {
        this.machinesByArea = res.ok ? res.msg : [];
      },
      error: (err) => {
        console.error('Error cargando máquinas por área:', err);
        this.machinesByArea = [];
      }
    });
  }

  private setupMachineSearch(): void {
    this.novedadForm.get('machineCode')?.valueChanges
      .pipe(
        debounceTime(200),
        filter(() => !this.isSelectingMachine)
      )
      .subscribe((term: string) => {
        const t = (term || '').toString().trim().toLowerCase();
        if (t.length < 1) {
          this.predictiveMachineList = [];
          this.showMachineDropdown = false;
          this.novedadForm.get('machineName')?.setValue('', { emitEvent: false });
          return;
        }
        this.predictiveMachineList = this.machinesByArea
          .filter(m =>
            (m.machineCode || '').toLowerCase().includes(t) ||
            (m.machineName || '').toLowerCase().includes(t)
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
    const name = this.resolveMachineName(machine);
    this.novedadForm.get('machineCode')?.setValue(machine.machineCode, { emitEvent: false });
    this.novedadForm.get('machineName')?.setValue(name, { emitEvent: false });
    this.predictiveMachineList = [];
    this.showMachineDropdown = false;
    setTimeout(() => this.isSelectingMachine = false, 300);
  }

  onMachineBlur(): void {
    setTimeout(() => this.showMachineDropdown = false, 120);
  }

  onMachineFocus(): void {
    if (this.isSelectingMachine) return;
    if (this.predictiveMachineList.length > 0) this.showMachineDropdown = true;
  }

  handleAssignmentAreaChange(area: string): void {
    const group = this.groupedAreas.find(g => g.area === area);
    const subAreas = group ? group.subAreas : [];
    // Misma área origen y destino: la sub-área destino no puede ser la misma que reporta.
    const originSubArea = this.novedadForm.get('originSubArea')?.value;
    this.availableAssignmentSubAreas =
      this.allowSameAreaAssignment && area === this.novedadForm.get('originArea')?.value && originSubArea
        ? subAreas.filter(s => s.subArea !== originSubArea)
        : subAreas;
    this.novedadForm.get('assignmentSubArea')?.setValue('');
    this.setMechanicsBlock(isMechanicsArea(area));
  }

  // ---------------- SOLICITANTE (A) — Mecánica ----------------

  private buildMechanicsGroup(): FormGroup {
    return this.fb.group(
      {
        toolName: ['', [Validators.required, Validators.maxLength(150)]],
        toolCode: ['', [Validators.required, Validators.maxLength(60)]],
        toolCodeNA: [false],
        operationNumber: ['', [Validators.required, Validators.pattern(/^\d+$/), Validators.min(1)]],
        operationTotal: ['', [Validators.required, Validators.pattern(/^\d+$/), Validators.min(1)]],
        operationDescription: ['', [Validators.required, Validators.maxLength(300)]],
        requestedWork: ['', Validators.required],
        mountingHits: this.fb.array([this.buildHitRow()]),
      },
      { validators: operationRangeValidator },
    );
  }

  private buildHitRow(): FormGroup {
    return this.fb.group({
      hits: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      date: [this.getCurrentDate(), Validators.required],
    });
  }

  /** Muestra/oculta el bloque y activa/desactiva sus validaciones. */
  private setMechanicsBlock(active: boolean): void {
    this.isMechanicsAssignment = active;
    if (active) {
      this.mechanicsGroup.enable({ emitEvent: false });
      this.applyToolCodeNA(!!this.mechanicsGroup.get('toolCodeNA')?.value);
    } else {
      this.mechanicsGroup.disable({ emitEvent: false });
    }
  }

  /** Cód. Htal "No aplica": fija 'N/A' y bloquea el campo. */
  private applyToolCodeNA(na: boolean): void {
    const code = this.mechanicsGroup.get('toolCode');
    if (!code || !this.isMechanicsAssignment) return;
    if (na) {
      code.setValue('N/A', { emitEvent: false });
      code.disable({ emitEvent: false });
    } else {
      if (code.value === 'N/A') code.setValue('', { emitEvent: false });
      code.enable({ emitEvent: false });
    }
  }

  setRequestedWork(value: MechanicsRequestedWork): void {
    const ctrl = this.mechanicsGroup.get('requestedWork');
    ctrl?.setValue(value);
    ctrl?.markAsTouched();
  }

  addHitRow(): void {
    if (this.mountingHits.length >= this.maxHitRows) return;
    this.mountingHits.push(this.buildHitRow());
  }

  removeHitRow(index: number): void {
    if (this.mountingHits.length <= 1) return;
    this.mountingHits.removeAt(index);
  }

  isMechInvalid(path: string): boolean {
    const control = this.mechanicsGroup.get(path);
    return !!control && control.enabled && control.invalid && (control.dirty || control.touched);
  }

  get operationRangeError(): boolean {
    const g = this.mechanicsGroup;
    return !!g.errors?.['operationRange'] && (!!g.get('operationNumber')?.touched || !!g.get('operationTotal')?.touched);
  }

  /** Payload del bloque para el backend (fechas en DD/MM/YYYY). */
  private buildMechanicsPayload(): NewsMechanicsRequest {
    const v = this.mechanicsGroup.getRawValue();
    return {
      toolName: String(v.toolName || '').trim(),
      toolCode: v.toolCodeNA ? 'N/A' : String(v.toolCode || '').trim(),
      operationNumber: String(v.operationNumber || '').trim(),
      operationTotal: String(v.operationTotal || '').trim(),
      operationDescription: String(v.operationDescription || '').trim(),
      requestedWork: v.requestedWork,
      mountingHits: (v.mountingHits as { hits: string; date: string }[]).map((h) => ({
        hits: Number(h.hits),
        date: isoToDdMmYyyy(h.date),
      })),
    };
  }

  private resetMechanicsBlock(): void {
    while (this.mountingHits.length > 1) this.mountingHits.removeAt(1);
    this.mechanicsGroup.reset({
      toolName: '',
      toolCode: '',
      toolCodeNA: false,
      operationNumber: '',
      operationTotal: '',
      operationDescription: '',
      requestedWork: '',
      mountingHits: [{ hits: '', date: this.getCurrentDate() }],
    }, { emitEvent: false });
    this.setMechanicsBlock(false);
  }

  get originSubAreas(): string[] {
    const area = this.novedadForm?.get('originArea')?.value;
    if (!area) return [];
    return [...new Set(this.originAreas.filter(a => a.area === area).map(a => a.subArea))];
  }

  getCurrentDate(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /** Total de la parada (HH:mm) considerando fecha de inicio y fecha de fin (varios días). */
  calculateTotalParada(): void {
    const range = this.resolveStopRange();
    const minutes = range?.end && range.end > range.start ? minutesBetween(range.start, range.end) : 0;
    this.stopEndHint = range?.nextDay && range.end
      ? `Se asume que terminó al día siguiente (${range.endDate.slice(0, 5)}).`
      : '';
    this.stopTotalLabel = minutes > 0 ? formatDurationLabel(minutes) : '';
    this.novedadForm.get('totalParada')?.setValue(formatStopTotal(minutes), { emitEvent: false });
  }

  onSubmit(): void {
    if (this.novedadForm.invalid) {
      this.novedadForm.markAllAsTouched();
      this.toastr.warning('Revise los campos obligatorios del formulario', 'Atención');
      return;
    }

    const formValues = this.novedadForm.getRawValue();

    // Proyecto opcional: si tiene nombre, el responsable es obligatorio (y viceversa).
    const projectName = (formValues.projectName || '').toString().trim();
    if (projectName && !this.projectResponsible) {
      this.responsibleTouched = true;
      this.toastr.warning('Seleccione la persona responsable del proyecto.', 'Proyecto');
      return;
    }
    if (!projectName && this.projectResponsible) {
      this.toastr.warning('Indique el nombre del proyecto o quite el responsable.', 'Proyecto');
      return;
    }

    const [year, month, day] = formValues.fecha.split('-');
    const newsDate = `${day}/${month}/${year}`;

    const machineCode = (formValues.machineCode || '').toString().trim();
    const machineName = (formValues.machineName || '').toString().trim();
    const partCode = (formValues.partCode || '').toString().trim();

    const request: ProductionNewsRequest = {
      newsDate,
      category: formValues.categoriaNovedad,
      reference: formValues.productReference,
      detail: formValues.detalle,
      reportedBy: { userApp: 'system-form', area: formValues.originArea, subArea: formValues.originSubArea || '' },
      origin: {
        area: formValues.originArea,
        subArea: formValues.originSubArea || '',
        location: this.isOriginEnsamble ? (formValues.lineaNovedad || '') : '',
        ...(machineCode ? { machine: { code: machineCode, name: machineName || 'Definir Nombre' } } : {}),
        ...(partCode ? { part: { code: partCode, name: '' } } : {})
      },
      assignment: { currentArea: formValues.assignmentArea, currentSubArea: formValues.assignmentSubArea || '' },
      ...(projectName && this.projectResponsible
        ? {
            project: {
              name: projectName,
              responsible: { document: this.projectResponsible.document, fullName: this.projectResponsible.fullName }
            }
          }
        : {}),
      ...(this.isMechanicsAssignment ? { mechanicsRequest: this.buildMechanicsPayload() } : {})
    };

    const isOngoingStop = this.isLineaParada && !this.isStopFinished;
    if (this.isLineaParada) {
      if (this.stopTimeError) {
        this.toastr.warning(this.stopTimeError, 'Revise los tiempos de la parada');
        return;
      }
      // Parada en curso: sin fin ni total; el backend la marca isOngoing y se finaliza después.
      const range = this.resolveStopRange();
      request.stop = isOngoingStop
        ? { stopType: formValues.tipoNovedad, startTime: formValues.horaInicio, endTime: '', totalTime: '' }
        : {
            stopType: formValues.tipoNovedad,
            startTime: formValues.horaInicio,
            endDate: range?.endDate || '',
            endTime: formValues.horaFin,
            totalTime: formValues.totalParada
          };
    }

    const validation = this.newsServices.validateProductionNews(request);
    if (!validation.valid) {
      this.toastr.warning(validation.errors.join('. '), 'Datos incompletos');
      return;
    }

    this.isSubmitting = true;
    this.newsServices.createProductionNews(request).subscribe({
      next: (response: ProductionNewsResponse) => {
        this.isSubmitting = false;
        if (!response?.ok) {
          const tokenError = response?.tokenError ? ` (${response.tokenError})` : '';
          const errorMsg = (response?.msg || 'Error al registrar la novedad') + tokenError;
          this.toastr.error(errorMsg, 'Error al registrar');
          return;
        }
        const createdId = response.data?._id || '';
        const successMsg = createdId
          ? `${response.msg} (ID: ${createdId})`
          : response.msg;
        this.toastr.success(successMsg, 'Novedad registrada');
        if (isOngoingStop) {
          this.toastr.info('La parada quedó EN CURSO. Registre la hora de fin en "Paradas en curso" cuando se resuelva.', 'Parada en curso');
          this.ongoingStops?.refresh();
        }
        this.resetForm();
      },
      error: (error) => {
        this.isSubmitting = false;
        this.toastr.error(error?.message || 'Error al registrar la novedad', 'Fallo de conexión');
      }
    });
  }

  private resetForm(): void {
    this.novedadForm.reset({
      fecha: this.getCurrentDate(),
      categoriaNovedad: '',
      originArea: this.defaultOriginArea,
      originSubArea: '',
      lineaNovedad: '',
      machineCode: '',
      machineName: '',
      partCode: '',
      assignmentArea: '',
      assignmentSubArea: '',
      productReference: '',
      tipoNovedad: '',
      estadoParada: 'ongoing',
      horaInicio: '',
      fechaFin: '',
      horaFin: '',
      totalParada: '00:00',
      detalle: '',
      projectName: ''
    });
    this.resetMechanicsBlock();
    this.projectResponsible = null;
    this.responsibleSearch = '';
    this.responsibleTouched = false;
    this.predictiveList = [];
    this.showDropdown = false;
    this.predictiveMachineList = [];
    this.showMachineDropdown = false;
    if (this.defaultOriginArea) this.handleOriginAreaChange(this.defaultOriginArea);
  }

  isFieldInvalid(field: string): boolean | undefined {
    const control = this.novedadForm.get(field);
    return control?.invalid && (control?.dirty || control?.touched);
  }

  setupReferenceSearch(): void {
    this.novedadForm.get('productReference')?.valueChanges
      .pipe(
        debounceTime(300),
        filter(() => !this.isSelecting),
        tap((term: string) => {
          if (term.trim().length < 2) { this.predictiveList = []; this.showDropdown = false; }
        }),
        filter((term: string) => term.trim().length >= 2),
        switchMap((term: string) => this.dashboardService.searchReferences(term.trim()))
      )
      .subscribe({
        next: (response) => {
          if (response.ok && response.msg.length > 0) {
            this.predictiveList = Array.from(new Set(response.msg.map((p: any) => (p.reference || '').trim()).filter((ref: string) => ref)));
            this.showDropdown = true;
          } else {
            this.predictiveList = [];
            this.showDropdown = false;
          }
        },
        error: () => { this.predictiveList = []; this.showDropdown = false; }
      });
  }

  selectReference(item: string): void {
    this.isSelecting = true;
    this.predictiveList = [];
    this.showDropdown = false;
    this.novedadForm.get('productReference')?.setValue(item, { emitEvent: false });
    setTimeout(() => this.isSelecting = false, 400);
  }

  onBlur(): void { setTimeout(() => this.showDropdown = false, 120); }
  onFocus(): void {
    if (this.isSelecting) return;
    const term = (this.novedadForm.get('productReference')?.value || '').trim();
    if (this.predictiveList.length > 0 && term.length >= 2) this.showDropdown = true;
  }
}