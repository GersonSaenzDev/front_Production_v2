// src/app/stadistics/news/news.ts
import { CommonModule, registerLocaleData } from '@angular/common';
import { Component, inject, LOCALE_ID, OnInit } from '@angular/core';
import localeEs from '@angular/common/locales/es';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx'; // Exportación a Excel

import { EstadisticsService } from '../../services/estadistics.service';
import { EstadisticNews } from '../../interfaces/estadistics.interface';
import { displayArea } from '../../theme/layout/admin/navigation/area-display.util';

registerLocaleData(localeEs, 'es');

export interface CategorySummary {
  category: string;
  totalTime: string;
  count: number;
}

@Component({
  selector: 'app-stadistics-news',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './news.html',
  styleUrls: ['./news.scss'],
  providers: [{ provide: LOCALE_ID, useValue: 'es' }]
})
export class StadisticsNews implements OnInit {
  private estadisticsService = inject(EstadisticsService);

  public selectedDate: string = this.formatDate(new Date());
  public searchTerm: string = '';
  public isLoading: boolean = false;

  private allNews: EstadisticNews[] = [];
  public filteredNews: EstadisticNews[] = [];
  public paginatedNews: EstadisticNews[] = [];
  public categorySummaries: CategorySummary[] = [];

  public currentPage: number = 1;
  public pageSize: number = 10;
  public totalPages: number = 1;

  // Modal de detalle (solo lectura — este componente NO responde novedades)
  public showDetailModal: boolean = false;
  public detailNews: EstadisticNews | null = null;

  get totalNews(): number {
    return this.allNews.length;
  }

  ngOnInit(): void {
    this.onDateChange();
  }

  public onDateChange(): void {
    const dateForBackend = this.formatDateForBackend(this.selectedDate);
    this.loadAllData(dateForBackend);
  }

  private loadAllData(date: string): void {
    this.isLoading = true;
    this.allNews = [];
    this.categorySummaries = [];

    this.estadisticsService.getViewNewsEstadistic({ date }).subscribe({
      next: (response) => {
        this.allNews = response.ok && response.msg ? this.sortByCreation(response.msg) : [];
        this.calculateCategorySummaries();
      },
      error: () => {
        this.allNews = [];
        this.categorySummaries = [];
        this.isLoading = false;
        this.applyFilter();
      },
      complete: () => {
        this.isLoading = false;
        this.applyFilter();
      }
    });
  }

  // ============================================================
  //  RESUMEN POR CATEGORÍA
  // ============================================================

  private calculateCategorySummaries(): void {
    const summaryMap = new Map<string, { totalMinutes: number; count: number }>();

    for (const item of this.allNews) {
      const category = item.category;
      const timeInMinutes = this.parseTimeToMinutes(this.getStopTotalTime(item));
      const current = summaryMap.get(category) || { totalMinutes: 0, count: 0 };
      current.totalMinutes += timeInMinutes;
      current.count += 1;
      summaryMap.set(category, current);
    }

    this.categorySummaries = [];
    for (const [category, data] of summaryMap.entries()) {
      this.categorySummaries.push({
        category,
        totalTime: this.formatMinutesToDisplay(data.totalMinutes),
        count: data.count
      });
    }
  }

  private parseTimeToMinutes(timeStr: string | undefined | null): number {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    if (parts.length < 2) return 0;
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (isNaN(hours) || isNaN(minutes)) return 0;
    return hours * 60 + minutes;
  }

  private formatMinutesToDisplay(totalMinutes: number): string {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  // ============================================================
  //  FILTRO Y PAGINACIÓN
  // ============================================================

  public applyFilter(): void {
    const term = this.searchTerm.toLowerCase();
    this.filteredNews = this.allNews.filter((item) => {
      const haystack = [
        item.category,
        item.reference,
        item.detail,
        item.status,
        item.origin?.area,
        item.origin?.subArea,
        item.origin?.location,
        item.origin?.machineCode,
        item.origin?.machineName,
        item.origin?.partCode,
        item.origin?.reportedBy?.name,
        item.assignment?.currentArea,
        item.assignment?.currentSubArea,
        item.stop?.stopType
      ]
        .filter((v): v is string => !!v)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
    this.currentPage = 1;
    this.updatePagination();
  }

  private updatePagination(): void {
    this.totalPages = Math.ceil(this.filteredNews.length / this.pageSize) || 1;
    const startIndex = (this.currentPage - 1) * this.pageSize;
    this.paginatedNews = this.filteredNews.slice(startIndex, startIndex + this.pageSize);
  }

  public prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updatePagination();
    }
  }

  public nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.updatePagination();
    }
  }

  // ============================================================
  //  HELPERS DE PRESENTACIÓN
  // ============================================================

  public getCategoryClass(category: string): string {
    switch (category) {
      case 'Parada de Línea':
      case 'Parada de Linea':
        return 'row-parada';
      case 'Reporte de Calidad':
        return 'row-calidad';
      case 'Reporte de Material':
      case 'Reporte Material':
        return 'row-material';
      case 'Reporte Mantenimiento':
        return 'row-mantenimiento';
      default:
        return 'row-default';
    }
  }

  public getStatusClass(item: EstadisticNews): string {
    if (item.isClosed) return 'status-closed';
    if (item.hasResponse) return 'status-responded';
    return 'status-pending';
  }

  public getStatusLabel(item: EstadisticNews): string {
    if (item.isClosed) return 'Cerrada';
    if (item.hasResponse) return 'Respondida';
    return 'Pendiente';
  }

  public getMachineLabel(item: EstadisticNews): string {
    const code = item.origin?.machineCode;
    const name = item.origin?.machineName;
    if (code && name) return `${code} — ${name}`;
    return code || name || '—';
  }

  public getOriginLabel(item: EstadisticNews): string {
    const parts = [displayArea(item.origin?.area), item.origin?.subArea, item.origin?.location].filter(
      (v): v is string => !!v
    );
    return parts.length ? parts.join(' / ') : '—';
  }

  public getStopSchedule(item: EstadisticNews): string {
    const start = item.stop?.startTime || item.startTime;
    const end = item.stop?.endTime || item.endTime;
    if (!start && !end) return '—';
    return `${start || '—'} - ${end || '—'}`;
  }

  public getStopTotalTime(item: EstadisticNews): string {
    return item.stop?.totalTime || item.totalTime || '';
  }

  // ============================================================
  //  MODAL DE DETALLE (solo lectura)
  // ============================================================

  public openDetailModal(item: EstadisticNews): void {
    this.detailNews = item;
    this.showDetailModal = true;
  }

  public closeDetailModal(): void {
    this.showDetailModal = false;
    this.detailNews = null;
  }

  // ============================================================
  //  EXPORTACIÓN A EXCEL
  //  Exporta TODAS las novedades (todos los estados), con todos los
  //  campos y ordenadas por fecha y hora de creación.
  // ============================================================

  public exportToExcel(): void {
    if (this.allNews.length === 0) return;

    const dataToExport = this.sortByCreation(this.allNews).map((item) => {
      const lastResponse = item.responses?.length ? item.responses[item.responses.length - 1] : null;

      return {
        ID: item._id,
        FECHA_NOVEDAD: item.newsDate,
        FECHA_CREACION: item.dateCreate || item.origin?.reportedAt || '',
        CATEGORIA: item.category,
        TIPO_PARADA: item.stop?.stopType || item.stopType || '',
        REFERENCIA: item.reference,
        DETALLE: item.detail,
        ORIGEN_AREA: displayArea(item.origin?.area),
        ORIGEN_SUBAREA: item.origin?.subArea || '',
        UBICACION_LINEA: item.origin?.location || '',
        MAQUINA_CODIGO: item.origin?.machineCode || '',
        MAQUINA_NOMBRE: item.origin?.machineName || '',
        PARTE_CODIGO: item.origin?.partCode || '',
        PARTE_NOMBRE: item.origin?.partName || '',
        REPORTADO_POR: item.origin?.reportedBy?.name || '',
        USUARIO_REPORTA: item.origin?.reportedBy?.userApp || '',
        REPORTADO_EN: item.origin?.reportedAt || '',
        AREA_ASIGNADA: displayArea(item.assignment?.currentArea),
        SUBAREA_ASIGNADA: item.assignment?.currentSubArea || '',
        ASIGNADO_POR: item.assignment?.assignedBy?.name || '',
        ASIGNADO_EN: item.assignment?.assignedAt || '',
        ESTADO: this.getStatusLabel(item),
        CERRADA: item.isClosed ? 'Sí' : 'No',
        TIENE_RESPUESTA: item.hasResponse ? 'Sí' : 'No',
        REQUIERE_REDIRECCION: item.needsRedirect ? 'Sí' : 'No',
        PARADA_INICIO: item.stop?.startTime || item.startTime || '',
        PARADA_FIN: item.stop?.endTime || item.endTime || '',
        PARADA_TOTAL: this.getStopTotalTime(item),
        RESPUESTA_OBSERVACION: lastResponse?.observation || '',
        RESPUESTA_ACCION: lastResponse?.actionTaken || '',
        RESPUESTA_CAUSA_RAIZ: lastResponse?.rootCause || '',
        RESPONDIDO_POR: lastResponse?.respondedBy?.name || '',
        RESPONDIDO_EN: lastResponse?.respondedAt || ''
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Novedades');

    const fileDate = this.formatDateForBackend(this.selectedDate).replace(/\//g, '-');
    XLSX.writeFile(workbook, `Estadistica_Novedades_${fileDate}.xlsx`);
  }

  // ============================================================
  //  UTILIDADES DE FECHA
  // ============================================================

  /**
   * @description Ordena las novedades por fecha y hora de creación (ascendente).
   */
  private sortByCreation(list: EstadisticNews[]): EstadisticNews[] {
    return [...list].sort((a, b) => this.parseCreationDate(a) - this.parseCreationDate(b));
  }

  /**
   * @description Convierte "DD/MM/YYYY, HH:MM:SS" a timestamp para poder ordenar.
   */
  private parseCreationDate(item: EstadisticNews): number {
    const raw = item.dateCreate || item.origin?.reportedAt || '';
    const match = raw.match(/(\d{2})\/(\d{2})\/(\d{4})(?:,\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!match) return 0;
    const [, dd, mm, yyyy, hh = '0', min = '0', ss = '0'] = match;
    return new Date(+yyyy, +mm - 1, +dd, +hh, +min, +ss).getTime();
  }

  private formatDate(date: Date): string {
    const d = new Date(date);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  }

  public formatDateForBackend(dateString: string | Date): string {
    const d = typeof dateString === 'string' ? new Date(dateString.replace(/-/g, '/')) : dateString;
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${day}/${month}/${d.getFullYear()}`;
  }
}
