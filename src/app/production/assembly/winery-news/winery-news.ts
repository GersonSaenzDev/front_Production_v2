// app/production/assembly/winery-news/winery-news.ts
import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, filter, switchMap, tap } from 'rxjs/operators'; 
import { ReferenceItem } from 'src/app/interfaces/assembly.interface';
import { WarehouseNewsRequest } from 'src/app/interfaces/production-news.interface';
import { DashboardServices } from 'src/app/services/dashboard-services';
import { NewsServices } from 'src/app/services/news-services';

@Component({
  selector: 'app-winery-news',
  standalone: true, 
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './winery-news.html',
  styleUrl: './winery-news.scss'
})
export class WineryNews implements OnInit {

  private dashboardService = inject(DashboardServices);
  private fb = inject(FormBuilder);
  private newsServices = inject(NewsServices);
  
  tiposNovedad = [
    'Calidad en Producto', 
    'Producto Incompleto', 
    'Producto Sin Identificar', 
    'Error de Papeleria',
  ];
  
  predictiveList: string[] = [];
  wineryNewsForm!: FormGroup;
  showDropdown: boolean = false; 

  // 🔥 NUEVA BANDERA DE CONTROL
  private isSelecting: boolean = false;

  isSubmitting: boolean = false;
  submitSuccess: boolean = false;
  submitError: string = '';
  successMessage: string = '';

  constructor() {}

  ngOnInit(): void {
    this.wineryNewsForm = this.fb.group({
      fechaNovedad: [this.getCurrentDate(), Validators.required],
      tipoNovedad: ['', Validators.required], 
      productReference: ['', Validators.required], 
      cantidadProducto: [null, [Validators.required, Validators.min(1)]],
      detalleNovedad: ['', [Validators.required, Validators.minLength(10)]]
    });

    this.setupReferenceSearch();
  }

  getCurrentDate(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  onSubmit(): void {
    this.submitSuccess = false;
    this.submitError = '';
    this.successMessage = '';

    if (this.wineryNewsForm.invalid) {
      console.error('El formulario no es válido. Revise los campos obligatorios.');
      this.wineryNewsForm.markAllAsTouched();
      return;
    }

    const formValues = this.wineryNewsForm.getRawValue();
    const newsData: WarehouseNewsRequest = this.transformFormToRequest(formValues);

    const validation = this.newsServices.validateWarehouseNews(newsData);
    if (!validation.valid) {
      console.error('❌ Errores de validación:', validation.errors);
      this.submitError = validation.errors.join(', ');
      return;
    }

    this.isSubmitting = true;
    this.newsServices.createWarehouseNews(newsData).subscribe({
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
        console.error('❌ Error al enviar novedad de bodega:', error);
        this.isSubmitting = false;
        this.submitError = error.message || 'Error desconocido al registrar la novedad de bodega';
        
        setTimeout(() => {
          this.submitError = '';
        }, 5000);
      }
    });
  }

  private transformFormToRequest(formValues: any): WarehouseNewsRequest {
    const [year, month, day] = formValues.fechaNovedad.split('-');
    const newsDate = `${day}/${month}/${year}`;

    const request: WarehouseNewsRequest = {
      newsDate: newsDate,
      category: formValues.tipoNovedad,
      reference: formValues.productReference,
      reportedAmount: formValues.cantidadProducto.toString(),
      description: formValues.detalleNovedad
    };

    return request;
  }

  private resetForm(): void {
    this.wineryNewsForm.reset({
      fechaNovedad: this.getCurrentDate(),
      tipoNovedad: '',
      productReference: '',
      cantidadProducto: null,
      detalleNovedad: ''
    });
    
    this.wineryNewsForm.markAsUntouched();
    this.wineryNewsForm.markAsPristine();
    this.predictiveList = [];
    this.showDropdown = false;
  }

  isFieldInvalid(field: string): boolean | undefined {
    const control = this.wineryNewsForm.get(field);
    return control?.invalid && (control?.dirty || control?.touched);
  }
  
  // --- 🔥 LÓGICA DEL AUTOCOMPLETE CON BANDERA DE CONTROL ---

  setupReferenceSearch(): void {
    this.wineryNewsForm.get('productReference')?.valueChanges
      .pipe(
        debounceTime(300),
        // 🔥 FILTRO CRÍTICO: Ignorar cambios durante la selección
        filter(() => !this.isSelecting),
        tap((term: string) => {
          const trimmedTerm = term.trim();
          console.log('🔍 Término de búsqueda:', trimmedTerm);
          
          if (trimmedTerm.length < 2) {
            this.predictiveList = []; 
            this.showDropdown = false;
            console.log('❌ Término muy corto, limpiando lista');
          }
        }),
        filter((term: string) => term.trim().length >= 2),
        switchMap((term: string) => {
          console.log('📡 Buscando en backend:', term.trim());
          return this.dashboardService.searchReferences(term.trim());
        })
      )
      .subscribe({
        next: (response) => {
          console.log('✅ Respuesta del backend:', response);
          
          if (response.ok && response.msg.length > 0) {
            this.predictiveList = this.extractPredictiveValues(response.msg);
            this.showDropdown = true; 
            console.log('📋 Lista actualizada con', this.predictiveList.length, 'items');
          } else {
            this.predictiveList = [];
            this.showDropdown = false;
            console.log('⚠️ Sin resultados');
          }
        },
        error: (err) => {
          console.error('❌ Error en búsqueda:', err);
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
    console.log('🎯 Seleccionando item:', item);
    
    // 🔥 PASO 1: Activar bandera para bloquear valueChanges
    this.isSelecting = true;
    
    // 🔥 PASO 2: Limpiar dropdown INMEDIATAMENTE
    this.predictiveList = [];
    this.showDropdown = false;
    
    // 🔥 PASO 3: Establecer valor
    this.wineryNewsForm.get('productReference')?.setValue(item, { emitEvent: false });
    this.wineryNewsForm.get('productReference')?.updateValueAndValidity();
    
    // 🔥 PASO 4: Desactivar bandera después de un breve delay
    setTimeout(() => {
      this.isSelecting = false;
      console.log('✅ Selección completada, bandera desactivada');
    }, 500);
    
    // 🔥 PASO 5: Enfocar siguiente campo
    setTimeout(() => {
      document.getElementById('cantidadProducto')?.focus(); 
    }, 100);
  }

  onBlur(): void {
    setTimeout(() => {
      this.showDropdown = false;
      this.predictiveList = [];
      console.log('👋 onBlur: Dropdown oculto');
    }, 200); 
  }
  
  onFocus(): void {
    // 🔥 NO mostrar dropdown si estamos en proceso de selección
    if (this.isSelecting) {
      console.log('⚠️ onFocus bloqueado: selección en proceso');
      return;
    }
    
    const term = this.wineryNewsForm.get('productReference')?.value || '';
    if (this.predictiveList.length > 0 && term.trim().length >= 2) {
      this.showDropdown = true;
      console.log('👁️ onFocus: Mostrando dropdown');
    }
  }

  clearDropdown(): void {
    this.predictiveList = [];
    this.showDropdown = false;
    console.log('🧹 Dropdown limpiado manualmente');
  }
}