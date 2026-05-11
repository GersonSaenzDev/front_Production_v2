// app/production/assembly/production-news/production-news.ts
import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, filter, switchMap, tap } from 'rxjs';
import { ReferenceItem } from '../../../interfaces/assembly.interface';
import {
  ProductionArea,
  ProductionAreaGrouped,
  ProductionNewsRequest,
  ProductionSubArea
} from '../../../interfaces/production-news.interface';
import { DashboardServices } from '../../../services/dashboard-services';
import { NewsServices } from '../../../services/news-services';

@Component({
  selector: 'app-production-news',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './production-news.html',
  styleUrl: './production-news.scss'
})
export class ProductionNews implements OnInit {

  private dashboardService = inject(DashboardServices);
  private fb = inject(FormBuilder);
  private newsServices = inject(NewsServices);

  categoriasNovedad = [
    'Parada de Línea',
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

  isSubmitting: boolean = false;
  submitSuccess: boolean = false;
  submitError: string = '';
  successMessage: string = '';
  private isSelecting: boolean = false;

  constructor() {}

  ngOnInit(): void {
    this.novedadForm = this.fb.group({
      fecha: [this.getCurrentDate(), Validators.required],
      categoriaNovedad: ['', Validators.required],
      originArea: ['', Validators.required],
      originSubArea: [''],
      lineaNovedad: [{ value: '', disabled: true }],
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
        }
      },
      error: (err) => console.error('Error cargando áreas (agrupado):', err)
    });
  }

  handleCategoriaChange(value: string): void {
    const inicioControl = this.novedadForm.get('horaInicio');
    const finControl = this.novedadForm.get('horaFin');
    const tipoControl = this.novedadForm.get('tipoNovedad');

    this.isLineaParada = value === 'Parada de Línea';

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

  /**
   * Cuando cambia el área que reporta:
   * - Si es "Ensamble", habilita el select de línea (Sobremesa, Apartamento, etc.).
   * - Filtra del listado de áreas destino para que no pueda asignarse a la misma área padre.
   */
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
  }

  /**
   * Cuando cambia el área destino, refresca las sub-áreas disponibles.
   */
  handleAssignmentAreaChange(area: string): void {
    const group = this.groupedAreas.find(g => g.area === area);
    this.availableAssignmentSubAreas = group ? group.subAreas : [];
    this.novedadForm.get('assignmentSubArea')?.setValue('');
  }

  /**
   * Sub-áreas únicas del área que reporta (para el select de origin.subArea).
   */
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

      if (totalMinutosFin < totalMinutosInicio) {
        totalMinutosFin += 24 * 60;
      }

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
    this.submitSuccess = false;
    this.submitError = '';

    if (this.novedadForm.invalid) {
      console.error('El formulario no es válido. Revise los campos obligatorios.');
      this.novedadForm.markAllAsTouched();
      return;
    }

    const formValues = this.novedadForm.getRawValue();
    const newsData: ProductionNewsRequest = this.transformFormToRequest(formValues);

    const validation = this.newsServices.validateProductionNews(newsData);
    if (!validation.valid) {
      console.error('Errores de validación:', validation.errors);
      this.submitError = validation.errors.join(', ');
      return;
    }

    this.isSubmitting = true;
    this.newsServices.createProductionNews(newsData).subscribe({
      next: (response) => {
        this.isSubmitting = false;
        this.submitSuccess = true;
        this.successMessage = response.msg;

        setTimeout(() => {
          this.resetForm();
          this.submitSuccess = false;
          this.successMessage = '';
        }, 3000);
      },
      error: (error) => {
        console.error('Error al enviar novedad:', error);
        this.isSubmitting = false;
        this.submitError = error.message || 'Error desconocido al registrar la novedad';

        setTimeout(() => {
          this.submitError = '';
        }, 5000);
      }
    });
  }

  private transformFormToRequest(formValues: any): ProductionNewsRequest {
    const [year, month, day] = formValues.fecha.split('-');
    const newsDate = `${day}/${month}/${year}`;

    const request: ProductionNewsRequest = {
      newsDate,
      category: formValues.categoriaNovedad,
      reference: formValues.productReference,
      detail: formValues.detalle,
      reportedBy: {
        userApp: 'system-form',
        area: formValues.originArea,
        subArea: formValues.originSubArea || ''
      },
      origin: {
        area: formValues.originArea,
        subArea: formValues.originSubArea || '',
        location: this.isOriginEnsamble ? (formValues.lineaNovedad || '') : ''
      },
      assignment: {
        currentArea: formValues.assignmentArea,
        currentSubArea: formValues.assignmentSubArea || ''
      }
    };

    if (this.isLineaParada) {
      request.stop = {
        stopType: formValues.tipoNovedad,
        startTime: formValues.horaInicio,
        endTime: formValues.horaFin,
        totalTime: formValues.totalParada
      };
    }

    return request;
  }

  private resetForm(): void {
    this.novedadForm.reset({
      fecha: this.getCurrentDate(),
      categoriaNovedad: '',
      originArea: '',
      originSubArea: '',
      lineaNovedad: '',
      assignmentArea: '',
      assignmentSubArea: '',
      productReference: '',
      tipoNovedad: '',
      horaInicio: '',
      horaFin: '',
      totalParada: '00:00',
      detalle: ''
    });

    this.novedadForm.markAsUntouched();
    this.novedadForm.markAsPristine();
    this.predictiveList = [];
    this.showDropdown = false;
    this.availableAssignmentAreas = this.groupedAreas;
    this.availableAssignmentSubAreas = [];
    this.isOriginEnsamble = false;
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
          const trimmedTerm = term.trim();
          if (trimmedTerm.length < 2) {
            this.predictiveList = [];
            this.showDropdown = false;
          }
        }),
        filter((term: string) => term.trim().length >= 2),
        switchMap((term: string) => this.dashboardService.searchReferences(term.trim()))
      )
      .subscribe({
        next: (response) => {
          if (response.ok && response.msg.length > 0) {
            this.predictiveList = this.extractPredictiveValues(response.msg);
            this.showDropdown = true;
          } else {
            this.predictiveList = [];
            this.showDropdown = false;
          }
        },
        error: () => {
          this.predictiveList = [];
          this.showDropdown = false;
        }
      });
  }

  extractPredictiveValues(items: ReferenceItem[]): string[] {
    const list = new Set<string>();
    for (const p of items) {
      const ref = (p.reference || '').trim();
      if (ref) list.add(ref);
    }
    return Array.from(list);
  }

  selectReference(item: string): void {
    this.isSelecting = true;
    this.predictiveList = [];
    this.showDropdown = false;
    this.novedadForm.get('productReference')?.setValue(item, { emitEvent: false });
    this.novedadForm.get('productReference')?.updateValueAndValidity();
    setTimeout(() => {
      this.isSelecting = false;
    }, 400);
    setTimeout(() => {
      document.getElementById('originArea')?.focus();
    }, 50);
  }

  onBlur(): void {
    setTimeout(() => {
      this.showDropdown = false;
      this.predictiveList = [];
    }, 120);
  }

  onFocus(): void {
    if (this.isSelecting) {
      return;
    }
    const term = (this.novedadForm.get('productReference')?.value || '').trim();
    if (this.predictiveList.length > 0 && term.length >= 2) {
      this.showDropdown = true;
    }
  }
}
