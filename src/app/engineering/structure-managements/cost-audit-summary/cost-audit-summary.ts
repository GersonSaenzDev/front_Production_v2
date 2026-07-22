// app/engineering/structure-managements/cost-audit-summary/cost-audit-summary.ts
import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { finalize } from 'rxjs';
import { CostAuditPayload, CostAuditResult } from '../../../interfaces/product-structure.interface';
import { ProductStructureServices } from '../../../services/product-structure-services';
import { GlobalFilterPipe } from '../../../shared/pipes/global-filter.pipe';

@Component({
  selector: 'app-cost-audit-summary',
  standalone: true,
  imports: [CommonModule, FormsModule, GlobalFilterPipe],
  templateUrl: './cost-audit-summary.html',
  styleUrl: './cost-audit-summary.scss'
})
export class CostAuditSummary {
  private productStructureService = inject(ProductStructureServices);
  private toastr = inject(ToastrService);

  // Filtros opcionales de la auditoría
  excludePrefixesInput = '';
  onlyMismatches = true;
  minDifference = 0;

  isAuditing = false;
  result: CostAuditResult | null = null;
  expandedReferences = new Set<string>();

  // Buscador inteligente de la tabla de resultado (filtra por cualquier campo)
  referencesSearchTerm = '';

  audit(): void {
    const payload: CostAuditPayload = {
      excludePrefixes: this.excludePrefixesInput
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0),
      onlyMismatches: this.onlyMismatches,
      minDifference: this.minDifference || 0
    };

    this.isAuditing = true;
    this.result = null;
    this.expandedReferences.clear();
    this.referencesSearchTerm = '';
    this.productStructureService
      .auditCosts(payload)
      .pipe(finalize(() => (this.isAuditing = false)))
      .subscribe({
        next: (res) => {
          if (!res?.ok) {
            this.toastr.error('No se pudo ejecutar la auditoría de costos.', 'Error');
            return;
          }
          this.result = res.msg;
        },
        error: (err: Error) => this.toastr.error(err.message || 'Error al auditar los costos.', 'Error')
      });
  }

  clearResult(): void {
    this.result = null;
    this.expandedReferences.clear();
  }

  toggleReference(internalCode: string): void {
    if (this.expandedReferences.has(internalCode)) {
      this.expandedReferences.delete(internalCode);
    } else {
      this.expandedReferences.add(internalCode);
    }
  }

  isReferenceExpanded(internalCode: string): boolean {
    return this.expandedReferences.has(internalCode);
  }
}
