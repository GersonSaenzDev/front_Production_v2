// src/app/warehouse/order-preparation/order-preparation.ts

import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DashInventoryServices } from 'src/app/services/dashInventory-services';
import { Barcode, UpdateBarcodeRequest, ViewOrderData } from 'src/app/interfaces/dashInventory.interface';

@Component({
  selector: 'app-order-preparation',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule
  ],
  templateUrl: './order-preparation.html',
  styleUrl: './order-preparation.scss'
})
export class OrderPreparation implements OnInit {

  private inventorySvc = inject(DashInventoryServices);
  private fb = inject(FormBuilder);

  uploadForm!: FormGroup;
  selectedFile: File | null = null;

  orderData: ViewOrderData | null = null;
  loading = false;

  ngOnInit(): void {
    this.buildForm();
    this.loadOrder();
  }

  private buildForm(): void {
    this.uploadForm = this.fb.group({
      file: [null, Validators.required]
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;

    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
      this.uploadForm.patchValue({ file: this.selectedFile });
    }
  }

  uploadFile(): void {
    if (!this.selectedFile) {
      alert('Por favor, selecciona un archivo primero.');
      return;
    }

    this.loading = true;

    this.inventorySvc.updateOrder(this.selectedFile).subscribe({
      next: (res) => {
        console.log('Respuesta backend:', res);
        this.selectedFile = null;
        this.uploadForm.reset();
        this.loadOrder();
        alert('Archivo cargado con éxito');
      },
      error: (err) => {
        this.loading = false;
        // Esto te mostrará el mensaje exacto: "Solo se permiten archivos CSV, TXT o SAL."
        alert('Error al cargar: ' + err.message); 
      }
    });
  }

  loadOrder(): void {
    this.inventorySvc.viewOrder().subscribe({
      next: response => {
        this.orderData = response.data;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  // markAsLoaded -> Servicio: updateOrderItems
  markAsLoaded(item: Barcode): void {
    const payload: UpdateBarcodeRequest = {
      _id: item._id,
      code: item.code,
      loadBarcode: true
    };

    this.loading = true;
    this.inventorySvc.updateOrderItems(payload).subscribe({
      next: (res) => {
        item.loadBarcode = true; // Feedback visual inmediato
        this.loading = false;
        console.log('Item confirmado exitosamente');
      },
      error: () => this.loading = false
    });
  }

  // replaceCode -> Servicio: updateBarcodeReadController
  replaceCode(item: Barcode, newCode: string): void {
    // 1. Validaciones básicas
    if (!newCode || newCode.trim().length === 0) {
      alert('El código no puede estar vacío');
      return;
    }

    // 2. Preparar el payload con el ID del ITEM
    const payload: UpdateBarcodeRequest = {
      _id: item._id,   // <-- ID único del subdocumento
      code: newCode.trim(),
      codeRead: true
    };

    this.loading = true;

    // 3. Llamar al servicio
    this.inventorySvc.updateBarcodeReadController(payload).subscribe({
      next: (res) => {
        // Actualización exitosa en UI
        item.code = newCode.trim();
        item.loadBarcode = true;
        item.codeRead = true; // Si manejas esta propiedad en la interfaz
        
        this.loading = false;
        console.log('Respuesta:', res.msg);
      },
      error: (err) => {
        this.loading = false;
        alert('No se pudo reemplazar el código: ' + err.message);
      }
    });
  }
}