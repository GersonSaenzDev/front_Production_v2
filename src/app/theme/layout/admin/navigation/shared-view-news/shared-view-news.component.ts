// src/app/theme/layout/admin/navigation/shared-view-news/shared-view-news.component.ts
import { CommonModule, registerLocaleData } from '@angular/common';
import { Component, inject, Input, LOCALE_ID, OnInit } from '@angular/core';
import localeEs from '@angular/common/locales/es';
import { FormsModule } from '@angular/forms';
import { NewsReplyPayload, NewsUserRef, ProductionNews } from '../../../../../interfaces/assembly.interface';
import { AuthService } from '../../../../../services/auth-services';
import { DashboardServices } from '../../../../../services/dashboard-services';
import { displayArea } from '../area-display.util';

registerLocaleData(localeEs, 'es');

export interface CategorySummary {
  category: string;
  totalTime: string;
  count: number;
}

@Component({
  selector: 'app-shared-view-news',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './shared-view-news.component.html',
  styleUrls: ['./shared-view-news.component.scss'],
  providers: [{ provide: LOCALE_ID, useValue: 'es' }]
})
export class SharedViewNewsComponent implements OnInit {
  @Input() title: string = '';
  @Input() defaultArea: string = '';

  private authService = inject(AuthService);
  private dashboardService = inject(DashboardServices);

  public selectedDate: string = this.formatDate(new Date());
  public searchTerm: string = '';
  public isLoading: boolean = false;

  private allNews: ProductionNews[] = [];
  public filteredNews: ProductionNews[] = [];
  public paginatedNews: ProductionNews[] = [];
  public categorySummaries: CategorySummary[] = [];

  public currentPage: number = 1;
  public pageSize: number = 10;
  public totalPages: number = 1;

  public showResponseModal: boolean = false;
  public showDetailModal: boolean = false;
  public isSubmittingResponse: boolean = false;
  public responseError: string = '';
  public selectedNews: ProductionNews | null = null;
  public detailNews: ProductionNews | null = null;
  public responseForm: {
    observation: string;
    actionTaken: string;
    rootCause: string;
    closeNews: boolean;
    needsRedirect: boolean;
    redirectArea: string;
    redirectSubArea: string;
  } = this.buildEmptyResponseForm();

  get effectiveArea(): string {
    return this.defaultArea || this.authService.userData()?.area || '';
  }

  get displayTitle(): string {
    if (this.title) return this.title;
    const area = displayArea(this.effectiveArea);
    return area ? `Consultar Novedades de ${area}` : 'Consultar Novedades';
  }

  ngOnInit(): void {
    this.onDateChange();
  }

  public onDateChange(): void {
    const dateForBackend = this.formatDateForBackend(this.selectedDate);
    this.loadAllData(dateForBackend);
  }

  private loadAllData(date: string): void {
    const area = this.effectiveArea;
    if (!area) {
      this.allNews = [];
      this.categorySummaries = [];
      this.applyFilter();
      return;
    }

    this.isLoading = true;
    this.allNews = [];
    this.categorySummaries = [];

    this.dashboardService.viewNews(date, area).subscribe({
      next: (response) => {
        this.allNews = response.ok && response.msg ? response.msg : [];
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

  public applyFilter(): void {
    const term = this.searchTerm.toLowerCase();
    this.filteredNews = this.allNews.filter((item) => {
      const haystack = [
        item.category,
        item.reference,
        item.detail,
        item.origin?.area,
        item.origin?.subArea,
        item.origin?.location,
        item.origin?.machineCode,
        item.origin?.machineName,
        item.origin?.reportedBy?.name,
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

  public getCategoryClass(category: string): string {
    switch (category) {
      case 'Parada de Proceso':
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

  public getStatusClass(item: ProductionNews): string {
    if (item.isClosed) return 'status-closed';
    if (item.hasResponse) return 'status-responded';
    return 'status-pending';
  }

  public getStatusLabel(item: ProductionNews): string {
    if (item.isClosed) return 'Cerrada';
    if (item.hasResponse) return 'Respondida';
    return 'Pendiente';
  }

  public getMachineLabel(item: ProductionNews): string {
    const code = item.origin?.machineCode;
    const name = item.origin?.machineName;
    if (code && name) return `${code} — ${name}`;
    return code || name || '—';
  }

  public getOriginLabel(item: ProductionNews): string {
    const parts = [displayArea(item.origin?.area), item.origin?.subArea, item.origin?.location].filter((v): v is string => !!v);
    return parts.length ? parts.join(' / ') : '—';
  }

  public getAssignmentLabel(item: ProductionNews): string {
    const parts = [displayArea(item.assignment?.currentArea), item.assignment?.currentSubArea].filter((v): v is string => !!v);
    return parts.length ? parts.join(' / ') : '—';
  }

  public getStopSchedule(item: ProductionNews): string {
    const start = item.stop?.startTime || item.startTime;
    const end = item.stop?.endTime || item.endTime;
    if (!start && !end) return '—';
    return `${start || '—'} - ${end || '—'}`;
  }

  public getStopTotalTime(item: ProductionNews): string {
    return item.stop?.totalTime || item.totalTime || '';
  }

  // ============================================================
  //  MODAL DE DETALLE
  // ============================================================

  public openDetailModal(item: ProductionNews): void {
    this.detailNews = item;
    this.showDetailModal = true;
  }

  public closeDetailModal(): void {
    this.showDetailModal = false;
    this.detailNews = null;
  }

  public openResponseFromDetail(): void {
    if (!this.detailNews) return;
    const item = this.detailNews;
    this.closeDetailModal();
    this.openResponseModal(item);
  }

  // ============================================================
  //  MODAL DE RESPUESTA
  // ============================================================

  public openResponseModal(item: ProductionNews): void {
    if (item.isClosed) return;
    this.selectedNews = item;
    this.responseForm = this.buildEmptyResponseForm();
    this.responseError = '';
    this.showResponseModal = true;
  }

  public closeResponseModal(): void {
    if (this.isSubmittingResponse) return;
    this.showResponseModal = false;
    this.selectedNews = null;
    this.responseError = '';
  }

  public onRedirectToggle(): void {
    if (this.responseForm.needsRedirect) {
      this.responseForm.closeNews = false;
    } else {
      this.responseForm.redirectArea = '';
      this.responseForm.redirectSubArea = '';
    }
  }

  public submitResponse(): void {
    if (!this.selectedNews) return;

    const observation = this.responseForm.observation.trim();
    const actionTaken = this.responseForm.actionTaken.trim();

    if (!observation || !actionTaken) {
      this.responseError = 'La observación y la acción tomada son obligatorias.';
      return;
    }

    if (this.responseForm.needsRedirect && !this.responseForm.redirectArea.trim()) {
      this.responseError = 'Debes indicar el área de destino para redireccionar.';
      return;
    }

    const payload: NewsReplyPayload = {
      newsId: this.selectedNews._id,
      response: {
        observation,
        actionTaken,
        rootCause: this.responseForm.rootCause.trim(),
        respondedBy: this.buildRespondedBy(),
        respondedAt: this.buildTimestamp()
      },
      needsRedirect: this.responseForm.needsRedirect,
      redirectTo: {
        area: this.responseForm.needsRedirect ? this.responseForm.redirectArea.trim() : '',
        subArea: this.responseForm.needsRedirect ? this.responseForm.redirectSubArea.trim() : ''
      },
      closeNews: this.responseForm.closeNews
    };

    this.isSubmittingResponse = true;
    this.responseError = '';

    this.dashboardService.replyNews(payload).subscribe({
      next: (response) => {
        if (!response.ok) {
          this.responseError = response.msg || 'No se pudo registrar la respuesta.';
          return;
        }
        this.showResponseModal = false;
        this.selectedNews = null;
        this.onDateChange();
      },
      error: (err: Error) => {
        this.responseError = err.message || 'Error al registrar la respuesta.';
      },
      complete: () => {
        this.isSubmittingResponse = false;
      }
    });
  }

  private buildRespondedBy(): NewsUserRef {
    const user = this.authService.userData();
    return {
      uid: user?.uid || '',
      userApp: user?.userApp || '',
      name: user?.full_name || '',
      area: user?.area || this.effectiveArea,
      subArea: user?.subArea || user?.departament || ''
    };
  }

  private buildTimestamp(): string {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
  }

  private buildEmptyResponseForm() {
    return {
      observation: '',
      actionTaken: '',
      rootCause: '',
      closeNews: true,
      needsRedirect: false,
      redirectArea: '',
      redirectSubArea: ''
    };
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
