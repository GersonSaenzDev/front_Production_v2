// /app/barcode-printing/printing-parameters/printing-parameters.ts
import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormArray, AbstractControl } from '@angular/forms';
import { Subject, of, } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, takeUntil, catchError, finalize } from 'rxjs/operators';
import { DashboardServices } from 'src/app/services/dashboard-services';
import { PrintingLabelsService } from 'src/app/services/printingLabels-services';
import { SharedModule } from 'src/app/theme/shared/shared.module';
import { AdditionalDataGroup, ProcessData, ViewAddResponse } from 'src/app/interfaces/printingLabel.interfaces';

interface CheckListItem {
  process: string;
  quantity: number;
  note: string;
}

@Component({
  selector: 'app-printing-parameters',
  standalone: true,
  imports: [
    SharedModule,
    ReactiveFormsModule
  ],
  templateUrl: './printing-parameters.html',
  styleUrls: ['./printing-parameters.scss']
  
})
export class PrintingParameters implements OnInit, OnDestroy {

  private dashboardService = inject(DashboardServices);
  private printingLabelsService = inject(PrintingLabelsService);
  private fb = inject(FormBuilder);

  form!: FormGroup;
  predictiveList: any[] = [];
  showDropdown = false;
  loading = false;
  submitting = false;
  selectedProduct: any = null;

  alert = {
    visible: false,
    type: 'success' as 'success' | 'danger',
    message: ''
  };

  private searchReference$ = new Subject<string>();
  private destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.form = this.fb.group({
      productReference: ['', Validators.required],
      quantity: [1], 
      printer: [''], 
      includeLogo: [false], 
      includeBarcode: [true], 

      // --- Campos de Información de Referencia ---
      productName: [''],
      EAN: [''],
      productCode: [''],
      reference: [''],
      codRef: [''],

      // --- Toggle de Tipo de Producto ---
      productType: [false], 
      exportCountry: [''], 

      // --- Campos de Etiqueta ---
      labelCode: [null, Validators.required],
      labelNote: [''],
      
      // 💡 NUEVO: Campo de Cantidad Máxima
      maximumPrintQuantity: [55, [Validators.required, Validators.min(1), Validators.max(500)]],

      // --- Check List ---
      additionalData: this.fb.array([
        this.createAdditionalDataGroup()
      ])
    });

    this.setupReferenceSearchSubscription();
    this.setupConditionalValidators();
  }

  // --- Lógica para validación condicional ---
  setupConditionalValidators(): void {
    this.form.get('productType')?.valueChanges.pipe(
      takeUntil(this.destroy$)
    ).subscribe(isExport => {
      const countryControl = this.form.get('exportCountry');
      if (isExport) {
        countryControl?.setValidators([Validators.required, Validators.maxLength(50)]);
      } else {
        countryControl?.clearValidators();
        countryControl?.setValue(''); 
      }
      countryControl?.updateValueAndValidity();
    });
  }
  
  // --- Métodos de Referencia Principal (Sin cambios) ---
  setupReferenceSearchSubscription(): void {
    this.searchReference$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(term => {
        const t = (term || '').trim();
        if (t.length === 0) {
          this.predictiveList = [];
          this.loading = false;
          return of(null);
        }
        this.loading = true;
        return this.dashboardService.searchReferences(t).pipe(
          catchError(err => {
            console.error('Error al buscar referencias:', err);
            return of({ ok: false, msg: [] });
          }),
          finalize(() => this.loading = false)
        );
      }),
      takeUntil(this.destroy$)
    ).subscribe((res: any | null) => {
      if (!res) return;
      this.predictiveList = res?.msg || [];
      this.showDropdown = this.predictiveList.length > 0;
    });
  }

  onFocus() {
    if (this.predictiveList.length > 0) {
      this.showDropdown = true;
    }
  }

  onBlur() {
    setTimeout(() => {
      this.showDropdown = false;
    }, 180);
  }
  
  onReferenceInput(event: Event) {
    const val = (event.target as HTMLInputElement).value;
    this.searchReference$.next(val);
    this.selectedProduct = null;
    this.clearProductFields();
  }

  selectReference(item: any) {
    this.selectedProduct = {
      productName: item.productName,
      EAN: item.EAN,
      productCode: item.productCode,
      reference: item.reference,
      codRef: item.productCode 
    };

    this.form.patchValue({
      productReference: item.reference,
      productName: item.productName,
      EAN: item.EAN,
      productCode: item.productCode,
      reference: item.reference,
      codRef: item.productCode
    });

    this.predictiveList = [];
    this.showDropdown = false;
  }
  
  private clearProductFields() {
    this.form.patchValue({
      productName: '',
      EAN: '',
      productCode: '',
      reference: '',
      codRef: ''
    });
  }

  isFieldInvalid(controlName: string): boolean {
    const c = this.form.get(controlName);
    return !!(c && c.invalid && (c.dirty || c.touched));
  }

  // --- Lógica del FormArray Predictivo (Check List) ---
  subscribeToProcessSearch(item: AdditionalDataGroup): void {
      if (!item.searchSubject) {
          item.searchSubject = new Subject<string>();
          item.predictiveList = [];
          item.loading = false;
          item.showDropdown = false;
      }
      
      item.controls.process.valueChanges.pipe(
          debounceTime(300),
          distinctUntilChanged(),
          switchMap(term => {
              const t = (term || '').trim();
              
              item.predictiveList = [];
              item.loading = false;
              item.showDropdown = false;

              if (t.length < 3) {
                  return of(null);
              }

              item.loading = true;
              
              const searchBody = { process: t };
              return this.printingLabelsService.predictiveViewAdd(searchBody).pipe(
                  catchError(err => {
                      console.error('Error al buscar procesos adicionales:', err);
                      return of({ ok: false, msg: [] } as ViewAddResponse);
                  }),
                  finalize(() => item.loading = false)
              );
          }),
          takeUntil(this.destroy$) 
      ).subscribe((res: ViewAddResponse | null) => {
          if (!res || !res.ok) return;
          
          item.predictiveList = res.msg || [];
          item.showDropdown = item.predictiveList.length > 0;
      });
  }

  get additionalDataControls(): FormArray {
    return this.form.get('additionalData') as FormArray;
  }

  createAdditionalDataGroup(): AdditionalDataGroup {
    const newGroup = this.fb.group({
      process: ['', Validators.required], 
      quantity: [1, [Validators.required, Validators.min(1)]], 
      note: ['', Validators.maxLength(100)] 
    }) as unknown as AdditionalDataGroup;
    
    newGroup.searchSubject = new Subject<string>();
    newGroup.predictiveList = [];
    newGroup.loading = false;
    newGroup.showDropdown = false;
    
    this.subscribeToProcessSearch(newGroup);
    
    return newGroup;
  }

  addAdditionalData(): void {
    this.additionalDataControls.push(this.createAdditionalDataGroup());
  }

  removeAdditionalData(index: number): void {
    const control = this.additionalDataControls.at(index) as AdditionalDataGroup;
    control.searchSubject.complete(); 
    
    this.additionalDataControls.removeAt(index);
    if (this.additionalDataControls.length === 0) {
      this.addAdditionalData(); 
    }
  }
  
  onProcessInput(event: Event, item: AdditionalDataGroup) {
      const val = (event.target as HTMLInputElement).value;
      item.searchSubject.next(val);
  }
  
  onProcessFocus(item: AdditionalDataGroup) {
      if (item.predictiveList.length > 0) {
          item.showDropdown = true;
      }
  }

  onProcessBlur(item: AdditionalDataGroup) {
      setTimeout(() => {
          item.showDropdown = false;
      }, 180);
  }
  
  selectProcess(itemGroup: AdditionalDataGroup, process: ProcessData) {
    itemGroup.controls.process.setValue(process.process);
    itemGroup.predictiveList = [];
    itemGroup.showDropdown = false;
  }
  
  // 💡 MODIFICADO: onCancel debe limpiar el nuevo campo
  onCancel() {
    this.form.reset({
      productReference: '',
      quantity: 1,
      printer: '',
      includeLogo: false,
      includeBarcode: true,
      
      productType: false, 
      exportCountry: '',

      labelCode: null,
      labelNote: '',
      
      maximumPrintQuantity: 55, // 👈 Se resetea el nuevo campo

      productName: '',
      EAN: '',
      productCode: '',
      reference: '',
      codRef: ''
    });
    this.selectedProduct = null;
    this.alert.visible = false;
    
    this.additionalDataControls.clear();
    this.addAdditionalData();
  }

  private filterCheckList(): any[] { 
    return this.additionalDataControls.value
      .filter( (item: CheckListItem) => item.process && item.quantity > 0 )
      .map( (item: CheckListItem) => ({
        process: item.process,
        stripQuantity: item.quantity, 
        note: item.note || '',
        status: true 
      }));
  }

  // 💡 MODIFICADO: onSubmit usa el valor del formulario
  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const filteredCheckList = this.filterCheckList();

    const payload = {
      productName: this.form.value.productName || this.selectedProduct?.productName || '',
      EAN: this.form.value.EAN || this.selectedProduct?.EAN || '',
      reference: this.form.value.reference || this.selectedProduct?.reference || this.form.value.productReference,
      codRef: this.form.value.codRef || this.selectedProduct?.codRef || this.form.value.productCode || '',
      
      destination: { 
        export: this.form.value.productType || false,
        country: this.form.value.productType ? (this.form.value.exportCountry || '') : ''
      },

      label: {
        code: String(this.form.value.labelCode),
        note: (this.form.value.labelNote || '').toString()
      },
      
      // 💡 MODIFICADO: Se usa el valor del formulario
      maximumPrintQuantity: this.form.value.maximumPrintQuantity, 
      
      checkList: filteredCheckList.length > 0 ? filteredCheckList : undefined
    } as any; 

    this.submitting = true;
    this.alert.visible = false;

    this.printingLabelsService.postLabelParameters(payload).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (res: any) => {
        this.submitting = false;
        this.alert.visible = true;
        if (res && res.ok) {
          this.alert.type = 'success';
          this.alert.message = res.msg || 'Referencia registrada exitosamente.';
          // Reseteamos los campos de etiqueta y checklist
          this.form.patchValue({ labelCode: null, labelNote: '', maximumPrintQuantity: 55 });
          this.additionalDataControls.clear();
          this.addAdditionalData();
        } else {
          this.alert.type = 'danger';
          this.alert.message = res?.msg || 'Error en el registro de la referencia';
        }
      },
      error: (err) => {
        this.submitting = false;
        this.alert.visible = true;
        this.alert.type = 'danger';
        this.alert.message = err?.message || 'Error al enviar al backend';
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    
    this.additionalDataControls.controls.forEach(control => {
      (control as AdditionalDataGroup).searchSubject.complete();
    });
  }
}