// src/app/barcode-printing/read-barcode/read-barcode.ts
import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
// 1. Importar AbstractControl para la función genérica
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl } from '@angular/forms';
import { debounceTime, filter } from 'rxjs/operators';

type ActiveView = 'reimprimir' | 'anular' | 'leer' | 'validar';

// Interface de ejemplo para los datos de una etiqueta
interface LabelData {
  serial: string;
  productName: string;
  reference: string;
  status: 'Creada' | 'Impresa' | 'Validada' | 'Anulada';
  createdAt: Date;
}

@Component({
  selector: 'app-read-barcode',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule
  ],
  templateUrl: './read-barcode.html',
  styleUrl: './read-barcode.scss'
})
export class ReadBarcode implements OnInit { // Implementar OnInit

  private fb = inject(FormBuilder);
  activeView: ActiveView = 'reimprimir';

  // --- Formularios ---
  reprintForm: FormGroup;
  cancelForm: FormGroup;
  readForm: FormGroup;
  validationForm: FormGroup;
  
  // --- Listas de Seriales ---
  serialsToReprint: string[] = [];
  serialsToCancel: string[] = []; // <--- NUEVO array para anular

  // --- Estado para "Leer Etiquetas" ---
  readResult: LabelData | null = null;
  isLoadingRead: boolean = false;
  readError: string | null = null;

  // --- Estado para "Validar Etiquetas" ---
  pendingLabels: string[] = [];
  validatedLabels: string[] = [];
  isLoadingValidation: boolean = false;
  validationError: string | null = null;


  constructor() {
    // 1. Formulario REIMPRIMIR
    this.reprintForm = this.fb.group({
      serialEntry: [''], // Input para escanear
      reason: ['', [Validators.required, Validators.minLength(5)]]
    });

    // 2. Formulario ANULAR (ahora igual que reimprimir)
    this.cancelForm = this.fb.group({
      serialEntry: [''], // <--- CAMBIO: Input para escanear
      reason: ['', [Validators.required, Validators.minLength(10)]]
    });

    // 3. Formulario LEER
    this.readForm = this.fb.group({
      serial: ['', Validators.required]
    });

    // 4. Formulario VALIDAR
    this.validationForm = this.fb.group({
      serialToValidate: ['', Validators.required]
    });
  }

  ngOnInit() {
    // 3. Configurar los listeners de escaneo para AMBAS vistas
    this.setupScanListener(
      this.reprintForm.get('serialEntry')!, 
      this.serialsToReprint
    );
    
    this.setupScanListener(
      this.cancelForm.get('serialEntry')!, 
      this.serialsToCancel
    );
  }

  // 4. NUEVA FUNCIÓN GENÉRICA Y ÓPTIMA
  setupScanListener(control: AbstractControl, targetArray: string[]) {
    control.valueChanges.pipe(
      debounceTime(100), // Espera 100ms sin teclear
      filter(value => !!value && value.trim().length > 0)
    ).subscribe(serial => {
      const trimmedSerial = serial.trim();
      
      // Añadir a la lista solo si no existe
      if (!targetArray.includes(trimmedSerial)) {
        targetArray.unshift(trimmedSerial); // Añade al inicio
      }
      
      // Limpiar el input sin disparar un nuevo valueChange
      control.patchValue('', { emitEvent: false });
    });
  }
  
  setView(view: ActiveView) {
    this.activeView = view;
    
    // Resetear formularios
    this.reprintForm.reset();
    this.cancelForm.reset();
    this.readForm.reset();
    this.validationForm.reset();
    
    // 5. Resetear AMBAS listas de escaneo
    this.serialsToReprint = [];
    this.serialsToCancel = [];
    
    // Resetear otros estados
    this.readResult = null;
    this.readError = null;
    this.pendingLabels = [];
    this.validatedLabels = [];
    this.validationError = null;

    if (view === 'validar') {
      this.onFetchPending();
    }
  }

  // 6. NUEVA FUNCIÓN GENÉRICA para quitar serial
  removeSerial(list: string[], index: number) {
    list.splice(index, 1);
  }

  // --- Lógica de Submits ---

  onReimprimirSubmit() {
    if (this.reprintForm.invalid || this.serialsToReprint.length === 0) return;
    
    const reason: string = this.reprintForm.value.reason;
    console.log('Reimprimiendo etiquetas:', this.serialsToReprint);
    console.log('Motivo:', reason);
    
    this.reprintForm.reset();
    this.serialsToReprint = [];
  }

  // 7. ACTUALIZADO onAnularSubmit
  onAnularSubmit() {
    if (this.cancelForm.invalid || this.serialsToCancel.length === 0) return;

    const reason: string = this.cancelForm.value.reason;
    console.log('Anulando etiquetas:', this.serialsToCancel);
    console.log('Motivo:', reason);

    this.cancelForm.reset();
    this.serialsToCancel = [];
  }

  onReadSubmit() {
    if (this.readForm.invalid) return;
    
    const serial = this.readForm.value.serial;
    this.isLoadingRead = true;
    this.readResult = null;
    this.readError = null;
    console.log('Leyendo etiqueta:', serial);

    setTimeout(() => {
      this.isLoadingRead = false;
      if (serial === '12345') {
        this.readResult = {
          serial: '12345',
          productName: 'Estufa de Piso 30" Silver',
          reference: 'AB-123-PL',
          status: 'Impresa',
          createdAt: new Date()
        };
      } else {
        this.readError = `Serial "${serial}" no encontrado.`;
      }
      this.readForm.reset();
    }, 1000);
  }

  onFetchPending() {
    this.isLoadingValidation = true;
    this.pendingLabels = [];
    this.validatedLabels = [];
    this.validationError = null;
    console.log('Buscando etiquetas pendientes de validación...');

    setTimeout(() => {
      this.isLoadingValidation = false;
      this.pendingLabels = [
        'SERIAL-001', 'SERIAL-002', 'SERIAL-003', 'SERIAL-004', 'SERIAL-005'
      ];
    }, 1200);
  }

  onValidateScan() {
    if (this.validationForm.invalid) return;
    
    const scannedSerial = this.validationForm.value.serialToValidate;
    this.validationError = null;

    const index = this.pendingLabels.indexOf(scannedSerial);

    if (index > -1) {
      const validated = this.pendingLabels.splice(index, 1)[0];
      this.validatedLabels.unshift(validated);
      console.log(`Serial ${scannedSerial} validado con éxito.`);
    } else if (this.validatedLabels.includes(scannedSerial)) {
      this.validationError = `El serial "${scannedSerial}" ya fue validado en esta sesión.`;
    } else {
      this.validationError = `El serial "${scannedSerial}" no está en la lista de pendientes.`;
    }
    
    this.validationForm.reset();
  }
}