// src/app/production/planning/planning-valuation/planning-valuation.ts
import { Component, LOCALE_ID, OnInit, inject } from '@angular/core';
import { CommonModule, registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { PlanningService } from '../../../services/planning.service';
import { PriceListServices } from '../../../services/price-list-services';
import { PlanningDayItem, TotalProductItem } from '../../../interfaces/planning.interface';
import { PriceListItem } from '../../../interfaces/price-list.interface';

registerLocaleData(localeEs, 'es');

type Status = 'green' | 'orange' | 'red' | 'yellow' | 'none';

/** Agregado de cantidades (planeado/producido/válido) por referencia, sin cruzar aún con precio. */
interface QuantityAgg {
  referenceCode: string;
  referenceName: string;
  assemblyLine: string;
  planned: number;
  produced: number;
  valid: number;
}

/** Fila de valorización: cantidades cruzadas contra el precio de la referencia. */
interface ValuationRow extends QuantityAgg {
  unitPrice: number;
  hasPrice: boolean;
  valuePlanned: number;
  valueValid: number;
  valueDiff: number;
  pctValue: number;
  status: Status;
}

interface ValuationGroup {
  assemblyLine: string;
  rows: ValuationRow[];
  collapsed: boolean;
  totalValuePlanned: number;
  totalValueValid: number;
}

@Component({
  selector: 'app-planning-valuation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './planning-valuation.html',
  styleUrl: './planning-valuation.scss',
  providers: [{ provide: LOCALE_ID, useValue: 'es' }]
})
export class PlanningValuation implements OnInit {
  private planningService = inject(PlanningService);
  private priceListService = inject(PriceListServices);

  fechaInicial = '';
  fechaFinal = '';
  isLoading = false;
  errorMessage = '';

  // Datos crudos del rango (para refiltrar sin volver a consultar)
  private rawOrdenes: PlanningDayItem[] = [];
  private rawProd: TotalProductItem[] = [];
  private priceByCode = new Map<string, PriceListItem>();
  readonly SIN_PLANEACION = 'SIN PLANEACIÓN';

  // Filtros
  availableLines: string[] = [];
  selectedLine: string | null = null;
  searchText = '';

  groupedData: ValuationGroup[] = [];
  allCollapsed = false;

  // KPIs ($ del rango consultado, según los filtros aplicados)
  totalValuePlanned = 0;
  totalValueValid = 0;
  totalValueDiff = 0;
  porcentajeCumplimientoValor = 0;
  referencesWithoutPrice = 0;

  ngOnInit(): void {
    const today = new Date();
    const firstDay = new Date(today);

    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    firstDay.setDate(diff);

    this.fechaInicial = this.formatDate(firstDay);
    this.fechaFinal = this.formatDate(today);

    this.consultarDatos();
  }

  consultarDatos(): void {
    if (!this.fechaInicial || !this.fechaFinal) {
      this.errorMessage = 'Por favor seleccione ambas fechas.';
      return;
    }

    if (this.fechaInicial > this.fechaFinal) {
      this.errorMessage = 'La fecha inicial no puede ser mayor a la fecha final.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    const payload = {
      startDate: this.fechaInicial,
      endDate: this.fechaFinal
    };

    forkJoin({
      planning: this.planningService.getPlanningByRange(payload),
      production: this.planningService.getRangeTotalProducts(payload),
      prices: this.priceListService.getPriceList({})
    }).subscribe({
      next: ({ planning, production, prices }) => {
        if (planning.ok && production.ok && prices.ok) {
          this.rawOrdenes = planning.data || [];
          this.rawProd = production.msg || [];
          this.indexPrices(prices.msg || []);

          this.prepareFilterData();
          this.applyFilters();
        } else {
          this.errorMessage = 'Error al obtener los datos.';
        }
        this.isLoading = false;
      },
      error: (err: Error) => {
        this.errorMessage = err.message || 'Error al comunicarse con el servidor.';
        this.rawOrdenes = [];
        this.rawProd = [];
        this.priceByCode.clear();
        this.availableLines = [];
        this.groupedData = [];
        this.isLoading = false;
      }
    });
  }

  private indexPrices(prices: PriceListItem[]): void {
    this.priceByCode.clear();
    prices.forEach((p) => {
      const key = this.normalizeCode(p.internalCode);
      if (key) this.priceByCode.set(key, p);
    });
  }

  // -------- Navegación rápida del rango de fechas --------

  /**
   * Desplaza el rango consultado hacia atrás/adelante, manteniendo su misma duración
   * (ej.: un rango de 7 días avanza de a bloques de 7 días), y vuelve a consultar.
   */
  shiftRange(direction: -1 | 1): void {
    if (!this.fechaInicial || !this.fechaFinal) return;

    const start = this.parseDate(this.fechaInicial);
    const end = this.parseDate(this.fechaFinal);
    const spanDays = this.daysBetween(start, end) + 1;

    start.setDate(start.getDate() + direction * spanDays);
    end.setDate(end.getDate() + direction * spanDays);

    this.fechaInicial = this.formatDate(start);
    this.fechaFinal = this.formatDate(end);
    this.consultarDatos();
  }

  private parseDate(value: string): Date {
    const d = new Date(value);
    d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
    return d;
  }

  private daysBetween(start: Date, end: Date): number {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.round((end.getTime() - start.getTime()) / msPerDay);
  }

  // -------- Filtros (por línea + búsqueda de texto) --------

  private prepareFilterData(): void {
    const lineSet = new Set<string>();

    this.rawOrdenes.forEach((o) => {
      const line = (o.assemblyLine || '').trim();
      if (line) lineSet.add(line);
    });

    const lineByRef = new Map<string, string>();
    this.rawOrdenes.forEach((o) => {
      const key = this.normalizeCode(o.referenceCode);
      const line = (o.assemblyLine || '').trim();
      if (key && line) lineByRef.set(key, line);
    });

    const hasSinPlaneacion = this.rawProd.some((p) => !lineByRef.has(this.normalizeCode(p.productCode)));

    const lines = Array.from(lineSet).sort((a, b) => a.localeCompare(b));
    if (hasSinPlaneacion) lines.push(this.SIN_PLANEACION);
    this.availableLines = lines;

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

    let matchedKeys: Set<string> | null = null;
    if (search) {
      matchedKeys = new Set<string>();
      this.rawOrdenes.forEach((o) => {
        if (matches(o.referenceCode, o.reference, o.assemblyLine)) {
          matchedKeys!.add(this.normalizeCode(o.referenceCode));
        }
      });
      this.rawProd.forEach((p) => {
        if (matches(p.productCode, p.productName)) {
          matchedKeys!.add(this.normalizeCode(p.productCode));
        }
      });
    }

    const passSearch = (key: string): boolean => !matchedKeys || matchedKeys.has(key);

    const aggregated = this.aggregateQuantities();
    const rows: ValuationRow[] = [];

    aggregated.forEach((agg, key) => {
      if (line && agg.assemblyLine !== line) return;
      if (!passSearch(key)) return;
      rows.push(this.toValuationRow(agg));
    });

    this.calculateKPIs(rows);
    this.buildGroups(rows);
  }

  /** Suma planeado/producido/válido por referencia en todo el rango consultado. */
  private aggregateQuantities(): Map<string, QuantityAgg> {
    const map = new Map<string, QuantityAgg>();

    this.rawOrdenes.forEach((o) => {
      const key = this.normalizeCode(o.referenceCode);
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, {
          referenceCode: o.referenceCode,
          referenceName: o.reference,
          assemblyLine: (o.assemblyLine || '').trim(),
          planned: 0,
          produced: 0,
          valid: 0
        });
      }
      map.get(key)!.planned += o.plannedQuantity || 0;
    });

    this.rawProd.forEach((p) => {
      const key = this.normalizeCode(p.productCode);
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, {
          referenceCode: p.productCode,
          referenceName: p.productName,
          assemblyLine: this.SIN_PLANEACION,
          planned: 0,
          produced: 0,
          valid: 0
        });
      }
      const row = map.get(key)!;
      row.produced += p.Producidos || 0;
      row.valid += p.Validos || 0;
    });

    return map;
  }

  private toValuationRow(agg: QuantityAgg): ValuationRow {
    const price = this.priceByCode.get(this.normalizeCode(agg.referenceCode));
    const unitPrice = price?.lowestChannelCost ?? 0;
    const valuePlanned = agg.planned * unitPrice;
    const valueValid = agg.valid * unitPrice;

    return {
      ...agg,
      unitPrice,
      hasPrice: !!price,
      valuePlanned,
      valueValid,
      valueDiff: valuePlanned - valueValid,
      pctValue: valuePlanned > 0 ? Math.round((valueValid / valuePlanned) * 100) : 0,
      status: this.determineStatus(valuePlanned, valueValid)
    };
  }

  private calculateKPIs(rows: ValuationRow[]): void {
    this.totalValuePlanned = rows.reduce((acc, r) => acc + r.valuePlanned, 0);
    this.totalValueValid = rows.reduce((acc, r) => acc + r.valueValid, 0);
    this.totalValueDiff = this.totalValuePlanned - this.totalValueValid;

    this.porcentajeCumplimientoValor =
      this.totalValuePlanned > 0 ? Math.round((this.totalValueValid / this.totalValuePlanned) * 100) : 0;

    this.referencesWithoutPrice = rows.filter((r) => !r.hasPrice && (r.planned > 0 || r.valid > 0)).length;
  }

  get cumplimientoValorStatus(): 'green' | 'orange' | 'red' {
    if (this.porcentajeCumplimientoValor >= 100) return 'green';
    if (this.porcentajeCumplimientoValor >= 75) return 'orange';
    return 'red';
  }

  private buildGroups(rows: ValuationRow[]): void {
    const map = new Map<string, ValuationRow[]>();
    rows.forEach((row) => {
      if (!map.has(row.assemblyLine)) map.set(row.assemblyLine, []);
      map.get(row.assemblyLine)!.push(row);
    });

    this.groupedData = Array.from(map.entries())
      .map(([assemblyLine, groupRows]) => ({
        assemblyLine,
        rows: groupRows.sort((a, b) => a.referenceCode.localeCompare(b.referenceCode)),
        collapsed: this.allCollapsed,
        totalValuePlanned: groupRows.reduce((acc, r) => acc + r.valuePlanned, 0),
        totalValueValid: groupRows.reduce((acc, r) => acc + r.valueValid, 0)
      }))
      .sort((a, b) => a.assemblyLine.localeCompare(b.assemblyLine));
  }

  toggleGroup(group: ValuationGroup): void {
    group.collapsed = !group.collapsed;
    this.allCollapsed = this.groupedData.every((g) => g.collapsed);
  }

  toggleAll(): void {
    this.allCollapsed = !this.allCollapsed;
    this.groupedData.forEach((g) => (g.collapsed = this.allCollapsed));
  }

  /** Semaforización compartida con el resto del módulo: valor planeado vs. valor ejecutado (válidas). */
  private determineStatus(planned: number, executed: number): Status {
    if (planned === 0 && executed === 0) return 'none';
    if (planned === 0 && executed > 0) return 'yellow';
    const pct = (executed / planned) * 100;
    if (pct >= 100) return 'green';
    if (pct >= 75) return 'orange';
    return 'red';
  }

  /**
   * Clave de vinculación por código EAN: los primeros 5 dígitos. La planeación y la lista de
   * precios usan 5 díg. (internalCode) y la producción llega con el EAN de 6 díg., por lo que
   * el cruce se hace por esos 5 dígitos (mismo criterio que el Dashboard de Planeación).
   */
  private normalizeCode(code: string | null | undefined): string {
    const value = (code ?? '').toString().trim();
    return value.length > 5 ? value.slice(0, 5) : value;
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
   * Formatea un valor en pesos como millones ("$ 15.966,5 M") para que los totales del rango
   * quepan en la tarjeta KPI sin desbordarse. El valor exacto queda disponible en el `title`
   * (tooltip) del elemento, y la tabla de abajo siempre muestra la cifra completa.
   */
  formatCompactValue(value: number): string {
    const millones = value / 1_000_000;
    const formatted = millones.toLocaleString('es-CO', { maximumFractionDigits: 1, minimumFractionDigits: 0 });
    return `$ ${formatted} M`;
  }
}
