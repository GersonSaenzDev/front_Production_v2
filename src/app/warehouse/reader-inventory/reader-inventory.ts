// src/app/warehouse/reader-inventory/reader-inventory.ts
import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { HttpErrorResponse } from '@angular/common/http';
import { NgbModal, NgbModalModule } from '@ng-bootstrap/ng-bootstrap';

import { DashInventoryServices } from 'src/app/services/dashInventory-services';
import { Product, StorageItem } from 'src/app/interfaces/dashInventory.interface';

import { throwError } from 'rxjs';


@Component({
  selector: 'app-inventory-reader',
  standalone: true,
  imports: [ CommonModule, FormsModule, NgbModalModule, ],
  templateUrl: './reader-inventory.html',
  styleUrls: ['./reader-inventory.scss']
})
export class InventoryReader implements OnInit {
  private dashService = inject(DashInventoryServices);
  private modalService = inject(NgbModal);

  // Modo de lectura
  readingMode: 'simple' | 'regleta' = 'simple';

  // Código de barras actual
  barcodeInput: string = '';
  private scanTimer: any;

  // Lista de códigos leídos
  scannedCodes: string[] = [];

  // Producto actual (modo simple)
  currentProduct: Product | null = null;

  // Productos en la regleta (modo regleta)
  regletaProducts: Product[] = [];

  // Mensaje de estado
  statusMessage: string = '';

  // Campos del formulario (ahora en modal)
  inventoryArea: string = '';
  personName1: string = '';
  personName2: string = '';

  // Añadir en la clase (propiedades)
  serverResponse: any = null;
  duplicateBarcode: string | null = null;
  serverSuccess: boolean | null = null;
  

  // Indica si hay una carga en curso para bloquear múltiples peticiones
  loading: boolean = false;

  constructor() {}

  ngOnInit(): void {
    console.log('Inventory Reader Initialized');
  }

  onModeChange(mode: 'simple' | 'regleta') {
    this.readingMode = mode;
    this.statusMessage = `Modo cambiado a ${mode === 'simple' ? 'Lectura Simple' : 'Regleta'}`;
    if (mode === 'simple') {
      this.regletaProducts = [];
    }
  }

  openUserModal(content: any) {
    const modalRef = this.modalService.open(content, { centered: true, backdrop: 'static', size: 'md' });

    // esperar un momento y luego enfocar el input del modal
    setTimeout(() => {
      const el = document.getElementById('modalArea') as HTMLInputElement | null;
      if (el) el.focus();
    }, 150);

    // Opcional: manejar resultado si quieres
    modalRef.result.then(
      (res) => { /* cerrado con resultado */ },
      (reason) => { /* dismissed */ }
    );
  }

  saveUserInfo(modal: any, userForm: any) {
    if (!this.inventoryArea || !this.personName1 || !this.personName2) {
      this.statusMessage = 'Complete Área y ambos nombres antes de guardar.';
      return;
    }

    this.statusMessage = `Usuario guardado: ${this.personName1} ${this.personName2} - Área: ${this.inventoryArea}`;
    modal.close('saved');
  }

  // readBarcode() {
  //   const code = (this.barcodeInput || '').trim();
  //   if (!code) {
  //     this.statusMessage = 'Por favor ingrese un código de barras.';
  //     return;
  //   }

  //   if (!/^\d+$/.test(code)) {
  //     this.statusMessage = 'El código de barras solo debe contener números.';
  //     return;
  //   }

  //   if (!this.scannedCodes.includes(code)) {
  //     this.scannedCodes.push(code);
  //   }

  //   this.fetchProductInfo(code);

  //   this.barcodeInput = '';
  // }

  private mapStorageItemToProduct(item: StorageItem): Product {
    return {
      EAN: item.EAN ?? '',
      productCode: item.productCode ?? '',
      productName: item.productName ?? 'Sin nombre',
      reference: item.reference ?? '',
      barcode: item.barcode ?? '',
      consecutivo: item.consecutivo ?? ''
    };
  }

  private fetchProductInfo(barcode: string) {
    if (this.loading) {
      this.statusMessage = 'Espere, consulta en curso...';
      return;
    }

    this.loading = true;
    this.statusMessage = 'Consultando producto...';

    this.dashService.getStorage({ barcode })
      .pipe(finalize(() => {
        this.loading = false;
      }))
      .subscribe({
        next: (resp: any) => {
          if (!resp || resp.ok !== true) {
            this.statusMessage = 'Respuesta inválida del servidor.';
            return;
          }

          const data = resp.msg;
          if (!Array.isArray(data) || data.length === 0) {
            this.statusMessage = 'No se encontró información para el código proporcionado.';
            return;
          }

          if (this.readingMode === 'simple') {
            const item: StorageItem = data[0];
            this.currentProduct = this.mapStorageItemToProduct(item);
            this.statusMessage = `Producto encontrado: ${this.currentProduct.productName}`;
          } else {
            const mapped = data.map((d: StorageItem) => this.mapStorageItemToProduct(d));
            for (const p of mapped) {
              const exists = this.regletaProducts.some(r => r.consecutivo === p.consecutivo || r.barcode === p.barcode);
              if (!exists) this.regletaProducts.push(p);
            }
            if (this.regletaProducts.length > 5) {
              this.regletaProducts = this.regletaProducts.slice(-5);
            }
            this.statusMessage = `Regleta actualizada (${this.regletaProducts.length}/5)`;
          }
        },
        error: (err) => {
          console.error('Error al consultar getStorage:', err);
          this.statusMessage = err?.message ? `Error: ${err.message}` : 'Error al consultar el backend.';
        }
      });
  }

  clearData() {
    this.barcodeInput = '';
    this.scannedCodes = [];
    this.currentProduct = null;
    this.regletaProducts = [];
    // opcional: NO limpiar usuario aquí si quieres mantenerlo
    // this.inventoryArea = '';
    // this.personName1 = '';
    // this.personName2 = '';
    this.statusMessage = 'Datos limpiados';
  }

  onKeyPress(event: KeyboardEvent) {
    // Las pistolas suelen terminar con 'Enter'
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation(); // Evita que el evento suba
      
      // Pequeño delay para asegurar que el ngModel capturó el último carácter
      setTimeout(() => {
        this.readBarcode();
      }, 50);
      return;
    }

    // OPCIONAL: Lógica de seguridad para móviles
    // Si el usuario deja de "escribir" (la pistola deja de mandar datos) 
    // por más de 300ms, intentamos leer.
    if (this.scanTimer) clearTimeout(this.scanTimer);
    
    this.scanTimer = setTimeout(() => {
      const currentCode = (this.barcodeInput || '').trim();
      // Si tiene una longitud mínima razonable (ej. 10 para tus códigos de 20+)
      if (currentCode.length >= 10) {
        this.readBarcode();
      }
    }, 300); // 300ms es un tiempo seguro para esperar la ráfaga de la pistola
  }

  // onBarcodeChange(value: string) {
  //   if (value && value.length >= 8) {
  //     setTimeout(() => this.readBarcode(), 100);
  //   }
  // }

  readBarcode() {
    const code = (this.barcodeInput || '').trim();
    
    if (!code) return;

    // Si ya estamos procesando, evitamos duplicar la petición
    if (this.loading) return;

    // Validación: si el código está incompleto (ej. menos de 10 caracteres) no enviamos
    // Ajusta este número según el largo mínimo de tus códigos reales
    if (code.length < 5) {
      console.warn('Código demasiado corto, posible lectura errónea');
      return;
    }

    if (!/^\d+$/.test(code)) {
      this.statusMessage = 'El código debe contener solo números.';
      // No limpiamos el input inmediatamente para que el usuario vea qué falló
      return;
    }

    // Limpiar temporizadores activos
    if (this.scanTimer) clearTimeout(this.scanTimer);

    if (!this.scannedCodes.includes(code)) {
      this.scannedCodes.push(code);
    }

    this.fetchProductInfo(code);
    
    // Limpieza importante
    this.barcodeInput = '';
  }

  /**
   * Limpia las variables del usuario (Área, Nombre1, Nombre2).
   * Si se recibe la referencia al formulario (NgForm), lo resetea visualmente.
   */
  clearUserFields(userForm?: NgForm) {
    this.inventoryArea = '';
    this.personName1 = '';
    this.personName2 = '';
    this.statusMessage = 'Campos de usuario limpiados';

    // Si se pasa el NgForm desde el template, reseteará también su estado (touched/pristine)
    try {
      if (userForm) {
        userForm.resetForm({
          modalArea: '',
          modalNombre1: '',
          modalNombre2: ''
        });
      }
    } catch (err) {
      // no crítico si falla; sólo un intento de reset visual
      console.warn('No se pudo resetear el formulario del modal:', err);
    }
  }

  /**
   * Construye el payload que espera el backend para insertar en inventario.
   * Si hay varios productos (regleta) toma el nombre/referencia/codRef del primer producto.
   */
  private buildInsertPayload(productsToRegister: Product[]) {
    // Asegurar valores únicos y no vacíos
    const barcodes = Array.from(new Set(productsToRegister.map(p => (p.barcode || '').trim()).filter(b => !!b)));
    const consecutives = Array.from(new Set(productsToRegister.map(p => (p.consecutivo || '').trim()).filter(c => !!c)));

    const firstProduct = productsToRegister.length > 0 ? productsToRegister[0] : null;

    return {
      inventoryStaff: {
        area: this.inventoryArea || '',
        persons: [
          {
            Person1: this.personName1 || '',
            Person2: this.personName2 || ''
          }
        ]
      },
      inventory: {
        barcode: barcodes, // array de códigos de barras
        producto: firstProduct?.productName || '',
        referencia: firstProduct?.reference || '',
        codRef: firstProduct?.productCode || '',
        consecutive: consecutives, // array de consecutivos
        validate: true
      }
    };
  }

  /**
   * Envía al backend los productos seleccionados junto con los datos de usuario (área / nombres).
   */

  registerInventory() {
    if (!this.inventoryArea || !this.personName1 || !this.personName2) {
      this.statusMessage = 'Complete Área y ambos nombres antes de registrar.';
      return;
    }

    const productsToRegister: Product[] = this.readingMode === 'simple'
      ? (this.currentProduct ? [this.currentProduct] : [])
      : this.regletaProducts;

    if (!productsToRegister || productsToRegister.length === 0) {
      this.statusMessage = 'No hay productos para registrar.';
      return;
    }

    if (this.loading) {
      this.statusMessage = 'Espere, ya se está procesando otra petición...';
      return;
    }

    const payload = this.buildInsertPayload(productsToRegister);

    if ((!payload.inventory.barcode || payload.inventory.barcode.length === 0) &&
        (!payload.inventory.consecutive || payload.inventory.consecutive.length === 0)) {
      this.statusMessage = 'Los productos no tienen códigos válidos para registrar.';
      return;
    }

    // preparar UI
    this.loading = true;
    this.statusMessage = 'Registrando en inventario...';
    this.serverResponse = null;
    this.duplicateBarcode = null;
    this.serverSuccess = null;

    this.dashService.getInsertInventory(payload)
      .pipe(finalize(() => { this.loading = false; }))
      .subscribe({
        next: (resp: any) => {
          this.serverResponse = resp;

          if (resp && resp.ok === true) {
            this.serverSuccess = true;
            this.statusMessage = resp.msg || 'Registrado correctamente en el inventario.';

            // limpiar productos (mantener usuario)
            this.currentProduct = null;
            this.regletaProducts = [];
            this.scannedCodes = [];

            setTimeout(() => document.getElementById('codigoBarras')?.focus(), 50);
          } else {
            // error del backend (ok === false)
            this.serverSuccess = false;
            this.statusMessage = resp?.msg || 'Error al registrar en el inventario.';
            this.duplicateBarcode = resp?.duplicateBarcode ?? null;
          }
        },
        error: (err) => {
          console.error('Error al insertar inventario:', err);
          this.serverSuccess = false;
          this.serverResponse = err;
          this.duplicateBarcode = null;
          this.statusMessage = err?.message ? `Error: ${err.message}` : 'Error al registrar inventario.';
        }
      });
  }

  /**
   * Añade el barcode duplicado a scannedCodes si no existe.
   */
  addDuplicateToScanned(barcode: string | null) {
    if (!barcode) {
      this.statusMessage = 'Barcode inválido.';
      return;
    }
    if (!this.scannedCodes.includes(barcode)) {
      this.scannedCodes.push(barcode);
      this.statusMessage = 'Barcode duplicado añadido a escaneados.';
    } else {
      this.statusMessage = 'El barcode ya está en la lista de escaneados.';
    }
    setTimeout(() => document.getElementById('codigoBarras')?.focus(), 50);
  }

  /**
   * Copia texto al portapapeles (usa navigator.clipboard si está disponible).
   */
  copyToClipboard(text: string | null) {
    if (!text) {
      this.statusMessage = 'Nada para copiar.';
      return;
    }

    if (navigator && typeof navigator.clipboard?.writeText === 'function') {
      navigator.clipboard.writeText(text).then(
        () => { this.statusMessage = 'Código copiado al portapapeles.'; },
        (err) => { this.statusMessage = 'No se pudo copiar al portapapeles.'; console.error(err); }
      );
    } else {
      // fallback
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        this.statusMessage = 'Código copiado (fallback).';
      } catch (err) {
        this.statusMessage = 'No se pudo copiar (fallback).';
        console.error(err);
      }
    }
  }
  

  private handleError(error: HttpErrorResponse) {
    console.error('DashInventoryServices: Error en la petición:', error);

    // 1. Revisa si el backend envió un objeto de error {ok, msg, ...}
    //    Esto es lo que ves en tu Imagen 2 (DevTools)
    if (error.error && typeof error.error === 'object' && error.error.msg) {
        // Devuelve el objeto de error del backend
        return throwError(() => error.error);
    }

    // 2. Si no, crea un objeto de error genérico que coincida con la interfaz
    //    Esto cubrirá errores de red, 500, etc.
    const genericErrorMessage = `Error ${error.status}: ${error.statusText}. Por favor, contacte a soporte.`;
    
    return throwError(() => ({
        ok: false,
        msg: genericErrorMessage,
        validationError: false // o la propiedad que necesites
    }));
}

}