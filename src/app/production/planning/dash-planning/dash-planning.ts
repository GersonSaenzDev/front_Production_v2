// src/production/planning/dash-planning/dash-planning.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PlanningService } from '../../../services/planning.service';
import { PlanningDayItem, TotalProductItem } from '../../../interfaces/planning.interface';
import { forkJoin } from 'rxjs';

interface DailyData {
  planned: number;
  produced: number;
  status: 'green' | 'orange' | 'red' | 'yellow' | 'none';
}

interface RowData {
  referenceCode: string;
  referenceName: string;
  assemblyLine: string;
  daily: { [date: string]: DailyData };
  totalPlanned: number;
  totalProduced: number;
  totalStatus: 'green' | 'orange' | 'red' | 'yellow' | 'none';
}

interface GroupedData {
  assemblyLine: string;
  rows: RowData[];
  collapsed: boolean;
  totalPlanned: number;
  totalProduced: number;
}

@Component({
  selector: 'app-dash-planning',
  imports: [CommonModule, FormsModule],
  templateUrl: './dash-planning.html',
  styleUrl: './dash-planning.scss'
})
export class DashPlanning implements OnInit {
  private planningService = inject(PlanningService);

  fechaInicial: string = '';
  fechaFinal: string = '';
  isLoading: boolean = false;
  errorMessage: string = '';

  // KPI Data
  totalRequerimiento: number = 0;
  totalPlaneadas: number = 0;
  totalProducidas: number = 0;
  totalValidas: number = 0;
  porcentajeCumplimiento: number = 0;

  // Datos crudos del rango (para refiltrar sin volver a consultar)
  private rawOrdenes: PlanningDayItem[] = [];
  private rawProd: TotalProductItem[] = [];
  private lineByRef = new Map<string, string>();
  readonly SIN_PLANEACION = 'SIN PLANEACIÓN';

  // Filtros
  availableLines: string[] = [];
  selectedLine: string | null = null; // null = Todas
  searchText: string = '';

  // Matrix Data
  allDates: string[] = [];
  displayedDates: string[] = [];
  currentDatePage: number = 0;
  readonly DATES_PER_PAGE = 6;
  
  groupedData: GroupedData[] = [];

  ngOnInit(): void {
    const today = new Date();
    const firstDay = new Date(today);
    
    // Get Monday of the current week
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
      production: this.planningService.getRangeTotalProducts(payload)
    }).subscribe({
      next: ({ planning, production }) => {
        if (planning.ok && production.ok) {
          this.rawOrdenes = planning.data || [];
          this.rawProd = production.msg || [];

          this.prepareFilterData();
          this.applyFilters();
        } else {
          this.errorMessage = 'Error al obtener los datos.';
        }
        this.isLoading = false;
      },
      error: (err) => {
        this.errorMessage = err.message || 'Error al comunicarse con el servidor.';
        this.isLoading = false;
      }
    });
  }

  // -------- Filtros (por línea + búsqueda de texto) --------

  /**
   * Prepara los datos auxiliares para los filtros: el mapa NOMBRE→línea (para saber a qué
   * línea pertenece cada producto) y la lista de líneas disponibles para los botones.
   */
  private prepareFilterData(): void {
    this.lineByRef.clear();
    const lineSet = new Set<string>();

    this.rawOrdenes.forEach(o => {
      const key = this.normalizeName(o.reference);
      const line = (o.assemblyLine || '').trim();
      if (key && line) {
        this.lineByRef.set(key, line);
        lineSet.add(line);
      }
    });

    // ¿Hay producción que no está en ninguna planeación? → existe "SIN PLANEACIÓN".
    const hasSinPlaneacion = this.rawProd.some(
      p => !this.lineByRef.has(this.normalizeName(p.productName))
    );

    const lines = Array.from(lineSet).sort((a, b) => a.localeCompare(b));
    if (hasSinPlaneacion) lines.push(this.SIN_PLANEACION);
    this.availableLines = lines;

    // Si la línea seleccionada ya no existe en el nuevo rango, se vuelve a "Todas".
    if (this.selectedLine && !this.availableLines.includes(this.selectedLine)) {
      this.selectedLine = null;
    }
  }

  /** Línea a la que pertenece un producto producido (según la planeación). */
  private lineOfProduct(p: TotalProductItem): string {
    return this.lineByRef.get(this.normalizeName(p.productName)) ?? this.SIN_PLANEACION;
  }

  /** Selecciona/alterna el filtro de línea y recalcula cards + matriz. */
  selectLine(line: string | null): void {
    this.selectedLine = line;
    this.applyFilters();
  }

  /** Filtra la data cruda por línea + texto y recalcula KPIs y matriz con ese subconjunto. */
  applyFilters(): void {
    const search = this.searchText.trim().toLowerCase();
    const line = this.selectedLine;

    const matches = (...values: (string | number | null | undefined)[]): boolean =>
      values.some(v => (v ?? '').toString().toLowerCase().includes(search));

    // Al buscar, se reúnen los NOMBRES que coinciden en planeación O producción, para
    // conservar juntos los pares (ej. buscar el código de planeación no debe ocultar su
    // producción, que vive con otro código).
    let matchedNames: Set<string> | null = null;
    if (search) {
      matchedNames = new Set<string>();
      this.rawOrdenes.forEach(o => {
        if (matches(o.referenceCode, o.reference, o.assemblyLine, o.planningLabel, o.plannedQuantity, o.totalRequirement)) {
          matchedNames!.add(this.normalizeName(o.reference));
        }
      });
      this.rawProd.forEach(p => {
        if (matches(p.productCode, p.productName, p.Producidos, p.Validos)) {
          matchedNames!.add(this.normalizeName(p.productName));
        }
      });
    }

    const passSearch = (name: string): boolean => !matchedNames || matchedNames.has(name);

    const ordenes = this.rawOrdenes.filter(o =>
      (!line || (o.assemblyLine || '').trim() === line) &&
      passSearch(this.normalizeName(o.reference))
    );

    const prod = this.rawProd.filter(p =>
      (!line || this.lineOfProduct(p) === line) &&
      passSearch(this.normalizeName(p.productName))
    );

    this.calculateKPIs(ordenes, prod);
    this.buildMatrix(ordenes, prod);
  }

  private calculateKPIs(ordenesData: any[], prodData: any[]): void {
    // totalRequirement es un valor por referencia (mensual) que se repite en cada registro
    // diario. Por eso se suma UNA sola vez por referencia para no inflar el total.
    const reqByRef = new Map<string, number>();
    ordenesData.forEach(o => {
      const key = this.normalizeName(o.reference) || o.referenceCode;
      if (!key) return;
      reqByRef.set(key, Math.max(reqByRef.get(key) ?? 0, o.totalRequirement || 0));
    });
    this.totalRequerimiento = Array.from(reqByRef.values()).reduce((acc, v) => acc + v, 0);

    // plannedQuantity sí es por día → se suma todo el rango (programado del rango).
    this.totalPlaneadas = ordenesData.reduce((acc, curr) => acc + (curr.plannedQuantity || 0), 0);
    this.totalProducidas = prodData.reduce((acc, curr) => acc + (curr.Producidos || 0), 0);
    this.totalValidas = prodData.reduce((acc, curr) => acc + (curr.Validos || 0), 0);

    // % Cumplimiento del rango = Realizado (válidas) / Programado (planeadas) × 100
    this.porcentajeCumplimiento = this.totalPlaneadas > 0
      ? Math.round((this.totalValidas / this.totalPlaneadas) * 100)
      : 0;
  }

  // Semaforización del cumplimiento del rango
  get cumplimientoStatus(): 'green' | 'orange' | 'red' {
    if (this.porcentajeCumplimiento >= 100) return 'green';
    if (this.porcentajeCumplimiento >= 75) return 'orange';
    return 'red';
  }

  private buildMatrix(ordenesData: any[], prodData: any[]): void {
    // Generate dates array
    this.allDates = this.generateDateRange(this.fechaInicial, this.fechaFinal);
    this.currentDatePage = 0;
    this.updateDisplayedDates();

    // El cruce producción ↔ planeación se hace por NOMBRE de referencia normalizado
    // (productName ↔ reference), ya que los códigos viven en sistemas distintos
    // (productCode 6 díg. vs referenceCode 5 díg.).
    const rowMap = new Map<string, RowData>();

    // Process Planning Data (clave = nombre normalizado)
    ordenesData.forEach(orden => {
      const key = this.normalizeName(orden.reference);
      if (!key) return;
      if (!rowMap.has(key)) {
        rowMap.set(key, this.createEmptyRow(orden.referenceCode, orden.reference, orden.assemblyLine));
      }
      const row = rowMap.get(key)!;
      if (row.daily[orden.date]) {
        row.daily[orden.date].planned += (orden.plannedQuantity || 0);
      }
    });

    // Process Production Data (clave = nombre normalizado → cae en su línea si está planeada)
    prodData.forEach(prod => {
      const key = this.normalizeName(prod.productName);
      if (!key) return;
      if (!rowMap.has(key)) {
        // Producida pero sin planeación → "SIN PLANEACIÓN"
        rowMap.set(key, this.createEmptyRow(prod.productCode, prod.productName, 'SIN PLANEACIÓN'));
      }
      const row = rowMap.get(key)!;
      if (row.daily[prod.date]) {
        row.daily[prod.date].produced += (prod.Validos || 0);
      }
    });

    // Calculate Totals and Statuses
    const groupedMap = new Map<string, RowData[]>();

    rowMap.forEach(row => {
      let totalP = 0;
      let totalE = 0;

      this.allDates.forEach(date => {
        const d = row.daily[date];
        totalP += d.planned;
        totalE += d.produced;
        d.status = this.determineStatus(d.planned, d.produced);
      });

      row.totalPlanned = totalP;
      row.totalProduced = totalE;
      row.totalStatus = this.determineStatus(totalP, totalE);

      if (!groupedMap.has(row.assemblyLine)) {
        groupedMap.set(row.assemblyLine, []);
      }
      groupedMap.get(row.assemblyLine)!.push(row);
    });

    // Convert map to array and sort
    this.groupedData = Array.from(groupedMap.entries())
      .map(([assemblyLine, rows]) => ({
        assemblyLine,
        rows: rows.sort((a, b) => a.referenceCode.localeCompare(b.referenceCode)),
        collapsed: this.allCollapsed,
        totalPlanned: rows.reduce((acc, r) => acc + r.totalPlanned, 0),
        totalProduced: rows.reduce((acc, r) => acc + r.totalProduced, 0)
      }))
      .sort((a, b) => a.assemblyLine.localeCompare(b.assemblyLine));
  }

  // -------- Colapso de grupos --------
  allCollapsed = false;

  toggleGroup(group: GroupedData): void {
    group.collapsed = !group.collapsed;
    this.allCollapsed = this.groupedData.every(g => g.collapsed);
  }

  toggleAll(): void {
    this.allCollapsed = !this.allCollapsed;
    this.groupedData.forEach(g => (g.collapsed = this.allCollapsed));
  }

  /** Normaliza un nombre de referencia para cruzar producción vs planeación. */
  private normalizeName(value: string | null | undefined): string {
    return (value || '').toUpperCase().replace(/\s+/g, ' ').trim();
  }

  private createEmptyRow(referenceCode: string, referenceName: string, assemblyLine: string): RowData {
    const daily: { [date: string]: DailyData } = {};
    this.allDates.forEach(date => {
      daily[date] = { planned: 0, produced: 0, status: 'none' };
    });
    return {
      referenceCode,
      referenceName,
      assemblyLine,
      daily,
      totalPlanned: 0,
      totalProduced: 0,
      totalStatus: 'none'
    };
  }

  private determineStatus(planned: number, produced: number): 'green' | 'orange' | 'red' | 'yellow' | 'none' {
    if (planned === 0 && produced === 0) return 'none';
    if (planned === 0 && produced > 0) return 'yellow';
    
    const percentage = (produced / planned) * 100;
    if (percentage >= 100) return 'green';
    if (percentage >= 75) return 'orange';
    return 'red';
  }

  private generateDateRange(start: string, end: string): string[] {
    const dates: string[] = [];
    let currentDate = new Date(start);
    // Fix timezone offset issues when incrementing days
    currentDate.setMinutes(currentDate.getMinutes() + currentDate.getTimezoneOffset());
    
    const endDate = new Date(end);
    endDate.setMinutes(endDate.getMinutes() + endDate.getTimezoneOffset());

    while (currentDate <= endDate) {
      dates.push(this.formatDate(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    return dates;
  }

  // Pagination Controls
  nextDates(): void {
    if ((this.currentDatePage + 1) * this.DATES_PER_PAGE < this.allDates.length) {
      this.currentDatePage++;
      this.updateDisplayedDates();
    }
  }

  prevDates(): void {
    if (this.currentDatePage > 0) {
      this.currentDatePage--;
      this.updateDisplayedDates();
    }
  }

  get hasNextDates(): boolean {
    return (this.currentDatePage + 1) * this.DATES_PER_PAGE < this.allDates.length;
  }

  get hasPrevDates(): boolean {
    return this.currentDatePage > 0;
  }

  private updateDisplayedDates(): void {
    const start = this.currentDatePage * this.DATES_PER_PAGE;
    this.displayedDates = this.allDates.slice(start, start + this.DATES_PER_PAGE);
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

  // UI Helper
  formatDateShort(dateStr: string): string {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [year, month, day] = parts;
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${day}-${months[parseInt(month, 10) - 1]}`;
  }
}
