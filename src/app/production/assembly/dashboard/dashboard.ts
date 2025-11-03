import { Component, LOCALE_ID, inject } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es'; 
import { FormsModule } from '@angular/forms'; 

import { SharedModule } from 'src/app/theme/shared/shared.module';
import { DashboardServices } from 'src/app/services/dashboard-services';
import { ChartData, ChartDataResponse, CardAssemblyResponse, AssemblyMetrics, TopProductsItem, TopProductsResponse } from 'src/app/interfaces/assembly.interface';
// import { BajajChartComponent } from '../apexchart/bajaj-chart/bajaj-chart.component';
import { BarChartComponent } from '../apexchart/bar-chart/bar-chart.component';
// import { ChartDataMonthComponent } from '../apexchart/chart-data-month/chart-data-month.component';

// Registrar el locale de español
registerLocaleData(localeEs, 'es'); 


@Component({
  selector: 'app-dashboard',
  // Asegúrate de incluir FormsModule en los imports
  imports: [
    BarChartComponent, 
    SharedModule, 
    FormsModule,    
  ], 
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  providers: [
    { provide: LOCALE_ID, useValue: 'es' },
  ]
})
export class Dashboard {
  
  private dashboardService = inject(DashboardServices); 

  public selectedDate: string = this.formatDate(new Date());

  // Propiedades para las métricas de las cards (inicializadas en 0)
  public totalProductoTerminado: number = 0;
  public productoValidado: number = 0;
  public productoConError: number = 0;
  public duplicados: number = 0;

  public timeStart: string = '06:00'; // Inicializar en el inicio del día
  public timeEnd: string = '21:30';   // Inicializar en el fin del día

  // Propiedad para los datos del gráfico de barras (inicializada vacía)
  public barChartData: ChartData = {
      categories: [],
      produced: [],
      valid: []
  };
  public totalProducts: TopProductsItem[] = [];

  public ListGroup = [
    // ... tus datos ListGroup aquí ...
  ];

  constructor() {
    const todayBackendFormat = this.formatDateForBackend(new Date());
    // Cargar datos iniciales
    this.loadDataForDate(todayBackendFormat); 
    this.loadTopProductsData(todayBackendFormat); 
  }

  // -----------------------------------------------------------
  // MÉTODOS AUXILIARES
  // -----------------------------------------------------------

  /**
   * Formatea la fecha para el input[type="date"] (YYYY-MM-DD)
   */
  private formatDate(date: Date): string {
    const d = new Date(date);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    const year = d.getFullYear();

    if (month.length < 2) 
        month = '0' + month;
    if (day.length < 2) 
        day = '0' + day;

    return [year, month, day].join('-');
  }

  /**
   * Formatea la fecha para el backend (DD/MM/YYYY)
   */
  private formatDateForBackend(dateString: string | Date): string {
    const d = (typeof dateString === 'string') ? new Date(dateString.replace(/-/g, '/')) : dateString;
    let day = '' + d.getDate();
    let month = '' + (d.getMonth() + 1);
    const year = d.getFullYear();
    
    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;

    return [day, month, year].join('/');
  }

  /**
   * Maneja el evento de cambio de fecha en el input y recarga todos los datos.
   */
  public onDateChange(newDate: string): void {
    const dateForBackend = this.formatDateForBackend(newDate); 
    this.loadDataForDate(dateForBackend);
    this.loadTopProductsData(dateForBackend); 
    // 🎯 Recargar la tabla con la nueva fecha (manteniendo el rango horario actual)
    this.loadTotalProducts(dateForBackend, this.timeStart, this.timeEnd); 
  }

  // -----------------------------------------------------------
  // LÓGICA DE CARGA DE DATOS
  // -----------------------------------------------------------

  /**
   * 🎯 NUEVO MÉTODO: Maneja el cambio en el rango de horas y recarga la tabla.
   */
  public onTimeRangeChange(): void {
    const dateForBackend = this.formatDateForBackend(this.selectedDate); 
    this.loadTotalProducts(dateForBackend, this.timeStart, this.timeEnd);
  }

  /**
   * 🎯 NUEVO MÉTODO: Carga los datos completos de producción con o sin rango horario.
   */
  private loadTotalProducts(date: string, timeStart?: string, timeEnd?: string): void {
    console.log(`[Servicio] Iniciando consulta de Producción Total del Día para la fecha: ${date} y rango ${timeStart}-${timeEnd}`);
      
    this.dashboardService.getTotalProductsDay(date, timeStart, timeEnd).subscribe({
        next: (response: TopProductsResponse) => {
            
            // 🎯 ASIGNACIÓN: Asignamos el array de productos a la variable de la tabla
            this.totalProducts = response.msg; 
        },
        error: (error) => {
            this.totalProducts = []; // Vaciar la tabla en caso de error
        }
    });
  }

  /**
   * Carga las métricas principales para las tarjetas (Cards).
   * @param date La fecha con la que se hará la consulta al backend (formato DD/MM/YYYY).
   */
  private loadDataForDate(date: string): void {
    
    this.dashboardService.getCardMetrics(date).subscribe({
        next: (response: CardAssemblyResponse) => { // Tipado correcto
            
          // 🎯 LÓGICA CLAVE: ASIGNACIÓN DE PROPIEDADES A LAS VARIABLES DE LA CLASE
            const metrics: AssemblyMetrics = response.msg;
            this.totalProductoTerminado = metrics.TotalReadingsRecorded;
            this.productoValidado = metrics.TotalValidUnits; 
            this.productoConError = metrics.TotalErrorMarked; 
            this.duplicados = metrics.TotalDuplicated; 
            
        },
        error: (error) => {
            // Limpiar los valores en caso de error
            this.totalProductoTerminado = 0;
            this.productoValidado = 0;
            this.productoConError = 0;
            this.duplicados = 0;
        }
    });
  }

  /**
   * Carga y obtiene los datos del gráfico (ya transformados por el servicio).
   * @param date La fecha con la que se hará la consulta al backend (formato DD/MM/YYYY).
   */
  private loadTopProductsData(date: string): void {
      
      // El servicio ya se encarga de llamar al endpoint y transformar los datos
      this.dashboardService.getTopProductsChartData(date).subscribe({
          next: (response: ChartDataResponse) => {
              // Asignamos directamente el objeto ChartData
              this.barChartData = response.msg; 
          },
          error: (error) => {
              this.barChartData = { categories: [], produced: [], valid: [] };
          }
      });
  }

  // IMPORTANTE: El método 'private transformToChartData' ha sido ELIMINADO ya que la lógica
  // reside en el DashboardServices, haciendo este componente más limpio y enfocado.
}