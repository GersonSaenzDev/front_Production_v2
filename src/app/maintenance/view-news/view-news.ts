import { CommonModule, registerLocaleData } from '@angular/common';
import { Component, LOCALE_ID, OnInit, inject } from '@angular/core';
import localeEs from '@angular/common/locales/es';
import { FormsModule } from '@angular/forms';
import { ProductionNews } from '../../interfaces/assembly.interface';
import { DashboardServices } from '../../services/dashboard-services';

registerLocaleData(localeEs, 'es');

export interface CategorySummary {
  category: string;
  totalTime: string;
  count: number;
}

@Component({
  selector: 'app-maintenance-view-news',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './view-news.html',
  styleUrl: './view-news.scss',
  providers: [{ provide: LOCALE_ID, useValue: 'es' }]
})
export class ViewNews implements OnInit {
  public viewTitle: string = 'Consultar Novedades de Mantenimiento';
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

  private dashboardService = inject(DashboardServices);

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

    this.dashboardService.viewNews(date).subscribe({
      next: (response) => {
        if (response.ok && response.msg) {
          this.allNews = response.msg;
          this.calculateCategorySummaries();
        } else {
          this.allNews = [];
        }
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
      const timeInMinutes = this.parseTimeToMinutes(item.totalTime);
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
    this.filteredNews = this.allNews.filter(
      (item) =>
        item.category.toLowerCase().includes(term) ||
        item.assemblyLine.toLowerCase().includes(term) ||
        item.reference.toLowerCase().includes(term) ||
        (item.responsible || '').toLowerCase().includes(term) ||
        (item.detail || '').toLowerCase().includes(term)
    );
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
      case 'Parada de Linea': return 'row-parada';
      case 'Reporte de Calidad': return 'row-calidad';
      case 'Reporte Material': return 'row-material';
      case 'Reporte Mantenimiento': return 'row-mantenimiento';
      default: return 'row-default';
    }
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

  public formatDateForBackend(dateString: string | Date): string {
    const d = typeof dateString === 'string' ? new Date(dateString.replace(/-/g, '/')) : dateString;
    let day = '' + d.getDate();
    let month = '' + (d.getMonth() + 1);
    const year = d.getFullYear();
    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
    return [day, month, year].join('/');
  }
}
