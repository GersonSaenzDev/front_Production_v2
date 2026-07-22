// app/engineering/structure-managements/capacity-analysis/capacity-analysis.ts
import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { finalize } from 'rxjs';
import {
  CapacityAnalysisPayload,
  CapacityAnalysisResult,
  ProductStructureListItem
} from '../../../interfaces/product-structure.interface';
import { ProductStructureServices } from '../../../services/product-structure-services';
import { GlobalFilterPipe } from '../../../shared/pipes/global-filter.pipe';
import { WorkConfigEditor } from '../shared/work-config-editor/work-config-editor';

/** Fila seleccionable de la tabla de referencias, con la cantidad a analizar. */
interface SelectableStructure {
  structure: ProductStructureListItem;
  selected: boolean;
  quantity: number;
}

@Component({
  selector: 'app-capacity-analysis',
  standalone: true,
  imports: [CommonModule, FormsModule, GlobalFilterPipe, WorkConfigEditor],
  templateUrl: './capacity-analysis.html',
  styleUrl: './capacity-analysis.scss'
})
export class CapacityAnalysis implements OnInit {
  private productStructureService = inject(ProductStructureServices);
  private toastr = inject(ToastrService);

  @ViewChild('configEditor') configEditor!: WorkConfigEditor;

  rows: SelectableStructure[] = [];
  isLoadingList = false;
  searchTerm = '';

  isAnalyzing = false;
  result: CapacityAnalysisResult | null = null;

  // Buscadores inteligentes de las tablas de resultado (filtran por cualquier campo)
  referencesResultSearchTerm = '';
  bottlenecksSearchTerm = '';
  warehousesSearchTerm = '';

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

    const config = this.configEditor.getConfig();
    const payload: CapacityAnalysisPayload = {
      references: selected.map((r) => ({ internalCode: r.structure.internalCode, quantity: r.quantity })),
      workSchedules: config.workSchedules,
      staffArea: config.staffArea,
      warehouseStaffMap: config.warehouseStaffMap
    };

    this.isAnalyzing = true;
    this.result = null;
    this.referencesResultSearchTerm = '';
    this.bottlenecksSearchTerm = '';
    this.warehousesSearchTerm = '';
    this.productStructureService
      .analyzeCapacity(payload)
      .pipe(finalize(() => (this.isAnalyzing = false)))
      .subscribe({
        next: (res) => {
          if (!res?.ok) {
            this.toastr.error('No se pudo analizar la capacidad de planta.', 'Error');
            return;
          }
          this.result = res.msg;
        },
        error: (err: Error) => this.toastr.error(err.message || 'Error al analizar la capacidad.', 'Error')
      });
  }

  clearResult(): void {
    this.result = null;
  }
}
