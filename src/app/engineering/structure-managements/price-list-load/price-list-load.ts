// app/engineering/structure-managements/price-list-load/price-list-load.ts
import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { finalize } from 'rxjs';
import { PriceListServices } from '../../../services/price-list-services';

/** Resumen del último cargue exitoso, para mostrar el feedback al usuario. */
interface UploadResultSummary {
  message: string;
  metrics: { label: string; value: number }[];
}

@Component({
  selector: 'app-price-list-load',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './price-list-load.html',
  styleUrl: './price-list-load.scss'
})
export class PriceListLoad {
  private priceListService = inject(PriceListServices);
  private toastr = inject(ToastrService);

  /** Extensiones de Excel aceptadas por el input de archivo. */
  readonly acceptedFiles = '.xlsx,.xls';

  priceListFile: File | null = null;
  isSubmitting = false;
  lastResult: UploadResultSummary | null = null;

  // =======================
  //  MANEJO DE ARCHIVO
  // =======================
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.assignFile(input.files?.[0] ?? null);
  }

  onFileDropped(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.assignFile(event.dataTransfer?.files?.[0] ?? null);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  private assignFile(file: File | null): void {
    if (file && !this.isExcel(file)) {
      this.toastr.warning('Solo se permiten archivos de Excel (.xlsx, .xls).', 'Archivo no válido');
      return;
    }
    this.priceListFile = file;
  }

  clearFile(): void {
    this.priceListFile = null;
  }

  private isExcel(file: File): boolean {
    return /\.(xlsx|xls)$/i.test(file.name);
  }

  /** Formatea el tamaño del archivo para mostrarlo legible. */
  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  // =======================
  //  ENVÍO
  // =======================
  onSubmit(): void {
    if (!this.priceListFile) {
      this.toastr.warning('Seleccione el archivo de la lista de precios.', 'Archivo requerido');
      return;
    }

    this.isSubmitting = true;
    this.priceListService
      .uploadPriceList(this.priceListFile)
      .pipe(finalize(() => (this.isSubmitting = false)))
      .subscribe({
        next: (res) => {
          this.toastr.success(res.msg, 'Lista de precios cargada');
          this.lastResult = {
            message: res.msg,
            metrics: [
              { label: 'Creados', value: res.upsertedCount },
              { label: 'Actualizados', value: res.modifiedCount },
              { label: 'Total registros', value: res.totalRecords }
            ]
          };
          this.clearFile();
        },
        error: (err: Error) => this.toastr.error(err.message, 'Error al cargar')
      });
  }
}
