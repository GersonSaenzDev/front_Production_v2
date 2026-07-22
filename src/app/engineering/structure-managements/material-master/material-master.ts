// app/engineering/structure-managements/material-master/material-master.ts
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { finalize } from 'rxjs';
import {
  MaterialsAnalysisPayload,
  MaterialsAnalysisResult,
  ProductStructureListItem
} from '../../../interfaces/product-structure.interface';
import { ProductStructureServices } from '../../../services/product-structure-services';
import { GlobalFilterPipe } from '../../../shared/pipes/global-filter.pipe';

/** Fila seleccionable de la tabla de referencias, con la cantidad a analizar. */
interface SelectableStructure {
  structure: ProductStructureListItem;
  selected: boolean;
  quantity: number;
}

@Component({
  selector: 'app-material-master',
  standalone: true,
  imports: [CommonModule, FormsModule, GlobalFilterPipe],
  templateUrl: './material-master.html',
  styleUrl: './material-master.scss'
})
export class MaterialMaster implements OnInit {
  private productStructureService = inject(ProductStructureServices);
  private toastr = inject(ToastrService);

  rows: SelectableStructure[] = [];
  isLoadingList = false;
  searchTerm = '';

  isAnalyzing = false;
  result: MaterialsAnalysisResult | null = null;
  expandedMaterials = new Set<string>();

  // Buscadores inteligentes de las tablas de resultado (filtran por cualquier campo)
  referencesResultSearchTerm = '';
  materialsSearchTerm = '';

  ngOnInit(): void {
    this.isLoadingList = true;
    this.productStructureService
      .listProductStructures()
      .pipe(finalize(() => (this.isLoadingList = false)))
      .subscribe({
        next: (res) => {
          const items = res?.ok && res.msg ? res.msg : [];
          this.rows = items.map((structure) => ({ structure, selected: false, quantity: 1 }));
        },
        error: (err: Error) => {
          this.rows = [];
          this.toastr.error(err.message || 'No se pudieron cargar las referencias.', 'Error');
        }
      });
  }

  get filteredRows(): SelectableStructure[] {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) return this.rows;
    return this.rows.filter(
      (r) =>
        r.structure.internalCode.toLowerCase().includes(term) ||
        r.structure.codRef.toLowerCase().includes(term) ||
        r.structure.reference.toLowerCase().includes(term) ||
        r.structure.productName.toLowerCase().includes(term)
    );
  }

  get selectedRows(): SelectableStructure[] {
    return this.rows.filter((r) => r.selected);
  }

  get selectedCount(): number {
    return this.selectedRows.length;
  }

  toggleRow(row: SelectableStructure): void {
    row.selected = !row.selected;
    if (row.selected && (!row.quantity || row.quantity < 1)) {
      row.quantity = 1;
    }
  }

  // =======================
  //  ANÁLISIS
  // =======================
  analyze(): void {
    const selected = this.selectedRows;
    if (selected.length === 0) {
      this.toastr.warning('Seleccione al menos una referencia para analizar.', 'Selección requerida');
      return;
    }
    const invalid = selected.find((r) => !r.quantity || r.quantity < 1);
    if (invalid) {
      this.toastr.warning('Ingrese una cantidad válida (mínimo 1) para cada referencia seleccionada.', 'Cantidad inválida');
      return;
    }

    const payload: MaterialsAnalysisPayload = {
      references: selected.map((r) => ({ internalCode: r.structure.internalCode, quantity: r.quantity }))
    };

    this.isAnalyzing = true;
    this.result = null;
    this.expandedMaterials.clear();
    this.referencesResultSearchTerm = '';
    this.materialsSearchTerm = '';
    this.productStructureService
      .analyzeMaterials(payload)
      .pipe(finalize(() => (this.isAnalyzing = false)))
      .subscribe({
        next: (res) => {
          if (!res?.ok) {
            this.toastr.error('No se pudo ejecutar el análisis de materiales.', 'Error');
            return;
          }
          this.result = res.msg;
        },
        error: (err: Error) => this.toastr.error(err.message || 'Error al analizar materiales.', 'Error')
      });
  }

  clearResult(): void {
    this.result = null;
    this.expandedMaterials.clear();
  }

  // =======================
  //  MATERIALES: EXPANDIR DESGLOSE
  // =======================
  toggleMaterial(productCode: string): void {
    if (this.expandedMaterials.has(productCode)) {
      this.expandedMaterials.delete(productCode);
    } else {
      this.expandedMaterials.add(productCode);
    }
  }

  isMaterialExpanded(productCode: string): boolean {
    return this.expandedMaterials.has(productCode);
  }
}
