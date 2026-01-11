// /app/barcode-printing/barcode-printing/barcode-printing.ts
import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbModal, NgbModalModule } from '@ng-bootstrap/ng-bootstrap';

import { Subject, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError, takeUntil } from 'rxjs/operators';

import { PrintingLabelsService } from '../../services/printingLabels-services';
import { 
  BarcodeEntry, 
  GeneratedLabel, 
  LabelParametersRequest, 
  LabelPrintingRequest, 
  LabelPrintingResponse, 
  PrintedValidationInfo, 
  ProductReference, 
  ReadValidationInfo } from '../../interfaces/printingLabel.interfaces';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-barcode-printing',
  standalone: true,
  imports: [CommonModule, FormsModule, NgbModalModule],
  templateUrl: './barcode-printing.html',
  styleUrls: ['./barcode-printing.scss']
})
export class BarcodePrinting implements OnInit, OnDestroy {
  private printingLabelsService = inject(PrintingLabelsService);
  private modalService = inject(NgbModal);
  private toastr = inject(ToastrService);
  // Propiedades de estado
  selectedReference = '';
  productName = '';
  EAN = '';
  productCode = '';
  labelCode = '';
  quantity: number | null = null;
  quantityInvalid = false;
  loading = false;
  showDropdown = false;
  predictiveList: ProductReference[] = [];
  generatedLabels: GeneratedLabel[] = [];
  printedFromDB = false;
  idDocumentDB = '';
  barcodesFromDB: string[] = [];
  allCreated = false;
  gtinLength = 16;
  serialIA = '21';
  gtinBase = '';
  errorMessage = '';
  printingLoading = false;
  ean128Input = '';
  validatedEAN128: BarcodeEntry[] = [];
  activeModal: any;

  private input$ = new Subject<string>();
  private destroy$ = new Subject<void>();

  @ViewChild('scanInput') scanInputRef!: ElementRef;

  constructor() {}

  ngOnInit(): void {
    // ... (Lógica ngOnInit sin cambios)
    this.input$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((value) => {
          const trimmed = (value ?? '').trim();
          if (!trimmed || trimmed.length < 3) {
            return of(null);
          }
          this.loading = true;
          const payload = { reference: trimmed } as unknown as LabelParametersRequest;
          console.log('Consultando referencia:', payload);
          return this.printingLabelsService.postCurrentConsecutive(payload)
            .pipe(catchError(err => {
              console.error('postCurrentConsecutive error:', err);
              this.errorMessage = err?.message || 'Error al consultar referencia';
              return of(null);
            }));
        }),
        takeUntil(this.destroy$)
      )
      .subscribe((response: any | null) => {
        this.loading = false;
        this.predictiveList = [];

        if (!response) {
          this.showDropdown = false;
          return;
        }

        // Normalizar la estructura que devuelve tu backend: { ok: true, msg: [ ... ] }
        if (Array.isArray(response)) {
          this.predictiveList = response;
        } else if (Array.isArray(response.msg)) {
          this.predictiveList = response.msg;
        } else if (response.msg && response.msg._id) {
          this.predictiveList = [response.msg];
        } else if (response._id) {
          this.predictiveList = [response];
        } else {
          this.predictiveList = [];
        }

        this.showDropdown = this.predictiveList.length > 0;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.input$.complete();
  }

  // input handler: alimenta el subject (debounce lo manejará)
  onReferenceInput(event: any) {
    const value = event?.target?.value ?? '';
    this.selectedReference = value;
    this.errorMessage = '';
    this.input$.next(value);
  }

  onFocus() {
    if (this.predictiveList.length > 0) this.showDropdown = true;
  }

  onBlur() {
    // permitir clic en item
    setTimeout(() => (this.showDropdown = false), 180);
  }

  // Al seleccionar un item: mostrar codRef en el input para facilitar identificación
  selectReference(item: ProductReference) {
    // Mostrar el código (codRef) en el campo principal y rellenar los read-only
    this.selectedReference = item.codRef ?? item.reference ?? this.selectedReference;
    this.productName = item.productName ?? '';
    this.EAN = item.EAN ?? '';
    this.productCode = item.codRef ?? '';
    this.labelCode = item.label?.number ?? '';
    this.predictiveList = [];
    this.showDropdown = false;
  }

  private initSearchSubscription() {
    this.input$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(value => {
        if (!value || value.trim().length < 3) return of(null);
        this.loading = true;
        return this.printingLabelsService.postCurrentConsecutive({ reference: value.trim() } as any).pipe(
          catchError(() => {
            this.loading = false;
            return of(null);
          })
        );
      }),
      takeUntil(this.destroy$)
    ).subscribe(res => {
      this.loading = false;
      this.predictiveList = res?.msg || [];
      this.showDropdown = this.predictiveList.length > 0;
    });
  }

  generateLabels() {
    if (!this.quantity || this.quantity <= 0) {
      this.quantityInvalid = true;
      return;
    }
    this.quantityInvalid = false;

    if (!this.labelCode) {
      alert('No se encontró consecutivo para la referencia seleccionada.');
      return;
    }

    const digits = this.labelCode.length;
    const startNumber = parseInt(this.labelCode, 10);

    this.generatedLabels = [];
    for (let i = 0; i < this.quantity; i++) {
      const num = (startNumber + i).toString().padStart(digits, '0');
      // Inicialmente, el estado es 'pending'
      this.generatedLabels.push({ number: num, status: 'pending' });
    }
    // Reiniciar estados de impresión y validación
    this.allCreated = false; 
    this.printedFromDB = false;
    this.idDocumentDB = '';
    this.barcodesFromDB = [];
    this.gtinBase = '';
  }

  // markAsCreated() se mantiene inactivo
  markAsCreated() {
    this.generatedLabels = this.generatedLabels.map(l => ({ ...l, status: 'created' }));
    this.allCreated = true;
  }

  clearForm() {
    this.selectedReference = '';
    this.productName = '';
    this.EAN = '';
    this.productCode = '';
    this.labelCode = '';
    this.quantity = null;
    this.generatedLabels = [];
    this.allCreated = false; 
    this.printedFromDB = false; 
    this.idDocumentDB = '';     
    this.barcodesFromDB = [];  
    this.gtinBase = ''; // Limpiamos el GTIN base
    this.predictiveList = [];
    this.errorMessage = '';
  }

  /**
   * @description Prepara y envía la data al backend para el registro de la impresión.
   */
  sendLabelsToPrinting(): void {
      // Validación de estado: Asegurar que se generaron las etiquetas
      if (this.generatedLabels.length === 0) {
          this.errorMessage = 'Debe generar las etiquetas antes de intentar imprimir.';
          return;
      }

      this.printingLoading = true;
      this.errorMessage = '';
      
      // Calcular los rangos y totales necesarios
      const quantityStr = this.generatedLabels.length.toString();
      const consecutiveStart = this.generatedLabels[0].number;
      const consecutiveEnd = this.generatedLabels[this.generatedLabels.length - 1].number;

      // 1. Construir la estructura de BarcodeEntry para PrintedBarcode13
      const printedBarcode13: BarcodeEntry[] = this.generatedLabels.map(l => ({ code: l.number }));

      // 2. Construir el objeto de solicitud (Payload)
      const payload: LabelPrintingRequest = {
          productName: this.productName,
          EAN: this.EAN,
          reference: this.selectedReference, 
          codRef: this.productCode,
          label: {
              quantityLabels: quantityStr,
              consecutiveStart: consecutiveStart,
              consecutiveEnd: consecutiveEnd,
              LabelValidation: {
                  PrintedBarcode13: [
                      printedBarcode13, 
                      { printedDate: new Date().toLocaleString(), LabelCount: quantityStr } as PrintedValidationInfo
                  ],
                  // Se mantiene la estructura mínima de envío para PrintedBarcode128
                  PrintedBarcode128: [
                      [{ code: '' }] as BarcodeEntry[], 
                      { printedDate: '', LabelCount: ' ' } as PrintedValidationInfo
                  ],
                  // Dejamos los de lectura vacíos
                  barcodeReadEAN13: [
                      [{ code: '' }] as BarcodeEntry[], 
                      { readDate: '', countLabelRead: ' ' } as ReadValidationInfo
                  ],
                  barcodeReadEAN128: [
                      [{ code: '' }] as BarcodeEntry[], 
                      { readDate: '', countLabelRead: ' ' } as ReadValidationInfo
                  ]
              }
          }
      };

      console.log('PAYLOAD ENVIADO AL BACKEND (LabelPrintingRequest):', payload);

      // 3. Llamar al servicio
      this.printingLabelsService.postLabelPrinting(payload)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (response: LabelPrintingResponse) => {
              this.printingLoading = false;
              if (response.ok) {
                
                // 1. Actualizar el estado de la impresión/creación
                this.printedFromDB = true;
                this.allCreated = true; // Mantener por compatibilidad con el [disabled] de Validar en el HTML original
                this.idDocumentDB = response.data?.id || '';
                
                // 2. Extraer los PrintedBarcode128 para la validación posterior
                const barcodes128 = response.data?.labels?.LabelValidation?.PrintedBarcode128.barcodes as BarcodeEntry[] || [];
                this.barcodesFromDB = barcodes128.map(b => b.code).filter(c => !!c);
                
                // **Guardar GTIN Base para Validación Robusta**
                if (this.barcodesFromDB.length > 0) {
                    const firstCode = this.barcodesFromDB[0];
                    // Asumimos que el formato es '01' + 14 dígitos GTIN + '21' + Consecutivo
                    this.gtinBase = firstCode.substring(0, this.gtinLength); 
                }

                // 3. Actualizar el estado de las etiquetas mostradas a 'created'
                this.generatedLabels = this.generatedLabels.map(l => ({ 
                    ...l, 
                    status: 'created' 
                }));
                
                // Limpiar errores si los hubo
                this.errorMessage = '';

              } else {
                this.errorMessage = response.msg || 'Fallo en el registro de impresión.';
              }
            },
            error: (err) => {
                this.printingLoading = false;
                this.errorMessage = err?.message || 'Error desconocido al comunicarse con el servidor.';
                console.error('Error al registrar la impresión:', err);
            }
        });
  }

  validateLabels(content: any) { 
      if (!this.printedFromDB || this.generatedLabels.length === 0) {
          this.errorMessage = 'Debe generar y registrar la impresión de etiquetas (Marcar como Creados) antes de validar.';
          return;
      }

      this.clearModalInputs(false);

      // Abrir el modal y guardar la referencia
      this.activeModal = this.modalService.open(content, { size: 'lg', centered: true });
      
      // 💡 Auto-enfoque al abrir el modal
      // Usamos el evento 'shown' del modal o un pequeño delay para asegurarnos
      this.activeModal.shown.subscribe(() => {
          this.focusScanInput();
      });
  }

  /**
   * @description Limpia los arrays de códigos escaneados y los inputs del modal de validación.
   */
  clearModalInputs(showAlert: boolean = true) {
    // Eliminamos el manejo de EAN13
    this.validatedEAN128 = [];
    this.ean128Input = '';
    this.errorMessage = ''; 
    if (showAlert) {
      alert('Los códigos EAN-128 leídos han sido limpiados.');
    }
    // Opcional: Asegurar que el input de escaneo recupere el foco después de limpiar (para escanear el siguiente código)
    // Nota: Esto requeriría usar @ViewChild en el componente, pero lo dejamos simple por ahora.
  }

  /**
   * @description Agrega código con validación de integridad y feedback visual rápido.
   */
  addEAN128() {
    const code = this.ean128Input.trim();
    if (!code) return;

    // VALIDACIÓN: ¿El código es parte de lo impreso?
    if (!this.barcodesFromDB.includes(code)) {
      this.toastr.error(`El código [${code}] no pertenece a este lote.`, 'Error de Integridad', {
        timeOut: 4000,
        progressBar: true
      });
      this.ean128Input = '';
      this.focusScanInput();
      return;
    }

    // VALIDACIÓN: ¿Duplicado?
    if (this.validatedEAN128.some(e => e.code === code)) {
      this.toastr.warning('Este código ya fue escaneado.', 'Duplicado');
      this.ean128Input = '';
      this.focusScanInput();
      return;
    }

    // Si es correcto, agregar a la lista
    this.validatedEAN128.unshift({ code });
    this.toastr.success('Lectura aceptada', 'Éxito', { timeOut: 1000 });
    this.ean128Input = '';
    this.focusScanInput();
  }

  // 💡 NUEVO: Función auxiliar para el enfoque.
  focusScanInput() {
    // Usamos un setTimeout para asegurar que el input esté visible y listo en el DOM
    setTimeout(() => {
        if (this.scanInputRef) {
            this.scanInputRef.nativeElement.focus();
        }
    }, 50);
  }

  // 💡 NUEVO: Función que se disparará automáticamente al detectar la longitud
  onEAN128Scan(event: Event) {
    const input = event.target as HTMLInputElement;
    const value = input.value.trim();

    // Longitud del código EAN-128 completo (GTIN-14 + IA '21' + Consecutivo)
    // Asumiremos que un código completo tiene 27 caracteres (16 GTIN + 2 IA + 9 Consecutivo)
    // Si tus consecutivos tienen otra longitud, ajusta 27.
    const expectedLength = this.gtinLength + this.serialIA.length + (this.generatedLabels[0]?.number?.length || 0);

    // Si el valor del input alcanza la longitud esperada, simula un ENTER
    if (expectedLength > 0 && value.length >= expectedLength) {
        this.addEAN128();
    }
  }

  /**
   * @description Sincronización final con el backend.
   */
  processFinalValidation(modal: any) {
    if (this.validatedEAN128.length !== this.barcodesFromDB.length) {
      this.toastr.warning('Cantidad de etiquetas incompleta.', 'Validación Pendiente');
      return;
    }

    this.loading = true;
    const payload = {
      id: this.idDocumentDB,
      labels: {
        LabelValidation: {
          barcodeReadEAN128: {
            barcodes: this.validatedEAN128.map(i => ({ code: i.code, status: "Activo" })),
            validation: {
              readDate: new Date().toLocaleString(),
              countLabelRead: this.validatedEAN128.length,
              validated: true
            }
          }
        }
      }
    };

    this.printingLabelsService.postBarcodeReadingScan(payload).subscribe({
      next: (res) => {
        this.loading = false;
        if (res.ok) {
          this.toastr.success(`Referencia: ${res.data.codRef} - Validada.`, 'Sincronización Exitosa');
          this.generatedLabels = this.generatedLabels.map(l => ({ ...l, status: 'validated' }));
          modal.close();
        }
      },
      error: (err) => {
        this.loading = false;
        this.toastr.error(err.message, 'Error de Servidor');
      }
    });
  }
                                   
  

  /**
 * @description Permite eliminar un código EAN-128 leído por índice.
 * Modificada para devolver el foco al input de escaneo.
 */
  removeEAN128(index: number) {
      if (index >= 0 && index < this.validatedEAN128.length) {
          
          // 1. Elimina el elemento del array
          this.validatedEAN128.splice(index, 1);
          
          this.focusScanInput(); 
      }
  }  
}