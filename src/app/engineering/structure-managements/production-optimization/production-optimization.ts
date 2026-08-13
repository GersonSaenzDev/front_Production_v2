// app/engineering/structure-managements/production-optimization/production-optimization.ts
import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { finalize } from 'rxjs';
import {
  OptimizationResult,
  ProductStructureListItem,
  ProductionOptimizationPayload
} from '../../../interfaces/product-structure.interface';
import { ProductStructureServices } from '../../../services/product-structure-services';
import { GlobalFilterPipe } from '../../../shared/pipes/global-filter.pipe';
import { WorkConfigEditor } from '../shared/work-config-editor/work-config-editor';

/** Fila seleccionable de la tabla de referencias, con la cantidad solicitada. */
interface SelectableStructure {
  structure: ProductStructureListItem;
  selected: boolean;
  quantity: number;
}

@Component({
  selector: 'app-production-optimization',
  standalone: true,
  imports: [CommonModule, FormsModule, GlobalFilterPipe, WorkConfigEditor],
  templateUrl: './production-optimization.html',
  styleUrl: './production-optimization.scss'
})
export class ProductionOptimization implements OnInit {
  private productStructureService = inject(ProductStructureServices);
  private toastr = inject(ToastrService);

  @ViewChild('configEditor') configEditor!: WorkConfigEditor;

  rows: SelectableStructure[] = [];
  isLoadingList = false;
  searchTerm = '';

  isOptimizing = false;
  result: OptimizationResult | null = null;

  // Buscadores inteligentes de las tablas de resultado (filtran por cualquier campo)
  bySectionSearchTerm = '';
  maxByReferenceSearchTerm = '';
  proportionalMixSearchTerm = '';
  optimalMixSearchTerm = '';
  bindingSectionsSearchTerm = '';

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
  //  OPTIMIZACIÓN
  // =======================
  optimize(): void {
    const selected = this.selectedRows;
    if (selected.length === 0) {
      this.toastr.warning('Seleccione al menos una referencia para optimizar.', 'Selección requerida');
      return;
    }
    const invalid = selected.find((r) => !r.quantity || r.quantity < 1);
    if (invalid) {
      this.toastr.warning('Ingrese una cantidad válida (mínimo 1) para cada referencia seleccionada.', 'Cantidad inválida');
      return;
    }

    const config = this.configEditor.getConfig();
    const payload: ProductionOptimizationPayload = {
      references: selected.map((r) => ({ internalCode: r.structure.internalCode, quantity: r.quantity })),
      workSchedules: config.workSchedules,
      staffArea: config.staffArea,
      warehouseStaffMap: config.warehouseStaffMap
    };

    this.isOptimizing = true;
    this.result = null;
    this.bySectionSearchTerm = '';
    this.maxByReferenceSearchTerm = '';
    this.proportionalMixSearchTerm = '';
    this.optimalMixSearchTerm = '';
    this.bindingSectionsSearchTerm = '';
    this.productStructureService
      .optimizeProduction(payload)
      .pipe(finalize(() => (this.isOptimizing = false)))
      .subscribe({
        next: (res) => {
          if (!res?.ok) {
            this.toastr.error('No se pudo calcular la optimización de producción.', 'Error');
            return;
          }
          this.result = res.msg;
        },
        error: (err: Error) => this.toastr.error(err.message || 'Error al optimizar la producción.', 'Error')
      });
  }

  clearResult(): void {
    this.result = null;
  }

  queueRiskClass(risk: string): string {
    const normalized = (risk || '').toUpperCase();
    // SATURADA (utilización >= 100%) es más crítica que ALTA — con el split
    // Exportación/Nacional de ED/SE es habitual verla mientras el departamento
    // de RH correspondiente tenga poca o ninguna gente asignada todavía.
    if (normalized === 'SATURADA') return 'badge bg-dark';
    if (normalized === 'ALTA') return 'badge bg-danger';
    if (normalized === 'MEDIA') return 'badge bg-warning text-dark';
    return 'badge bg-success';
  }
}
