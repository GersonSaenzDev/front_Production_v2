// app/production/assembly/dashboard/dashboard.ts
import { Component, LOCALE_ID, TemplateRef, inject, ViewChild } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es'; 
import { FormsModule } from '@angular/forms'; 

import { SharedModule } from 'src/app/theme/shared/shared.module';
import { DashboardServices } from 'src/app/services/dashboard-services';
import { ChartData, ChartDataResponse, CardAssemblyResponse, AssemblyMetrics, TopProductsItem, TopProductsResponse } from 'src/app/interfaces/assembly.interface';
// import { BajajChartComponent } from '../apexchart/bajaj-chart/bajaj-chart.component';
import { BarChartComponent } from '../apexchart/bar-chart/bar-chart.component';
import { ErrorRecord, ErrorRecordsResponse } from 'src/app/interfaces/dashInventory.interface';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
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

  @ViewChild(BarChartComponent) barChartComponent!: BarChartComponent;
  
  private dashboardService = inject(DashboardServices);
  private modalService = inject(NgbModal);

  public selectedDate: string = this.formatDate(new Date());

  // Propiedades para las métricas de las cards (inicializadas en 0)
  public totalProductoTerminado: number = 0;
  public productoValidado: number = 0;
  public productoConError: number = 0;
  public duplicados: number = 0;

  public errorRecords: ErrorRecord[] = [];
  public isLoadingErrors: boolean = false;

  public timeStart: string = '06:00'; // Inicializar en el inicio del día
  public timeEnd: string = '21:30';   // Inicializar en el fin del día

  // Definimos las columnas de horas para iterar en el HTML
  public shift1Hours = ['06', '07', '08', '09', '10', '11', '12', '13'];
  public shift2Hours = ['14', '15', '16', '17', '18', '19', '20', '21'];

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
    this.loadDataForDate(todayBackendFormat); 
    this.loadTopProductsData(todayBackendFormat);
    this.loadTotalProducts(todayBackendFormat, this.timeStart, this.timeEnd);
    this.refreshAllData(todayBackendFormat);
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
    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
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

  private refreshAllData(date: string): void {
    this.loadDataForDate(date); 
    this.loadTopProductsData(date);
    this.loadTotalProducts(date, this.timeStart, this.timeEnd);
    this.loadErrorRecords(date);
  }

  /**
   * Maneja el evento de cambio de fecha en el input y recarga todos los datos.
   */
  public onDateChange(newDate: string): void {
    const dateForBackend = this.formatDateForBackend(newDate); 
    this.refreshAllData(dateForBackend);
  }

  private loadErrorRecords(date: string): void {
    this.isLoadingErrors = true;
    this.dashboardService.getRecordsWithError(date).subscribe({
      next: (response: ErrorRecordsResponse) => {
        console.log('Datos recibidos para el modal:', response.data); // 💡 DEBUG
        this.errorRecords = response.data || [];
        this.isLoadingErrors = false;
      },
      error: (error) => {
        console.error('Error cargando registros con errores', error);
        this.errorRecords = [];
        this.isLoadingErrors = false;
      }
    });
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
  private loadTotalProducts(date: string, timeStart: string, timeEnd: string): void {
    console.log(`[Dashboard] Consultando horas: ${timeStart} - ${timeEnd} para ${date}`);
      
    // Usamos el nuevo método: getTotalProductsDayHours
    this.dashboardService.getTotalProductsDayHours(date, timeStart, timeEnd).subscribe({
        next: (response: TopProductsResponse) => {
            this.totalProducts = response.msg; 
        },
        error: (error) => {
            console.error('Error cargando tabla detallada', error);
            this.totalProducts = []; 
        }
    });
  }

  /**
   * Carga las métricas principales para las tarjetas (Cards).
   * @param date La fecha con la que se hará la consulta al backend (formato DD/MM/YYYY).
   */
  private loadDataForDate(date: string): void {
    this.dashboardService.getCardMetrics(date).subscribe({
        next: (response: CardAssemblyResponse) => { 
            const metrics: AssemblyMetrics = response.msg;
            this.totalProductoTerminado = metrics.TotalReadingsRecorded;
            this.productoValidado = metrics.TotalValidUnits; 
            this.productoConError = metrics.TotalErrorMarked; 
            this.duplicados = metrics.TotalDuplicated; 
        },
        error: () => {
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
    // 1. Limpiamos los datos actuales para que el @if lo destruya un momento
    this.barChartData = { categories: [], produced: [], valid: [] };

    this.dashboardService.getTopProductsChartData(date).subscribe({
        next: (response: ChartDataResponse) => {
            // 2. Asignamos los nuevos datos
            this.barChartData = response.msg; 

            // 3. 🎯 EL TRUCO MAESTRO:
            // Esperamos a que Angular renderice el @if y luego disparamos un resize
            setTimeout(() => {
                window.dispatchEvent(new Event('resize'));
                console.log('[Dashboard] Gráfico refrescado manualmente');
            }, 200); // 200ms es suficiente para que el DOM se asiente
        },
        error: (error) => {
            console.error('Error en el gráfico', error);
            this.barChartData = { categories: [], produced: [], valid: [] };
        }
    });
}

  /**
   * 🎯 NUEVO MÉTODO: Abre el modal programáticamente
   */
  public openErrorModal(content: TemplateRef<any>): void {
    this.modalService.open(content, { 
      size: 'xl', 
      scrollable: true,
      centered: true 
    });
  }

  // IMPORTANTE: El método 'private transformToChartData' ha sido ELIMINADO ya que la lógica
  // reside en el DashboardServices, haciendo este componente más limpio y enfocado.
}