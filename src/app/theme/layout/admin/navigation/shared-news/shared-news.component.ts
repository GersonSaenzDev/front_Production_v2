// src/app/theme/layout/admin/navigation/shared-news/shared-news.component.ts
import { CommonModule } from '@angular/common';
import { Component, inject, Input, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { debounceTime, filter, switchMap, tap } from 'rxjs';
import {
  Machine,
  ProductionArea,
  ProductionAreaGrouped,
  ProductionNewsRequest,
  ProductionNewsResponse,
  ProductionSubArea
} from '../../../../../interfaces/production-news.interface';
import { AuthService } from '../../../../../services/auth-services';
import { DashboardServices } from '../../../../../services/dashboard-services';
import { NewsServices } from '../../../../../services/news-services';
import { displayArea } from '../area-display.util';

@Component({
  selector: 'app-shared-news',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './shared-news.component.html',
  styleUrls: ['./shared-news.component.scss']
})
export class SharedNewsComponent implements OnInit {
  @Input() title: string = '';
  @Input() subtitle: string = '';
  @Input() defaultOriginArea: string = '';

  private authService = inject(AuthService);
  private dashboardService = inject(DashboardServices);
  private fb = inject(FormBuilder);
  private newsServices = inject(NewsServices);
  private toastr = inject(ToastrService);

  get userArea(): string {
    return this.authService.userData()?.area || this.defaultOriginArea || '';
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
      productReference: ['', Validators.required],
      tipoNovedad: [''],
      horaInicio: [{ value: '', disabled: true }],
      horaFin: [{ value: '', disabled: true }],
      totalParada: [{ value: '00:00', disabled: true }],
      detalle: ['', [Validators.required, Validators.minLength(50)]]
    });

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

    this.novedadForm.get('horaInicio')?.valueChanges.subscribe(() => this.calculateTotalParada());
    this.novedadForm.get('horaFin')?.valueChanges.subscribe(() => this.calculateTotalParada());

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
    const finControl = this.novedadForm.get('horaFin');
    const tipoControl = this.novedadForm.get('tipoNovedad');

    this.isLineaParada = value === 'Parada de Proceso';

    if (this.isLineaParada) {
      inicioControl?.setValidators(Validators.required);
      finControl?.setValidators(Validators.required);
      tipoControl?.setValidators(Validators.required);
      inicioControl?.enable();
      finControl?.enable();
      this.novedadForm.get('totalParada')?.enable();
      tipoControl?.enable();
      if (!this.novedadForm.get('totalParada')?.value) {
        this.novedadForm.get('totalParada')?.setValue('00:00');
      }
    } else {
      inicioControl?.clearValidators();
      finControl?.clearValidators();
      tipoControl?.clearValidators();
      inicioControl?.disable();
      finControl?.disable();
      this.novedadForm.get('totalParada')?.disable();
      tipoControl?.disable();
      inicioControl?.setValue('');
      finControl?.setValue('');
      this.novedadForm.get('totalParada')?.setValue('00:00');
      tipoControl?.setValue('');
    }
    inicioControl?.updateValueAndValidity();
    finControl?.updateValueAndValidity();
    tipoControl?.updateValueAndValidity();
  }

  handleOriginAreaChange(area: string): void {
    this.isOriginEnsamble = area === 'Ensamble';
    const lineaControl = this.novedadForm.get('lineaNovedad');
    if (this.isOriginEnsamble) {
      lineaControl?.setValidators(Validators.required);
      lineaControl?.enable();
    } else {
      lineaControl?.clearValidators();
      lineaControl?.disable();
      lineaControl?.setValue('');
    }
    lineaControl?.updateValueAndValidity();
    this.availableAssignmentAreas = this.groupedAreas.filter(g => g.area !== area);
    if (this.novedadForm.get('assignmentArea')?.value === area) {
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
    this.availableAssignmentSubAreas = group ? group.subAreas : [];
    this.novedadForm.get('assignmentSubArea')?.setValue('');
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

  calculateTotalParada(): void {
    const inicio = this.novedadForm.get('horaInicio')?.value;
    const fin = this.novedadForm.get('horaFin')?.value;
    if (inicio && fin) {
      const [hInicio, mInicio] = inicio.split(':').map(Number);
      const [hFin, mFin] = fin.split(':').map(Number);
      const totalMinutosInicio = hInicio * 60 + mInicio;
      let totalMinutosFin = hFin * 60 + mFin;
      if (totalMinutosFin < totalMinutosInicio) totalMinutosFin += 24 * 60;
      const diferenciaMinutos = totalMinutosFin - totalMinutosInicio;
      const horas = Math.floor(diferenciaMinutos / 60);
      const minutos = diferenciaMinutos % 60;
      const totalParada = `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
      this.novedadForm.get('totalParada')?.setValue(totalParada);
    } else {
      this.novedadForm.get('totalParada')?.setValue('00:00');
    }
  }

  onSubmit(): void {
    if (this.novedadForm.invalid) {
      this.novedadForm.markAllAsTouched();
      this.toastr.warning('Revise los campos obligatorios del formulario', 'Atención');
      return;
    }

    const formValues = this.novedadForm.getRawValue();
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
      assignment: { currentArea: formValues.assignmentArea, currentSubArea: formValues.assignmentSubArea || '' }
    };

    if (this.isLineaParada) {
      request.stop = { stopType: formValues.tipoNovedad, startTime: formValues.horaInicio, endTime: formValues.horaFin, totalTime: formValues.totalParada };
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
      horaInicio: '',
      horaFin: '',
      totalParada: '00:00',
      detalle: ''
    });
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