// src/app/production/planning/planning-month/planning-month.ts
import { Component, OnInit, TemplateRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { forkJoin } from 'rxjs';
import { PlanningService } from '../../../services/planning.service';
import {
  PlanningMonthItem,
  PlanningDetailItem,
  PlanningDetailDayEntry,
  TotalProductItem
} from '../../../interfaces/planning.interface';

type Status = 'green' | 'orange' | 'red' | 'yellow' | 'none';

/** Totales de producción real (POST /assembly/rangeTotalProducts) cruzados por referencia. */
interface ProductionTotals {
  produced: number;
  valid: number;
}

/** Fila de planeación mensual enriquecida con la producción real cruzada por referencia. */
interface PlanningMonthRow extends PlanningMonthItem {
  realProduced: number;
  realValid: number;
}

interface AssemblyLineGroup {
  assemblyLine: string;
  rows: PlanningMonthRow[];
  collapsed: boolean;
  totalPlanned: number;
  totalExecuted: number;
}

@Component({
  selector: 'app-planning-month',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './planning-month.html',
  styleUrl: './planning-month.scss'
})
export class PlanningMonth implements OnInit {
  private planningService = inject(PlanningService);
  private modalService = inject(NgbModal);
  private toastr = inject(ToastrService);

  @ViewChild('detailModal') detailModalRef!: TemplateRef<unknown>;

  readonly months = [
    { value: 1, name: 'ENERO' },
    { value: 2, name: 'FEBRERO' },
    { value: 3, name: 'MARZO' },
    { value: 4, name: 'ABRIL' },
    { value: 5, name: 'MAYO' },
    { value: 6, name: 'JUNIO' },
    { value: 7, name: 'JULIO' },
    { value: 8, name: 'AGOSTO' },
    { value: 9, name: 'SEPTIEMBRE' },
    { value: 10, name: 'OCTUBRE' },
    { value: 11, name: 'NOVIEMBRE' },
    { value: 12, name: 'DICIEMBRE' }
  ];

  selectedMonth: number = new Date().getMonth() + 1;
  selectedYear: number = new Date().getFullYear();

  isLoading = false;
  errorMessage = '';

  private rawData: PlanningMonthItem[] = [];
  readonly SIN_LINEA = 'SIN LÍNEA';

  // Producción real del mes (POST /assembly/rangeTotalProducts), indexada para el cruce.
  private rawProduction: TotalProductItem[] = [];
  private productionTotalsByCode = new Map<string, ProductionTotals>();
  private productionByDateAndCode = new Map<string, ProductionTotals>();

  availableLines: string[] = [];
  selectedLine: string | null = null;
  searchText = '';

  groupedData: AssemblyLineGroup[] = [];
  allCollapsed = false;

  // KPIs del mes consultado (según los filtros aplicados). "Ejecutado" y el % de
  // cumplimiento se calculan cruzando cada referencia con su producción real, no con el
  // campo totalExecuted de /plannig/month (no está confiable / suele venir en 0).
  totalReferences = 0;
  totalRequirement = 0;
  totalPlanned = 0;
  totalExecuted = 0;
  porcentajeCumplimiento = 0;

  // Detalle (POST /plannig/detail)
  isLoadingDetail = false;
  detailError = '';
  selectedItem: PlanningMonthRow | null = null;
  detail: PlanningDetailItem | null = null;
  private expandedDays = new Set<string>();

  ngOnInit(): void {
    this.consultar();
  }

  consultar(): void {
    if (!this.selectedYear || !this.selectedMonth) {
      this.errorMessage = 'Seleccione mes y año.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    const { startDate, endDate } = this.monthDateRange(Number(this.selectedYear), Number(this.selectedMonth));

    forkJoin({
      planning: this.planningService.getPlanningByMonth({
        planningYear: Number(this.selectedYear),
        planningMonth: Number(this.selectedMonth)
      }),
      production: this.planningService.getRangeTotalProducts({ startDate, endDate })
    }).subscribe({
      next: ({ planning, production }) => {
        if (planning.ok) {
          this.rawData = planning.data || [];
          this.rawProduction = production.ok ? production.msg || [] : [];
          this.indexProduction();
          this.prepareFilters();
          this.applyFilters();
        } else {
          this.errorMessage = 'Error al obtener la planeación del mes.';
        }
        this.isLoading = false;
      },
      error: (err: Error) => {
        this.errorMessage = err.message || 'Error al comunicarse con el servidor.';
        this.rawData = [];
        this.rawProduction = [];
        this.productionTotalsByCode.clear();
        this.productionByDateAndCode.clear();
        this.availableLines = [];
        this.groupedData = [];
        this.isLoading = false;
      }
    });
  }

  /** Primer y último día del mes consultado, en formato 'YYYY-MM-DD' (para /assembly/rangeTotalProducts). */
  private monthDateRange(year: number, month: number): { startDate: string; endDate: string } {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    return { startDate: this.formatDate(start), endDate: this.formatDate(end) };
  }

  private formatDate(date: Date): string {
    const d = new Date(date);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    const year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;

    return [year, month, day].join('-');
  }

  /**
   * Clave de vinculación de una referencia por su código EAN: los primeros 5 dígitos.
   * La planeación se carga con 5 díg. y la producción llega con el EAN de 6 díg., por lo
   * que el cruce planeación ↔ producción real se hace por esos 5 dígitos (mismo criterio
   * que usa el Dashboard de Planeación).
   */
  private normalizeCode(code: string | null | undefined): string {
    const value = (code ?? '').toString().trim();
    return value.length > 5 ? value.slice(0, 5) : value;
  }

  /** Indexa la producción real por código (totales del mes) y por fecha+código (detalle diario). */
  private indexProduction(): void {
    this.productionTotalsByCode.clear();
    this.productionByDateAndCode.clear();

    this.rawProduction.forEach((p) => {
      const key = this.normalizeCode(p.productCode);
      if (!key) return;

      const totals = this.productionTotalsByCode.get(key) ?? { produced: 0, valid: 0 };
      totals.produced += p.Producidos || 0;
      totals.valid += p.Validos || 0;
      this.productionTotalsByCode.set(key, totals);

      const dateKey = `${p.date}_${key}`;
      const dayTotals = this.productionByDateAndCode.get(dateKey) ?? { produced: 0, valid: 0 };
      dayTotals.produced += p.Producidos || 0;
      dayTotals.valid += p.Validos || 0;
      this.productionByDateAndCode.set(dateKey, dayTotals);
    });
  }

  /** Adjunta a una referencia planeada su producción real cruzada (totales del mes). */
  private toRow(item: PlanningMonthItem): PlanningMonthRow {
    const totals = this.productionTotalsByCode.get(this.normalizeCode(item.referenceCode));
    return {
      ...item,
      realProduced: totals?.produced ?? 0,
      realValid: totals?.valid ?? 0
    };
  }

  // -------- Filtros (por línea + búsqueda de texto) --------

  private prepareFilters(): void {
    const lines = new Set<string>();
    this.rawData.forEach((item) => {
      lines.add((item.assemblyLine || this.SIN_LINEA).trim());
    });
    this.availableLines = Array.from(lines).sort((a, b) => a.localeCompare(b));

    if (this.selectedLine && !this.availableLines.includes(this.selectedLine)) {
      this.selectedLine = null;
    }
  }

  selectLine(line: string | null): void {
    this.selectedLine = line;
    this.applyFilters();
  }

  applyFilters(): void {
    const search = this.searchText.trim().toLowerCase();
    const line = this.selectedLine;

    const matches = (...values: (string | number | null | undefined)[]): boolean =>
      values.some((v) => (v ?? '').toString().toLowerCase().includes(search));

    const filtered: PlanningMonthRow[] = this.rawData
      .filter(
        (item) =>
          (!line || (item.assemblyLine || this.SIN_LINEA).trim() === line) &&
          (!search || matches(item.referenceCode, item.reference, item.assemblyLine, item.planningLabel))
      )
      .map((item) => this.toRow(item));

    this.calculateKPIs(filtered);
    this.buildGroups(filtered);
  }

  private calculateKPIs(data: PlanningMonthRow[]): void {
    this.totalReferences = data.length;
    this.totalRequirement = data.reduce((acc, i) => acc + (i.totalRequirement || 0), 0);
    this.totalPlanned = data.reduce((acc, i) => acc + (i.totalPlanned || 0), 0);
    this.totalExecuted = data.reduce((acc, i) => acc + (i.realValid || 0), 0);

    this.porcentajeCumplimiento =
      this.totalPlanned > 0 ? Math.round((this.totalExecuted / this.totalPlanned) * 100) : 0;
  }

  get cumplimientoStatus(): 'green' | 'orange' | 'red' {
    if (this.porcentajeCumplimiento >= 100) return 'green';
    if (this.porcentajeCumplimiento >= 75) return 'orange';
    return 'red';
  }

  private buildGroups(data: PlanningMonthRow[]): void {
    const map = new Map<string, PlanningMonthRow[]>();
    data.forEach((item) => {
      const line = (item.assemblyLine || this.SIN_LINEA).trim();
      if (!map.has(line)) map.set(line, []);
      map.get(line)!.push(item);
    });

    this.groupedData = Array.from(map.entries())
      .map(([assemblyLine, rows]) => ({
        assemblyLine,
        rows: rows.sort((a, b) => a.referenceCode.localeCompare(b.referenceCode)),
        collapsed: this.allCollapsed,
        totalPlanned: rows.reduce((acc, r) => acc + (r.totalPlanned || 0), 0),
        totalExecuted: rows.reduce((acc, r) => acc + (r.realValid || 0), 0)
      }))
      .sort((a, b) => a.assemblyLine.localeCompare(b.assemblyLine));
  }

  toggleGroup(group: AssemblyLineGroup): void {
    group.collapsed = !group.collapsed;
    this.allCollapsed = this.groupedData.every((g) => g.collapsed);
  }

  toggleAll(): void {
    this.allCollapsed = !this.allCollapsed;
    this.groupedData.forEach((g) => (g.collapsed = this.allCollapsed));
  }

  /** Semaforización compartida: programado (o requerimiento) vs. ejecutado real. */
  private determineStatus(planned: number, executed: number): Status {
    if (planned === 0 && executed === 0) return 'none';
    if (planned === 0 && executed > 0) return 'yellow';
    const pct = (executed / planned) * 100;
    if (pct >= 100) return 'green';
    if (pct >= 75) return 'orange';
    return 'red';
  }

  itemStatus(item: PlanningMonthRow): Status {
    return this.determineStatus(item.totalPlanned || 0, item.realValid || 0);
  }

  itemPercentage(item: PlanningMonthRow): number {
    return item.totalPlanned > 0 ? Math.round(((item.realValid || 0) / item.totalPlanned) * 100) : 0;
  }

  // -------- Detalle (POST /plannig/detail) --------

  openDetail(item: PlanningMonthRow): void {
    this.selectedItem = item;
    this.detail = null;
    this.detailError = '';
    this.expandedDays.clear();
    this.isLoadingDetail = true;

    this.modalService.open(this.detailModalRef, { size: 'xl', scrollable: true, centered: true });

    this.planningService.getPlanningDetail({ _id: item._id }).subscribe({
      next: (res) => {
        if (res.ok) {
          this.detail = res.data;
        } else {
          this.detailError = 'No se pudo cargar el detalle de la planeación.';
        }
        this.isLoadingDetail = false;
      },
      error: (err: Error) => {
        this.detailError = err.message || 'Error al cargar el detalle.';
        this.isLoadingDetail = false;
        this.toastr.error(this.detailError, 'Detalle de planeación');
      }
    });
  }

  /** Producción real (Válidas) del día para la referencia en detalle, cruzada por fecha+código. */
  dayRealValid(day: PlanningDetailDayEntry): number {
    if (!this.selectedItem) return 0;
    const key = `${day.date}_${this.normalizeCode(this.selectedItem.referenceCode)}`;
    return this.productionByDateAndCode.get(key)?.valid ?? 0;
  }

  /** Producción real (Producidos, antes de validar) del día para la referencia en detalle. */
  dayRealProduced(day: PlanningDetailDayEntry): number {
    if (!this.selectedItem) return 0;
    const key = `${day.date}_${this.normalizeCode(this.selectedItem.referenceCode)}`;
    return this.productionByDateAndCode.get(key)?.produced ?? 0;
  }

  dayStatus(day: PlanningDetailDayEntry): Status {
    return this.determineStatus(day.quantity || 0, this.dayRealValid(day));
  }

  toggleDay(date: string): void {
    if (this.expandedDays.has(date)) {
      this.expandedDays.delete(date);
    } else {
      this.expandedDays.add(date);
    }
  }

  isDayExpanded(date: string): boolean {
    return this.expandedDays.has(date);
  }

  formatDateShort(dateStr: string): string {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [, month, day] = parts;
    const monthsShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${day} ${monthsShort[parseInt(month, 10) - 1] ?? ''}`;
  }
}
