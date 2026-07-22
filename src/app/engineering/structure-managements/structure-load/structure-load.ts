// app/engineering/structure-managements/structure-load/structure-load.ts
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { finalize } from 'rxjs';
import { ProductStructureListItem } from '../../../interfaces/product-structure.interface';
import { ProductStructureServices } from '../../../services/product-structure-services';

/** Resumen del último cargue exitoso, para mostrar el feedback al usuario. */
interface UploadResultSummary {
  message: string;
  metrics: { label: string; value: number }[];
}

@Component({
  selector: 'app-structure-load',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './structure-load.html',
  styleUrl: './structure-load.scss'
})
export class StructureLoad implements OnInit {
  private productStructureService = inject(ProductStructureServices);
  private toastr = inject(ToastrService);

  /** Extensiones de Excel aceptadas por el input de archivo. */
  readonly acceptedFiles = '.xlsx,.xls';

  structureFile: File | null = null;
  isSubmitting = false;
  lastResult: UploadResultSummary | null = null;

  structures: ProductStructureListItem[] = [];
  isLoading = false;
  searchTerm = '';

  ngOnInit(): void {
    this.loadStructures();
  }

  // =======================
  //  LISTADO
  // =======================
  loadStructures(): void {
    this.isLoading = true;
    this.productStructureService
      .listProductStructures()
      .pipe(finalize(() => (this.isLoading = false)))
      .subscribe({
        next: (res) => (this.structures = res?.ok && res.msg ? res.msg : []),
        error: (err: Error) => {
          this.structures = [];
          this.toastr.error(err.message || 'No se pudieron cargar las estructuras.', 'Error');
        }
      });
  }

  get filteredStructures(): ProductStructureListItem[] {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) return this.structures;
    return this.structures.filter(
      (s) =>
        s.internalCode.toLowerCase().includes(term) ||
        s.codRef.toLowerCase().includes(term) ||
        s.reference.toLowerCase().includes(term) ||
        s.productName.toLowerCase().includes(term)
    );
  }

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
    this.structureFile = file;
  }

  clearFile(): void {
    this.structureFile = null;
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
    if (!this.structureFile) {
      this.toastr.warning('Seleccione el archivo de la estructura.', 'Archivo requerido');
      return;
    }

    this.isSubmitting = true;
    this.productStructureService
      .uploadProductStructure(this.structureFile)
      .pipe(finalize(() => (this.isSubmitting = false)))
      .subscribe({
        next: (res) => {
          this.toastr.success(res.msg, 'Estructura cargada');
          this.lastResult = {
            message: res.msg,
            metrics: [
              { label: 'Creadas', value: res.upsertedCount },
              { label: 'Actualizadas', value: res.modifiedCount },
              { label: 'Total registros', value: res.totalRecords }
            ]
          };
          this.clearFile();
          this.loadStructures();
        },
        error: (err: Error) => this.toastr.error(err.message, 'Error al cargar')
      });
  }
}
