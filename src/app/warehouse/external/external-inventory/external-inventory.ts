// src/app/warehouse/external/external-inventory/external-inventory.ts
//
// Importaciones / Externos > Inventario: existencias por producto y estado logístico
// (en bodega / alistado en OC / despachado / salida manual), detalle por unidad con
// trazabilidad del serial y bitácora de auditoría (solo administrativos de Bodega).
import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { finalize } from 'rxjs';
import * as XLSX from 'xlsx';

import { ExternalAuditFilters, ExternalProductsService } from '../../../services/external-products.service';
import {
  EXTERNAL_AUDIT_ACTION_LABELS,
  EXTERNAL_EXIT_TYPE_LABELS,
  EXTERNAL_STOCK_STATUS_LABELS,
  EXTERNAL_UNIT_FLAG_LABELS,
  ExternalAccess,
  ExternalAuditLog,
  ExternalExitType,
  ExternalStockStatus,
  ExternalStockSummary,
  ExternalTrace,
  ExternalUnit,
  ExternalUnitFilters,
  ExternalUnitFlag,
  ExternalUnitFlagCounts,
  WARRANTY_RETURN_TYPE_LABELS
} from '../../../interfaces/external-products.interface';

type InventoryTab = 'stock' | 'units' | 'audit';
/** 'page' = solo lo que se ve; un número = las primeras N unidades del filtro; 'all' = todo el filtro. */
type UnitsExportScope = 'page' | 500 | 1000 | 5000 | 'all';

const PAGE_SIZE = 50;
const UNITS_PAGE_SIZES = [50, 100, 200];
/** Tope de la descarga a Excel (MAX_EXPORT_LIMIT del backend). */
const MAX_EXPORT_UNITS = 20000;
const EMPTY_FLAG_COUNTS: ExternalUnitFlagCounts = { ANY: 0, NOT_DISPATCHABLE: 0, INVALID_CHECK_DIGIT: 0, UNIDENTIFIED: 0 };

@Component({
  selector: 'app-external-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './external-inventory.html',
  styleUrl: './external-inventory.scss'
})
export class ExternalInventory implements OnInit {
  private readonly externalService = inject(ExternalProductsService);
  private readonly toastr = inject(ToastrService);

  readonly statusLabels = EXTERNAL_STOCK_STATUS_LABELS;
  readonly exitTypeLabels = EXTERNAL_EXIT_TYPE_LABELS;
  readonly auditLabels = EXTERNAL_AUDIT_ACTION_LABELS;
  readonly returnTypeLabels = WARRANTY_RETURN_TYPE_LABELS;
  readonly stockStatuses = Object.keys(EXTERNAL_STOCK_STATUS_LABELS) as ExternalStockStatus[];
  readonly flagLabels = EXTERNAL_UNIT_FLAG_LABELS;
  readonly unitFlags = Object.keys(EXTERNAL_UNIT_FLAG_LABELS) as ExternalUnitFlag[];
  readonly unitsPageSizes = UNITS_PAGE_SIZES;
  readonly exportScopes: { value: UnitsExportScope; label: string }[] = [
    { value: 'page', label: 'Página actual' },
    { value: 500, label: '500 unidades' },
    { value: 1000, label: '1.000 unidades' },
    { value: 5000, label: '5.000 unidades' },
    { value: 'all', label: 'Todas (según filtros)' }
  ];
  readonly auditActions = Object.keys(EXTERNAL_AUDIT_ACTION_LABELS);

  readonly tab = signal<InventoryTab>('stock');
  readonly access = signal<ExternalAccess>({ isWarehouseAdmin: false, canManualExit: false });

  // Filtros compartidos de existencias / unidades
  filters: ExternalUnitFilters = { client: '', category: '', search: '', from: '', to: '', stockStatus: '', flag: '' };

  // Existencias
  readonly stock = signal<ExternalStockSummary | null>(null);
  readonly loadingStock = signal(false);
  readonly clients = computed(() => [...new Set((this.stock()?.rows || []).map((r) => r.client).filter(Boolean))].sort());
  readonly categories = computed(() => [...new Set((this.stock()?.rows || []).map((r) => r.category).filter(Boolean))].sort());

  // Unidades
  readonly units = signal<ExternalUnit[]>([]);
  readonly unitsTotal = signal(0);
  readonly unitsPage = signal(1);
  readonly loadingUnits = signal(false);
  readonly unitsPageSize = signal(PAGE_SIZE);
  readonly unitsPages = computed(() => Math.max(1, Math.ceil(this.unitsTotal() / this.unitsPageSize())));
  readonly flagCounts = signal<ExternalUnitFlagCounts>(EMPTY_FLAG_COUNTS);
  exportScope: UnitsExportScope = 'page';
  readonly exportingUnits = signal(false);

  // Trazabilidad
  readonly trace = signal<ExternalTrace | null>(null);
  readonly loadingTrace = signal(false);
  traceCode = '';

  // Auditoría
  auditFilters: ExternalAuditFilters = { from: '', to: '', action: '', module: '', userApp: '' };
  readonly auditRows = signal<ExternalAuditLog[]>([]);
  readonly auditTotal = signal(0);
  readonly auditPage = signal(1);
  readonly loadingAudit = signal(false);
  readonly auditPages = computed(() => Math.max(1, Math.ceil(this.auditTotal() / PAGE_SIZE)));

  ngOnInit(): void {
    this.externalService.getAccess().subscribe({
      next: (res) => this.access.set(res.data),
      error: () => this.access.set({ isWarehouseAdmin: false, canManualExit: false })
    });
    this.loadStock();
  }

  setTab(tab: InventoryTab): void {
    this.tab.set(tab);
    if (tab === 'units' && !this.units().length) this.loadUnits(1);
    if (tab === 'audit' && !this.auditRows().length) this.loadAudit(1);
  }

  applyFilters(): void {
    this.loadStock();
    if (this.tab() === 'units') this.loadUnits(1);
  }

  clearFilters(): void {
    this.filters = { client: '', category: '', search: '', from: '', to: '', stockStatus: '', flag: '' };
    this.applyFilters();
  }

  // ============================================================
  //  EXISTENCIAS
  // ============================================================
  loadStock(): void {
    this.loadingStock.set(true);
    this.externalService
      .getStock(this.cleanFilters())
      .pipe(finalize(() => this.loadingStock.set(false)))
      .subscribe({
        next: (res) => this.stock.set(res.data),
        error: (err: Error) => this.toastr.error(err.message, 'Inventario externos')
      });
  }

  /** Ver las unidades de un producto (desde la tabla de existencias). */
  showProductUnits(gtin14: string, stockStatus: ExternalStockStatus | '' = ''): void {
    this.filters = { ...this.filters, gtin14, stockStatus };
    this.tab.set('units');
    this.loadUnits(1);
  }

  // ============================================================
  //  UNIDADES
  // ============================================================
  loadUnits(page: number): void {
    this.loadingUnits.set(true);
    this.unitsPage.set(page);
    this.externalService
      .listUnits({ ...this.cleanFilters(), page, limit: this.unitsPageSize() })
      .pipe(finalize(() => this.loadingUnits.set(false)))
      .subscribe({
        next: (res) => {
          this.units.set(res.data);
          this.unitsTotal.set(res.total || 0);
          this.flagCounts.set(res.flagCounts || EMPTY_FLAG_COUNTS);
        },
        error: (err: Error) => this.toastr.error(err.message, 'Unidades externas')
      });
  }

  /** Filtro rápido por novedad: un clic filtra, otro clic en el mismo lo quita. */
  setFlag(flag: ExternalUnitFlag | ''): void {
    this.filters = { ...this.filters, flag: this.filters.flag === flag ? '' : flag };
    this.loadUnits(1);
  }

  setUnitsPageSize(size: number): void {
    this.unitsPageSize.set(size);
    this.loadUnits(1);
  }

  /** Marcaciones de la unidad para mostrar como etiquetas (sin ANY, que es el agregado). */
  unitFlagsOf(u: ExternalUnit): ExternalUnitFlag[] {
    const flags: ExternalUnitFlag[] = [];
    if (u.dispatchable === false) flags.push('NOT_DISPATCHABLE');
    if (u.checkDigitValid === false) flags.push('INVALID_CHECK_DIGIT');
    return flags;
  }

  clearProductFilter(): void {
    this.filters = { ...this.filters, gtin14: '' };
    this.loadUnits(1);
  }

  // ============================================================
  //  TRAZABILIDAD
  // ============================================================
  openTrace(barcode: string): void {
    const code = (barcode || '').trim();
    if (!code) return;
    this.loadingTrace.set(true);
    this.externalService
      .trace(code)
      .pipe(finalize(() => this.loadingTrace.set(false)))
      .subscribe({
        next: (res) => this.trace.set(res.data),
        error: (err: Error) => this.toastr.error(err.message, 'Trazabilidad')
      });
  }

  closeTrace(): void {
    this.trace.set(null);
  }

  // ============================================================
  //  AUDITORÍA
  // ============================================================
  loadAudit(page: number): void {
    if (!this.access().isWarehouseAdmin) return;
    this.loadingAudit.set(true);
    this.auditPage.set(page);
    const f = this.auditFilters;
    this.externalService
      .listAudit({
        from: f.from || undefined,
        to: f.to || undefined,
        action: f.action || undefined,
        module: f.module || undefined,
        userApp: f.userApp?.trim() || undefined,
        page,
        limit: PAGE_SIZE
      })
      .pipe(finalize(() => this.loadingAudit.set(false)))
      .subscribe({
        next: (res) => {
          this.auditRows.set(res.data);
          this.auditTotal.set(res.total || 0);
        },
        error: (err: Error) => this.toastr.error(err.message, 'Auditoría')
      });
  }

  // ============================================================
  //  EXPORTAR
  // ============================================================
  exportStock(): void {
    const rows = this.stock()?.rows || [];
    if (!rows.length) return;
    this.writeExcel(
      rows.map((r) => ({
        GTIN: r.gtin14,
        Referencia: r.reference || 'NO IDENTIFICADO',
        Descripcion: r.productName,
        'Producto Summum': r.summumProduct,
        Categoria: r.category,
        Cliente: r.client,
        'En bodega': r.available,
        'Alistado OC': r.picked,
        Despachado: r.dispatched,
        'Salida manual': r.exited,
        'Total ingresado': r.entered,
        'Ultimo ingreso': r.lastEntryAt
      })),
      'Existencias',
      'existencias_externos'
    );
  }

  /** Descarga la página actual o las primeras N / todas las unidades del filtro (incluye estado y novedad). */
  exportUnits(): void {
    const scope = this.exportScope;
    if (scope === 'page') {
      this.writeUnitsExcel(this.units());
      return;
    }
    const limit = scope === 'all' ? Math.min(this.unitsTotal(), MAX_EXPORT_UNITS) : scope;
    if (!limit) return;
    if (scope === 'all' && this.unitsTotal() > MAX_EXPORT_UNITS) {
      this.toastr.warning(
        `Se descargan las primeras ${MAX_EXPORT_UNITS.toLocaleString('es-CO')} unidades. Use filtros para el resto.`,
        'Excel'
      );
    }
    this.exportingUnits.set(true);
    this.externalService
      .listUnits({ ...this.cleanFilters(), page: 1, limit, forExport: true })
      .pipe(finalize(() => this.exportingUnits.set(false)))
      .subscribe({
        next: (res) => this.writeUnitsExcel(res.data),
        error: (err: Error) => this.toastr.error(err.message, 'Excel unidades')
      });
  }

  private writeUnitsExcel(rows: ExternalUnit[]): void {
    if (!rows.length) {
      this.toastr.info('No hay unidades para descargar con estos filtros.', 'Excel');
      return;
    }
    this.writeExcel(
      rows.map((u) => ({
        Barcode: u.barcode,
        Serial: u.serial,
        GTIN: u.gtin14,
        Referencia: u.reference || 'NO IDENTIFICADO',
        Descripcion: u.productName,
        Cliente: u.client,
        Estado: this.statusLabels[u.stockStatus],
        Novedad: [...(u.identified ? [] : ['UNIDENTIFIED' as const]), ...this.unitFlagsOf(u)].map((f) => this.flagLabels[f]).join(', '),
        OC: u.flow?.loadingOrder || '',
        'Fecha ingreso': u.entry?.at,
        'Ingresado por': u.entry?.by?.name || u.entry?.by?.userApp,
        'Ref. ingreso': u.entry?.entryReference,
        'Tipo salida': u.exit?.type ? this.exitTypeLabels[u.exit.type] : '',
        'Doc. salida': u.exit?.document || '',
        'Salida por': u.exit?.by?.name || u.exit?.by?.userApp || ''
      })),
      'Unidades',
      'unidades_externos'
    );
  }

  private writeExcel(rows: Record<string, unknown>[], sheet: string, fileName: string): void {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheet);
    XLSX.writeFile(wb, `${fileName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  private cleanFilters(): ExternalUnitFilters {
    const f = this.filters;
    return {
      client: f.client || undefined,
      category: f.category || undefined,
      gtin14: f.gtin14 || undefined,
      search: f.search?.trim() || undefined,
      from: f.from || undefined,
      to: f.to || undefined,
      stockStatus: f.stockStatus || undefined,
      flag: f.flag || undefined
    };
  }

  exitTypeLabel(type: ExternalExitType | '' | undefined): string {
    return type ? this.exitTypeLabels[type] : '';
  }
}
