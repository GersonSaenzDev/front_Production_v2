// app/production/assembly/view-news/view-news.ts
import { CommonModule, registerLocaleData } from '@angular/common';
import { Component, LOCALE_ID, OnInit, inject } from '@angular/core'; 
import localeEs from '@angular/common/locales/es';
import { FormsModule } from '@angular/forms';
import { ProductionNews } from 'src/app/interfaces/assembly.interface'; 
import { DashboardServices } from 'src/app/services/dashboard-services';

registerLocaleData(localeEs, 'es');

// 💡 AJUSTE: Creamos una interfaz para nuestros contadores
export interface CategorySummary {
  category: string;
  totalTime: string; // Ej: "3h 45m"
  count: number;     // Ej: 3
}

@Component({
  selector: 'app-view-news',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule    
  ],
  templateUrl: './view-news.html',
  styleUrl: './view-news.scss',
  providers: [
    { provide: LOCALE_ID, useValue: 'es' },
  ]
})
export class ViewNews implements OnInit {

  // --- Propiedades de Estado ---
  public selectedDate: string = this.formatDate(new Date());
  public searchTerm: string = '';
  public isLoading: boolean = false; 
  
  // --- Listas de Datos ---
  private allNews: ProductionNews[] = []; 
  public filteredNews: ProductionNews[] = []; 
  public paginatedNews: ProductionNews[] = []; 
  
  // 💡 AJUSTE: Nueva propiedad para los contadores
  public categorySummaries: CategorySummary[] = [];

  // --- Paginación ---
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
    console.log('Cargando datos para:', date);
    this.isLoading = true; 
    this.allNews = []; 
    this.categorySummaries = []; // 💡 AJUSTE: Limpiar contadores al cargar
    
    this.dashboardService.viewNews(date).subscribe({
      next: (response) => {
        if (response.ok && response.msg) {
          this.allNews = response.msg;
          console.log('Datos recibidos:', this.allNews);
          this.calculateCategorySummaries(); // 💡 AJUSTE: Calcular contadores
        } else {
          this.allNews = [];
        }
      },
      error: (err) => {
        console.error('Error al cargar novedades:', err.message);
        this.allNews = [];
        this.categorySummaries = []; // 💡 AJUSTE: Limpiar en caso de error
        this.isLoading = false;
        this.applyFilter();
      },
      complete: () => {
        this.isLoading = false;
        this.applyFilter();
      }
    });
  }

  // 💡 AJUSTE: Nueva función para calcular los totales
  private calculateCategorySummaries(): void {
    const summaryMap = new Map<string, { totalMinutes: number, count: number }>();

    // 1. Iterar sobre TODAS las novedades cargadas
    for (const item of this.allNews) {
      const category = item.category;
      const timeInMinutes = this.parseTimeToMinutes(item.totalTime);

      // Obtener el registro actual o crear uno nuevo
      const current = summaryMap.get(category) || { totalMinutes: 0, count: 0 };

      // Sumar
      current.totalMinutes += timeInMinutes;
      current.count += 1;

      // Guardar
      summaryMap.set(category, current);
    }

    // 2. Convertir el Map al array que usará el HTML
    this.categorySummaries = [];
    for (const [category, data] of summaryMap.entries()) {
      this.categorySummaries.push({
        category: category,
        totalTime: this.formatMinutesToDisplay(data.totalMinutes),
        count: data.count
      });
    }
  }

  // 💡 AJUSTE: Nueva función utilitaria para convertir "HH:MM" a minutos
  private parseTimeToMinutes(timeStr: string | undefined | null): number {
    if (!timeStr) return 0;
    
    const parts = timeStr.split(':');
    if (parts.length < 2) return 0; // Formato inválido

    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);

    if (isNaN(hours) || isNaN(minutes)) return 0;

    return (hours * 60) + minutes;
  }

  // 💡 AJUSTE: Nueva función utilitaria para convertir minutos a "Xh Ym"
  private formatMinutesToDisplay(totalMinutes: number): string {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  public applyFilter(): void {
    // ... (sin cambios)
    const term = this.searchTerm.toLowerCase();
    this.filteredNews = this.allNews.filter(item => 
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
    // ... (sin cambios)
    this.totalPages = Math.ceil(this.filteredNews.length / this.pageSize);
    if (this.totalPages === 0) this.totalPages = 1; 
    const startIndex = (this.currentPage - 1) * this.pageSize;
    this.paginatedNews = this.filteredNews.slice(startIndex, startIndex + this.pageSize);
  }

  public prevPage(): void {
    // ... (sin cambios)
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updatePagination();
    }
  }

  public nextPage(): void {
    // ... (sin cambios)
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.updatePagination();
    }
  }

  public getCategoryClass(category: string): string {
    // ... (sin cambios, lo reutilizaremos)
    switch (category) {
      case 'Parada de Linea': return 'row-parada';
      case 'Reporte de Calidad': return 'row-calidad';
      case 'Reporte Material': return 'row-material';
      case 'Reporte Mantenimiento': return 'row-mantenimiento';
      default: return 'row-default';
    }
  }

  private formatDate(date: Date): string {
    // ... (sin cambios)
    const d = new Date(date);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    const year = d.getFullYear();
    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
    return [year, month, day].join('-');
  }

  public formatDateForBackend(dateString: string | Date): string {
    // ... (sin cambios)
    const d = (typeof dateString === 'string') ? new Date(dateString.replace(/-/g, '/')) : dateString;
    let day = '' + d.getDate();
    let month = '' + (d.getMonth() + 1);
    const year = d.getFullYear();
    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
    return [day, month, year].join('/');
  }
}