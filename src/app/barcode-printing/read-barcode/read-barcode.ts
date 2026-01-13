// src/app/barcode-printing/read-barcode/read-barcode.ts
import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl } from '@angular/forms';
import { debounceTime, filter } from 'rxjs/operators';
import { forkJoin } from 'rxjs';
import { PrintingLabelsService } from '../../services/printingLabels-services';
import { LabelDatas, ReprintLabelRequest, VoidLabelRequest } from '../../interfaces/printingLabel.interfaces';

type ActiveView = 'reimprimir' | 'anular' | 'leer' | 'validar';



@Component({
  selector: 'app-read-barcode',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './read-barcode.html',
  styleUrl: './read-barcode.scss'
})
export class ReadBarcode implements OnInit {

  private fb = inject(FormBuilder);
  private printingService = inject(PrintingLabelsService);

  activeView: ActiveView = 'reimprimir';

  // Formularios
  reprintForm: FormGroup;
  cancelForm: FormGroup;
  readForm: FormGroup;
  validationForm: FormGroup;

  // Listas de Seriales
  serialsToReprint: string[] = [];
  serialsToCancel: string[] = [];

  // Estados
  isLoading = false;
  serverMessage: { type: 'success' | 'danger', text: string } | null = null;
  readResult: LabelDatas | null = null;
  pendingLabels: string[] = [];
  validatedLabels: string[] = [];

  constructor() {
    this.reprintForm = this.fb.group({
      serialEntry: [''],
      reason: ['', [Validators.required, Validators.minLength(5)]],
      personReprints: ['', [Validators.required]],
      ReturnLabelOld: [true, [Validators.required]]
    });

    this.cancelForm = this.fb.group({
      serialEntry: [''],
      reason: ['', [Validators.required, Validators.minLength(10)]]
    });

    this.readForm = this.fb.group({ serial: ['', Validators.required] });
    this.validationForm = this.fb.group({ serialToValidate: ['', Validators.required] });

    this.cancelForm = this.fb.group({
      serialEntry: [''],
      reason: ['', [Validators.required, Validators.minLength(10)]],
      personReprints: ['', [Validators.required]],
      ReturnLabelOld: [true, [Validators.required]],
      fastCancel: [false]
    });
  }

  ngOnInit() {
    this.setupScanListener(this.reprintForm.get('serialEntry')!, this.serialsToReprint);
    this.setupScanListener(this.cancelForm.get('serialEntry')!, this.serialsToCancel);
  }

  setupScanListener(control: AbstractControl, targetArray: string[]) {
    control.valueChanges.pipe(
      debounceTime(80), // Reducimos de 150 a 80ms para mayor agilidad con escáneres
      filter(value => !!value && value.trim().length > 0)
    ).subscribe(serial => {
      const trimmed = serial.trim();
      
      if (this.activeView === 'anular' && this.cancelForm.get('fastCancel')?.value) {
        this.handleFastCancel(trimmed);
      } else {
        // Modo Manual: Lo agregamos a la lista para el botón "Procesar"
        if (!targetArray.includes(trimmed)) {
          targetArray.unshift(trimmed);
        }
      }
      
      // Limpiamos el input después de procesar el valor
      control.patchValue('', { emitEvent: false });
    });
  }

  handleFastCancel(serial: string) {
    // Validamos que los campos obligatorios tengan datos válidos antes de proceder
    const { reason, personReprints, ReturnLabelOld } = this.cancelForm.value;
    
    // Verificamos validez manual de los campos necesarios
    if (this.cancelForm.get('reason')?.invalid || this.cancelForm.get('personReprints')?.invalid) {
      this.serverMessage = { 
        type: 'danger', 
        text: '⚠️ Campos incompletos: Debe ingresar el Responsable y un Motivo válido (mín. 10 carac.) antes de escanear.' 
      };
      return;
    }

    this.isLoading = true;
    this.serverMessage = null;

    const body: VoidLabelRequest = {
      code: serial,
      note: reason,
      personReprints: personReprints,
      ReturnLabelOld: ReturnLabelOld
    };

    this.printingService.labelRemove(body).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.serverMessage = { type: 'success', text: `Etiqueta ${serial} anulada correctamente.` };
      },
      error: (err) => {
        this.isLoading = false;
        this.serverMessage = { type: 'danger', text: err.message };
      }
    });
  }

  setView(view: ActiveView) {
    this.activeView = view;
    this.serverMessage = null;
    this.reprintForm.reset({ ReturnLabelOld: true });
    this.cancelForm.reset();
    this.serialsToReprint = [];
    this.serialsToCancel = [];
  }

  removeSerial(list: string[], index: number) {
    list.splice(index, 1);
  }

  // --- SUBMITS ---

  onReimprimirSubmit() {
    if (this.reprintForm.invalid || this.serialsToReprint.length === 0) return;

    this.isLoading = true;
    this.serverMessage = null;

    const { reason, personReprints, ReturnLabelOld } = this.reprintForm.value;

    // Se crea una petición por cada serial escaneado
    const requests = this.serialsToReprint.map(serial => {
      const body: ReprintLabelRequest = {
        code: serial,
        note: reason,
        personReprints: personReprints,
        ReturnLabelOld: ReturnLabelOld
      };
      return this.printingService.reprintLabel(body);
    });

    forkJoin(requests).subscribe({
      next: (responses) => {
        this.isLoading = false;
        this.serverMessage = { type: 'success', text: `${responses.length} etiquetas reimpresas con éxito.` };
        this.serialsToReprint = [];
        this.reprintForm.reset({ ReturnLabelOld: true });
      },
      error: (err) => {
        this.isLoading = false;
        this.serverMessage = { type: 'danger', text: err.message };
      }
    });
  }

  onAnularSubmit() {
    // Validamos que el formulario sea correcto y que existan seriales escaneados
    if (this.cancelForm.invalid || this.serialsToCancel.length === 0) return;

    this.isLoading = true;
    this.serverMessage = null;

    const { reason, personReprints, ReturnLabelOld } = this.cancelForm.value;

    // Creamos un array de peticiones usando el servicio de anulación
    const requests = this.serialsToCancel.map(serial => {
      const body = {
        code: serial,
        note: reason,
        personReprints: personReprints,
        ReturnLabelOld: ReturnLabelOld
      };
      return this.printingService.labelRemove(body);
    });

    // Ejecutamos todas las peticiones en paralelo
    forkJoin(requests).subscribe({
      next: (responses) => {
        this.isLoading = false;
        this.serverMessage = { 
          type: 'success', 
          text: `${responses.length} etiquetas anuladas exitosamente.` 
        };
        // Limpiamos la lista y el formulario
        this.serialsToCancel = [];
        this.cancelForm.reset({ ReturnLabelOld: true });
      },
      error: (err) => {
        this.isLoading = false;
        // El mensaje de error viene del manejador de errores de tu servicio
        this.serverMessage = { type: 'danger', text: err.message };
      }
    });
  }

  
}