// /app/barcode-printing/printing-parameters/printing-parameters.ts
import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, takeUntil, catchError, finalize } from 'rxjs/operators';
import { DashboardServices } from 'src/app/services/dashboard-services';
import { PrintingLabelsService } from 'src/app/services/printingLabels-services';
import { SharedModule } from 'src/app/theme/shared/shared.module';

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

  private search$ = new Subject<string>();
  private destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.form = this.fb.group({
      productReference: ['', Validators.required],
      // Campos no relevantes para este componente eliminados (impresora, cantidad, logo...)
      quantity: [1],
      printer: [''],
      includeLogo: [false],
      includeBarcode: [true],

      // Campos del producto (se muestran readonly; los mantenemos como controles normales para construir payload)
      productName: [''],
      EAN: [''],
      productCode: [''],
      reference: [''],
      codRef: [''],

      // Campos que el usuario debe completar
      labelCode: [null, Validators.required],
      labelNote: ['']
    });

    // subscription de búsqueda predictiva
    this.search$.pipe(
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

  onReferenceInput(event: Event) {
    const val = (event.target as HTMLInputElement).value;
    // cada vez que hay input, hacemos push al stream
    this.search$.next(val);
    // reset selected product si el usuario modifica
    this.selectedProduct = null;
    this.clearProductFields();
  }

  onFocus() {
    if (this.predictiveList.length > 0) {
      this.showDropdown = true;
    }
  }

  onBlur() {
    // permitir click en item antes de esconder dropdown
    setTimeout(() => {
      this.showDropdown = false;
    }, 180);
  }

  selectReference(item: any) {
    // llenar campos visibles e internos
    this.selectedProduct = {
      productName: item.productName,
      EAN: item.EAN,
      productCode: item.productCode,
      reference: item.reference,
      codRef: item.productCode // ajusta si codRef viene de otro campo
    };

    this.form.patchValue({
      productReference: item.reference,
      productName: item.productName,
      EAN: item.EAN,
      productCode: item.productCode,
      reference: item.reference,
      codRef: item.productCode
    });

    // limpiar sugerencias
    this.predictiveList = [];
    this.showDropdown = false;
  }

  isFieldInvalid(controlName: string): boolean {
    const c = this.form.get(controlName);
    return !!(c && c.invalid && (c.dirty || c.touched));
  }

  onCancel() {
    this.form.reset({
      productReference: '',
      quantity: 1,
      printer: '',
      includeLogo: false,
      includeBarcode: true,
      labelCode: null,
      labelNote: '',
      productName: '',
      EAN: '',
      productCode: '',
      reference: '',
      codRef: ''
    });
    this.selectedProduct = null;
    this.alert.visible = false;
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

  // Getter que devuelve el payload mostrado en preview (string JSON)
  get labelPreview(): string {
    const payload = {
      productName: this.form.value.productName || this.selectedProduct?.productName || '',
      EAN: this.form.value.EAN || this.selectedProduct?.EAN || '',
      reference: this.form.value.reference || this.selectedProduct?.reference || this.form.value.productReference,
      codRef: this.form.value.codRef || this.selectedProduct?.codRef || this.form.value.productCode || '',
      label: {
        code: this.form.value.labelCode != null ? Number(this.form.value.labelCode) : null,
        note: this.form.value.labelNote || ''
      }
    };
    return JSON.stringify(payload, null, 2);
  }

  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    // construir payload que solicita el backend (igual que preview)
    const payload = {
      productName: this.form.value.productName || this.selectedProduct?.productName || '',
      EAN: this.form.value.EAN || this.selectedProduct?.EAN || '',
      reference: this.form.value.reference || this.selectedProduct?.reference || this.form.value.productReference,
      codRef: this.form.value.codRef || this.selectedProduct?.codRef || this.form.value.productCode || '',
      label: {
        code: Number(this.form.value.labelCode),
        note: (this.form.value.labelNote || '').toString()
      }
    };

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
          // Limpiar sólo el consecutivo si lo deseas
          this.form.patchValue({ labelCode: null, labelNote: '' });
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
  }
}