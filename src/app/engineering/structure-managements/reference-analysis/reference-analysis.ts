// app/engineering/structure-managements/reference-analysis/reference-analysis.ts
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { finalize } from 'rxjs';
import {
  ProductStructureListItem,
  ReferenceAnalysisPayload,
  ReferenceAnalysisResult
} from '../../../interfaces/product-structure.interface';
import { ProductStructureServices } from '../../../services/product-structure-services';
import { GlobalFilterPipe } from '../../../shared/pipes/global-filter.pipe';

/** Opción del multi-select opcional de materiales, tomada del BOM de la referencia elegida. */
interface MaterialOption {
  productCode: string;
  name: string;
}

@Component({
  selector: 'app-reference-analysis',
  standalone: true,
  imports: [CommonModule, FormsModule, GlobalFilterPipe],
  templateUrl: './reference-analysis.html',
  styleUrl: './reference-analysis.scss'
})
export class ReferenceAnalysis implements OnInit {
  private productStructureService = inject(ProductStructureServices);
  private toastr = inject(ToastrService);

  structures: ProductStructureListItem[] = [];
  isLoadingList = false;

  // Buscador predictivo de referencias
  searchTerm = '';
  predictiveResults: ProductStructureListItem[] = [];
  showDropdown = false;
  private isSelecting = false;

  selectedStructure: ProductStructureListItem | null = null;
  plannedQuantity = 1;

  // Filtro opcional de materiales, poblado desde el BOM de la referencia elegida
  materialOptions: MaterialOption[] = [];
  selectedMaterials = new Set<string>();
  isLoadingMaterials = false;

  isAnalyzing = false;
  result: ReferenceAnalysisResult | null = null;

  // Buscadores inteligentes de las tablas de resultado (filtran por cualquier campo)
  excludedLinesSearchTerm = '';
  warehousesSearchTerm = '';
  deepGapsSearchTerm = '';

  ngOnInit(): void {
    this.isLoadingList = true;
    this.productStructureService
      .listProductStructures()
      .pipe(finalize(() => (this.isLoadingList = false)))
      .subscribe({
        next: (res) => (this.structures = res?.ok && res.msg ? res.msg : []),
        error: (err: Error) => {
          this.structures = [];
          this.toastr.error(err.message || 'No se pudieron cargar las referencias.', 'Error');
        }
      });
  }

  // =======================
  //  BUSCADOR PREDICTIVO
  // =======================
  onSearchChange(term: string): void {
    if (this.isSelecting) return;
    const t = (term || '').trim().toLowerCase();
    if (t.length < 1) {
      this.predictiveResults = [];
      this.showDropdown = false;
      return;
    }
    this.predictiveResults = this.structures
      .filter(
        (s) =>
          s.internalCode.toLowerCase().includes(t) ||
          s.codRef.toLowerCase().includes(t) ||
          s.reference.toLowerCase().includes(t) ||
          s.productName.toLowerCase().includes(t)
      )
      .slice(0, 20);
    this.showDropdown = this.predictiveResults.length > 0;
  }

  onFocus(): void {
    if (this.isSelecting) return;
    if (this.predictiveResults.length > 0) this.showDropdown = true;
  }

  onBlur(): void {
    setTimeout(() => (this.showDropdown = false), 120);
  }

  selectStructure(structure: ProductStructureListItem): void {
    this.isSelecting = true;
    this.searchTerm = `${structure.internalCode} — ${structure.productName}`;
    this.predictiveResults = [];
    this.showDropdown = false;
    setTimeout(() => (this.isSelecting = false), 300);

    this.selectedStructure = structure;
    this.result = null;
    this.loadMaterialOptions(structure.internalCode);
  }

  clearSelection(): void {
    this.selectedStructure = null;
    this.searchTerm = '';
    this.materialOptions = [];
    this.selectedMaterials.clear();
    this.result = null;
  }

  // =======================
  //  MATERIALES (FILTRO OPCIONAL)
  // =======================
  private loadMaterialOptions(internalCode: string): void {
    this.isLoadingMaterials = true;
    this.materialOptions = [];
    this.selectedMaterials.clear();
    this.productStructureService
      .getProductStructureDetail(internalCode)
      .pipe(finalize(() => (this.isLoadingMaterials = false)))
      .subscribe({
        next: (res) => {
          if (!res?.ok) return;
          const seen = new Map<string, string>();
          for (const line of res.msg.bom) {
            if (!seen.has(line.productCode)) {
              seen.set(line.productCode, line.name);
            }
          }
          this.materialOptions = Array.from(seen.entries())
            .map(([productCode, name]) => ({ productCode, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
        },
        error: (err: Error) => this.toastr.error(err.message || 'No se pudo cargar el BOM de la referencia.', 'Error')
      });
  }

  toggleMaterial(productCode: string): void {
    if (this.selectedMaterials.has(productCode)) {
      this.selectedMaterials.delete(productCode);
    } else {
      this.selectedMaterials.add(productCode);
    }
  }

  isMaterialSelected(productCode: string): boolean {
    return this.selectedMaterials.has(productCode);
  }

  clearMaterialFilter(): void {
    this.selectedMaterials.clear();
  }

  // =======================
  //  ANÁLISIS
  // =======================
  analyze(): void {
    if (!this.selectedStructure) {
      this.toastr.warning('Seleccione una referencia para analizar.', 'Selección requerida');
      return;
    }
    if (!this.plannedQuantity || this.plannedQuantity < 1) {
      this.toastr.warning('Ingrese una cantidad planeada válida (mínimo 1).', 'Cantidad inválida');
      return;
    }

    const payload: ReferenceAnalysisPayload = {
      internalCode: this.selectedStructure.internalCode,
      plannedQuantity: this.plannedQuantity
    };
    if (this.selectedMaterials.size > 0) {
      payload.materials = Array.from(this.selectedMaterials);
    }

    this.isAnalyzing = true;
    this.result = null;
    this.excludedLinesSearchTerm = '';
    this.warehousesSearchTerm = '';
    this.deepGapsSearchTerm = '';
    this.productStructureService
      .analyzeReference(payload)
      .pipe(finalize(() => (this.isAnalyzing = false)))
      .subscribe({
        next: (res) => {
          if (!res?.ok) {
            this.toastr.error('No se pudo ejecutar el análisis de la referencia.', 'Error');
            return;
          }
          this.result = res.msg;
        },
        error: (err: Error) => this.toastr.error(err.message || 'Error al analizar la referencia.', 'Error')
      });
  }
}
