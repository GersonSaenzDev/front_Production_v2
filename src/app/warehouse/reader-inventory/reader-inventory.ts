// src/app/warehouse/reader-inventory/reader-inventory.ts
import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';

import { DashInventoryServices } from 'src/app/services/dashInventory-services';
import { StorageItem } from 'src/app/interfaces/dashInventory.interface';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
}

@Component({
  selector: 'app-inventory-reader',
  standalone: true,
  imports: [ CommonModule, FormsModule ],
  templateUrl: './reader-inventory.html',
  styleUrls: ['./reader-inventory.scss']
})
export class InventoryReader implements OnInit {
  private dashService = inject(DashInventoryServices);

  // Modo de lectura
  readingMode: 'simple' | 'regleta' = 'simple';

  // Código de barras actual
  barcodeInput: string = '';

  // Lista de códigos leídos
  scannedCodes: string[] = [];

  // Producto actual (modo simple)
  currentProduct: Product | null = null;

  // Productos en la regleta (modo regleta)
  regletaProducts: Product[] = [];

  // Mensaje de estado
  statusMessage: string = '';

  // Campos del formulario (panel derecho)
  inventoryArea: string = '';
  personName1: string = '';
  personName2: string = '';

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

  readBarcode() {
    const code = (this.barcodeInput || '').trim();
    if (!code) {
      this.statusMessage = 'Por favor ingrese un código de barras.';
      return;
    }

    // Validar que solo contenga números (ajusta si aceptas letras)
    if (!/^\d+$/.test(code)) {
      this.statusMessage = 'El código de barras solo debe contener números.';
      return;
    }

    // Evitar duplicados en la lista (opcional)
    if (!this.scannedCodes.includes(code)) {
      this.scannedCodes.push(code);
    }

    // Llamada real al backend usando el servicio
    this.fetchProductInfo(code);

    // Limpiar input para próxima lectura
    this.barcodeInput = '';
  }

  private mapStorageItemToProduct(item: StorageItem): Product {
    return {
      id: item.barcode ?? item.consecutivo ?? item.productCode ?? '',
      name: item.productName ?? item.productCode ?? 'Sin nombre',
      description: item.reference ?? item.productName ?? '',
      price: 0,
      stock: 0
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
          // Resp esperado: { ok: true, msg: [ ...StorageItem ] }
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
            this.statusMessage = `Producto encontrado: ${this.currentProduct.name}`;
          } else {
            const mapped = data.map((d: StorageItem) => this.mapStorageItemToProduct(d));
            for (const p of mapped) {
              const exists = this.regletaProducts.some(r => r.id === p.id);
              if (!exists) this.regletaProducts.push(p);
            }
            // Mantener máximo 5 (puedes cambiar la política)
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
    this.inventoryArea = '';
    this.personName1 = '';
    this.personName2 = '';
    this.statusMessage = 'Datos limpiados';
  }

  onKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.readBarcode();
    }
  }

  registerInventory() {
    // Validaciones simples
    if (!this.inventoryArea || !this.personName1 || !this.personName2) {
      this.statusMessage = 'Complete Área y ambos nombres antes de registrar.';
      return;
    }

    const productsToRegister = this.readingMode === 'simple'
      ? (this.currentProduct ? [this.currentProduct] : [])
      : this.regletaProducts;

    if (productsToRegister.length === 0) {
      this.statusMessage = 'No hay productos para registrar.';
      return;
    }

    // TODO: Llamar API para registrar inventario con productsToRegister
    this.statusMessage = `Registrado ${productsToRegister.length} producto(s) en '${this.inventoryArea}' por ${this.personName1} y ${this.personName2}.`;

    this.inventoryArea = '';
    this.personName1 = '';
    this.personName2 = '';
  }
}