// app/engineering/structure-managements/view-by-reference/view-by-reference.ts
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { finalize } from 'rxjs';
import {
  ProductStructureBomLine,
  ProductStructureDetail,
  ProductStructureListItem
} from '../../../interfaces/product-structure.interface';
import { ProductStructureServices } from '../../../services/product-structure-services';
import { GlobalFilterPipe } from '../../../shared/pipes/global-filter.pipe';

@Component({
  selector: 'app-view-by-reference',
  standalone: true,
  imports: [CommonModule, FormsModule, GlobalFilterPipe],
  templateUrl: './view-by-reference.html',
  styleUrl: './view-by-reference.scss'
})
export class ViewByReference implements OnInit {
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
  detail: ProductStructureDetail | null = null;
  isLoadingDetail = false;

  // Buscador inteligente de la tabla BOM (filtra por cualquier campo)
  bomSearchTerm = '';

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
    this.loadDetail(structure.internalCode);
  }

  clearSelection(): void {
    this.selectedStructure = null;
    this.detail = null;
    this.searchTerm = '';
    this.bomSearchTerm = '';
  }

  // =======================
  //  DETALLE
  // =======================
  private loadDetail(internalCode: string): void {
    this.isLoadingDetail = true;
    this.detail = null;
    this.bomSearchTerm = '';
    this.productStructureService
      .getProductStructureDetail(internalCode)
      .pipe(finalize(() => (this.isLoadingDetail = false)))
      .subscribe({
        next: (res) => {
          if (!res?.ok) {
            this.toastr.error('No se pudo cargar el detalle de la referencia.', 'Error');
            return;
          }
          this.detail = res.msg;
        },
        error: (err: Error) => this.toastr.error(err.message || 'Error al cargar el detalle.', 'Error')
      });
  }

  // =======================
  //  HELPERS DE PRESENTACIÓN
  // =======================
  indentPx(line: ProductStructureBomLine): number {
    return (line.level - 1) * 18;
  }

  itemTypeLabel(itemType: string): string {
    return itemType === 'rawMaterial' ? 'Materia Prima' : 'Producto';
  }

  itemTypeBadgeClass(itemType: string): string {
    return itemType === 'rawMaterial' ? 'badge bg-warning text-dark' : 'badge bg-primary';
  }

  lineCost(line: ProductStructureBomLine): number {
    return line.requiredQuantity * line.lastPurchasePrice;
  }

  get totalBomCost(): number {
    return (this.detail?.bom || []).reduce((acc, line) => acc + this.lineCost(line), 0);
  }
}
