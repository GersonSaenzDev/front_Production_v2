import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PlanningService } from '../../../services/planning.service';
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
          const ordenesData = planning.data || [];
          const prodData = production.msg || [];

          this.calculateKPIs(ordenesData, prodData);
          this.buildMatrix(ordenesData, prodData);
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

  private calculateKPIs(ordenesData: any[], prodData: any[]): void {
    this.totalRequerimiento = ordenesData.reduce((acc, curr) => acc + (curr.totalRequirement || 0), 0);
    this.totalPlaneadas = ordenesData.reduce((acc, curr) => acc + (curr.plannedQuantity || 0), 0);
    this.totalProducidas = prodData.reduce((acc, curr) => acc + (curr.Producidos || 0), 0);
    this.totalValidas = prodData.reduce((acc, curr) => acc + (curr.Validos || 0), 0);
  }

  private buildMatrix(ordenesData: any[], prodData: any[]): void {
    // Generate dates array
    this.allDates = this.generateDateRange(this.fechaInicial, this.fechaFinal);
    this.currentDatePage = 0;
    this.updateDisplayedDates();

    const rowMap = new Map<string, RowData>();

    // Process Planning Data
    ordenesData.forEach(orden => {
      const code = orden.referenceCode;
      if (!rowMap.has(code)) {
        rowMap.set(code, this.createEmptyRow(code, orden.reference, orden.assemblyLine));
      }
      const row = rowMap.get(code)!;
      if (row.daily[orden.date]) {
        row.daily[orden.date].planned += (orden.plannedQuantity || 0);
      }
    });

    // Process Production Data
    prodData.forEach(prod => {
      const code = prod.productCode;
      if (!rowMap.has(code)) {
        // If not planned but produced
        rowMap.set(code, this.createEmptyRow(code, prod.productName, 'SIN LÍNEA'));
      }
      const row = rowMap.get(code)!;
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
        rows: rows.sort((a, b) => a.referenceCode.localeCompare(b.referenceCode))
      }))
      .sort((a, b) => a.assemblyLine.localeCompare(b.assemblyLine));
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
