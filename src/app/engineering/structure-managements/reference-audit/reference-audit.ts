// app/engineering/structure-managements/reference-audit/reference-audit.ts
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { finalize } from 'rxjs';
import {
  ProductStructureListItem,
  ReferenceAuditPayload,
  ReferenceAuditResult
} from '../../../interfaces/product-structure.interface';
import { ProductStructureServices } from '../../../services/product-structure-services';
import { GlobalFilterPipe } from '../../../shared/pipes/global-filter.pipe';

@Component({
  selector: 'app-reference-audit',
  standalone: true,
  imports: [CommonModule, FormsModule, GlobalFilterPipe],
  templateUrl: './reference-audit.html',
  styleUrl: './reference-audit.scss'
})
export class ReferenceAudit implements OnInit {
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

  isAuditing = false;
  result: ReferenceAuditResult | null = null;

  // Expansión de la tabla byUnit → materiales → líneas
  expandedUnits = new Set<string>();
  expandedMaterials = new Set<string>();

  // Buscadores inteligentes de las tablas de resultado (filtran por cualquier campo)
  level1SearchTerm = '';

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
  }

  clearSelection(): void {
    this.selectedStructure = null;
    this.searchTerm = '';
    this.result = null;
  }

  // =======================
  //  AUDITORÍA
  // =======================
  audit(): void {
    if (!this.selectedStructure) {
      this.toastr.warning('Seleccione una referencia para auditar.', 'Selección requerida');
      return;
    }
    if (!this.plannedQuantity || this.plannedQuantity < 1) {
      this.toastr.warning('Ingrese una cantidad planeada válida (mínimo 1).', 'Cantidad inválida');
      return;
    }

    const payload: ReferenceAuditPayload = {
      internalCode: this.selectedStructure.internalCode,
      plannedQuantity: this.plannedQuantity
    };

    this.isAuditing = true;
    this.result = null;
    this.expandedUnits.clear();
    this.expandedMaterials.clear();
    this.level1SearchTerm = '';
    this.productStructureService
      .auditReference(payload)
      .pipe(finalize(() => (this.isAuditing = false)))
      .subscribe({
        next: (res) => {
          if (!res?.ok) {
            this.toastr.error('No se pudo ejecutar la auditoría de la referencia.', 'Error');
            return;
          }
          this.result = res.msg;
        },
        error: (err: Error) => this.toastr.error(err.message || 'Error al auditar la referencia.', 'Error')
      });
  }

  // =======================
  //  EXPANSIÓN BYUNIT
  // =======================
  toggleUnit(unit: string): void {
    if (this.expandedUnits.has(unit)) {
      this.expandedUnits.delete(unit);
    } else {
      this.expandedUnits.add(unit);
    }
  }

  isUnitExpanded(unit: string): boolean {
    return this.expandedUnits.has(unit);
  }

  toggleMaterial(unit: string, materialCode: string): void {
    const key = `${unit}::${materialCode}`;
    if (this.expandedMaterials.has(key)) {
      this.expandedMaterials.delete(key);
    } else {
      this.expandedMaterials.add(key);
    }
  }

  isMaterialExpanded(unit: string, materialCode: string): boolean {
    return this.expandedMaterials.has(`${unit}::${materialCode}`);
  }
}
