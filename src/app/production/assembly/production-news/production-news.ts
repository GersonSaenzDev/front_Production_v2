// app/production/assembly/production-news/production-news.ts
import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, filter, switchMap, tap } from 'rxjs';
import { ReferenceItem } from 'src/app/interfaces/assembly.interface';
import { ProductionNewsRequest } from 'src/app/interfaces/production-news.interface';
import { DashboardServices } from 'src/app/services/dashboard-services';
import { NewsServices } from 'src/app/services/news-services';

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
    'Reporte Material', 
    'Reporte Mantenimiento'
  ];
  
  tiposParada = [
    'Eléctrica',
    'Mecánica',
    'Mantenimiento',
    'Calidad',
    'Insidente',
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
    
  predictiveList: string[] = [];
  novedadForm!: FormGroup;
  isLineaParada = false;
  showDropdown: boolean = false;

  // 💡 NUEVO: Estados para feedback visual
  isSubmitting: boolean = false;
  submitSuccess: boolean = false;
  submitError: string = '';
  successMessage: string = '';

  constructor() {}

  ngOnInit(): void {
    this.novedadForm = this.fb.group({
      fecha: [this.getCurrentDate(), Validators.required],
      categoriaNovedad: ['', Validators.required], 
      lineaNovedad: ['', Validators.required],
      productReference: ['', Validators.required], 
      tipoNovedad: [''], 
      horaInicio: [{ value: '', disabled: true }], 
      horaFin: [{ value: '', disabled: true }], 
      totalParada: [{ value: '00:00', disabled: true }], 
      detalle: ['', [Validators.required, Validators.minLength(10)]]
    });

    this.setupReferenceSearch();

    this.novedadForm.get('categoriaNovedad')?.valueChanges.subscribe(value => {
      this.handleCategoriaChange(value);
    });
    
    this.novedadForm.get('horaInicio')?.valueChanges.subscribe(() => this.calculateTotalParada());
    this.novedadForm.get('horaFin')?.valueChanges.subscribe(() => this.calculateTotalParada());
    
    this.handleCategoriaChange(this.novedadForm.get('categoriaNovedad')?.value);
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

  /**
   * 💡 MÉTODO PRINCIPAL: Envía la novedad al backend
   */
  onSubmit(): void {
    // Resetear estados de feedback
    this.submitSuccess = false;
    this.submitError = '';

    if (this.novedadForm.invalid) {
      console.error('El formulario no es válido. Revise los campos obligatorios.');
      this.novedadForm.markAllAsTouched();
      return;
    }

    // 1. Obtener valores del formulario (incluyendo los disabled)
    const formValues = this.novedadForm.getRawValue();

    // 2. Transformar al formato del backend
    const newsData: ProductionNewsRequest = this.transformFormToRequest(formValues);

    // 3. Validar antes de enviar
    const validation = this.newsServices.validateProductionNews(newsData);
    if (!validation.valid) {
      console.error('❌ Errores de validación:', validation.errors);
      this.submitError = validation.errors.join(', ');
      return;
    }

    // 4. Enviar al backend
    this.isSubmitting = true;
    this.newsServices.createProductionNews(newsData).subscribe({
      next: (response) => {
        this.isSubmitting = false;
        this.submitSuccess = true;
        this.successMessage = response.msg; // 💡 NUEVO: Captura el mensaje del backend
        
        // Resetear el formulario después de 3 segundos
        setTimeout(() => {
          this.resetForm();
          this.submitSuccess = false;
          this.successMessage = '';
        }, 3000);
      },
      error: (error) => {
        console.error('❌ Error al enviar novedad:', error);
        this.isSubmitting = false;
        this.submitError = error.message || 'Error desconocido al registrar la novedad';
        
        // Limpiar el mensaje de error después de 5 segundos
        setTimeout(() => {
          this.submitError = '';
        }, 5000);
      }
    });
  }

  /**
   * 💡 NUEVO: Transforma los datos del formulario al formato del backend
   */
  private transformFormToRequest(formValues: any): ProductionNewsRequest {
    // Convertir fecha de YYYY-MM-DD a DD/MM/YYYY
    const [year, month, day] = formValues.fecha.split('-');
    const newsDate = `${day}/${month}/${year}`;

    const request: ProductionNewsRequest = {
      newsDate: newsDate,
      category: formValues.categoriaNovedad,
      assemblyLine: formValues.lineaNovedad,
      reference: formValues.productReference,
      detail: formValues.detalle
    };

    // Agregar campos opcionales solo si están presentes
    if (this.isLineaParada) {
      request.stopType = formValues.tipoNovedad;
      request.startTime = formValues.horaInicio;
      request.endTime = formValues.horaFin;
      request.totalTime = formValues.totalParada;
    }

    return request;
  }

  /**
   * 💡 NUEVO: Resetea el formulario a su estado inicial
   */
  private resetForm(): void {
    this.novedadForm.reset({
      fecha: this.getCurrentDate(),
      categoriaNovedad: '',
      lineaNovedad: '',
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
  }

  isFieldInvalid(field: string): boolean | undefined {
    const control = this.novedadForm.get(field);
    return control?.invalid && (control?.dirty || control?.touched);
  }

  setupReferenceSearch(): void {
    this.novedadForm.get('productReference')?.valueChanges
      .pipe(
        debounceTime(300), 
        tap((term: string) => {
          const trimmedTerm = term.trim();
          console.log('--- BÚSQUEDA PREDICTIVA ---');
          console.log('Término capturado:', trimmedTerm);
          
          if (trimmedTerm.length < 2) {
            this.predictiveList = []; 
            if (trimmedTerm.length === 0) {
              console.log('Término vacío. Búsqueda detenida.');
            } else {
              console.log('Término < 2 caracteres. Esperando más input.');
            }
          }
        }),
        filter((term: string) => term.trim().length >= 2),
        switchMap((term: string) => {
          console.log('ENVIANDO al servicio:', term.trim());
          return this.dashboardService.searchReferences(term.trim());
        })
      )
      .subscribe({
        next: (response) => {
          console.log('RESPUESTA DEL BACKEND:', response.ok, response.msg.length);
          
          if (response.ok && response.msg.length > 0) {
            this.predictiveList = this.extractPredictiveValues(response.msg);
            this.showDropdown = true; // <- encender dropdown
            console.log('Lista predictiva actualizada con', this.predictiveList, 'ítems.');
          } else {
            this.predictiveList = [];
            this.showDropdown = false; // <- apagar dropdown al no haber resultados
            console.log('Respuesta válida, pero sin resultados.');
          }
        },
        error: (err) => {
          console.error('Error FATAL en la llamada al servicio searchReferences:', err);
          this.predictiveList = [];
          this.showDropdown = false;
        }
      });
  }

  extractPredictiveValues(items: ReferenceItem[]): string[] {
    const list = new Set<string>();
    items.forEach(p => {
      list.add(p.reference);
    });
    return Array.from(list);
  }

  selectReference(item: string): void {
    this.novedadForm.get('productReference')?.setValue(item, { emitEvent: false });
    this.predictiveList = []; 
    this.showDropdown = false; 
    this.novedadForm.get('productReference')?.updateValueAndValidity();
    document.getElementById('lineaNovedad')?.focus(); 
  }

  onBlur(): void {
    setTimeout(() => {
      this.showDropdown = false;
      if (this.predictiveList.length > 0) {
        this.predictiveList = [];
      }
    }, 150); 
  }
  
  onFocus(): void {
    const term = this.novedadForm.get('productReference')?.value || '';
    if (this.predictiveList.length > 0 && term.trim().length >= 2) {
      this.showDropdown = true;
    }
  }
}