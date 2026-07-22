// app/engineering/structure-managements/requirements-calculation/requirements-calculation.ts
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { finalize } from 'rxjs';
import {
  ProductStructureListItem,
  ScenarioPayload,
  ScenarioResult
} from '../../../interfaces/product-structure.interface';
import { ProductStructureServices } from '../../../services/product-structure-services';
import { GlobalFilterPipe } from '../../../shared/pipes/global-filter.pipe';

/** Fila seleccionable de la tabla de referencias, con la cantidad a calcular. */
interface SelectableStructure {
  structure: ProductStructureListItem;
  selected: boolean;
  quantity: number;
}

@Component({
  selector: 'app-requirements-calculation',
  standalone: true,
  imports: [CommonModule, FormsModule, GlobalFilterPipe],
  templateUrl: './requirements-calculation.html',
  styleUrl: './requirements-calculation.scss'
})
export class RequirementsCalculation implements OnInit {
  private productStructureService = inject(ProductStructureServices);
  private toastr = inject(ToastrService);

  rows: SelectableStructure[] = [];
  isLoadingList = false;
  searchTerm = '';

  hoursPerDay = 8;

  isCalculating = false;
  result: ScenarioResult | null = null;
  expandedWarehouses = new Set<string>();

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
  //  CÁLCULO
  // =======================
  calculate(): void {
    const selected = this.selectedRows;
    if (selected.length === 0) {
      this.toastr.warning('Seleccione al menos una referencia para calcular.', 'Selección requerida');
      return;
    }
    const invalid = selected.find((r) => !r.quantity || r.quantity < 1);
    if (invalid) {
      this.toastr.warning('Ingrese una cantidad válida (mínimo 1) para cada referencia seleccionada.', 'Cantidad inválida');
      return;
    }
    if (!this.hoursPerDay || this.hoursPerDay < 1) {
      this.toastr.warning('Ingrese las horas disponibles por día (mínimo 1).', 'Horas inválidas');
      return;
    }

    const payload: ScenarioPayload = {
      references: selected.map((r) => ({ internalCode: r.structure.internalCode, quantity: r.quantity })),
      hoursPerDay: this.hoursPerDay
    };

    this.isCalculating = true;
    this.result = null;
    this.expandedWarehouses.clear();
    this.referencesResultSearchTerm = '';
    this.bottlenecksSearchTerm = '';
    this.warehousesSearchTerm = '';
    this.productStructureService
      .calculateScenario(payload)
      .pipe(finalize(() => (this.isCalculating = false)))
      .subscribe({
        next: (res) => {
          if (!res?.ok) {
            this.toastr.error('No se pudo calcular el escenario de requerimientos.', 'Error');
            return;
          }
          this.result = res.msg;
        },
        error: (err: Error) => this.toastr.error(err.message || 'Error al calcular el escenario.', 'Error')
      });
  }

  clearResult(): void {
    this.result = null;
    this.expandedWarehouses.clear();
  }

  // =======================
  //  BODEGAS: EXPANDIR DESGLOSE
  // =======================
  toggleWarehouse(warehouseCode: string): void {
    if (this.expandedWarehouses.has(warehouseCode)) {
      this.expandedWarehouses.delete(warehouseCode);
    } else {
      this.expandedWarehouses.add(warehouseCode);
    }
  }

  isWarehouseExpanded(warehouseCode: string): boolean {
    return this.expandedWarehouses.has(warehouseCode);
  }
}
