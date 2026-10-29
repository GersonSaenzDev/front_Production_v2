// app/production/assembly/dashboard/dashboard.ts
import { Component, LOCALE_ID, OnDestroy, TemplateRef, inject, ViewChild } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { FormsModule } from '@angular/forms';
import { merge, Subscription } from 'rxjs';

import { DashboardServices } from '../../../services/dashboard-services';
import { PlanningService } from '../../../services/planning.service';
import { NewsServices } from '../../../services/news-services';
import { EstadisticsService } from '../../../services/estadistics.service';
import { SocketService } from '../../../services/socket-service';
import { ChartData, ChartDataResponse, CardAssemblyResponse, AssemblyMetrics, TopProductsItem, TopProductsResponse, ProductionNews } from '../../../interfaces/assembly.interface';
import { PlanningDayResponse } from '../../../interfaces/planning.interface';
import { EstadisticNews } from '../../../interfaces/estadistics.interface';
import { displayArea } from '../../../theme/layout/admin/navigation/area-display.util';
import {
  formatDurationLabel,
  formatStopSchedule,
  isStopCategory,
  isStopOngoing,
  minutesBetween,
  stopStartMoment
} from '../../../theme/layout/admin/navigation/stop-time.util';

import { BarChartComponent } from '../apexchart/bar-chart/bar-chart.component';
import { ErrorRecord, ErrorRecordsResponse } from '../../../interfaces/dashInventory.interface';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { SharedModule } from '../../../theme/shared/shared.module';
// import { ChartDataMonthComponent } from '../apexchart/chart-data-month/chart-data-month.component';

// Registrar el locale de español
registerLocaleData(localeEs, 'es');

/** Cada cuánto se refresca el tiempo transcurrido de las paradas en curso. */
const STOPS_CLOCK_TICK_MS = 30_000;

/** Resumen de paradas del día agrupadas por la sección (origen) que quedó detenida. */
export interface StopSectionSummary {
  section: string;
  count: number;
  ongoing: number;
  minutes: number;
}


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
export class Dashboard implements OnDestroy {

  @ViewChild(BarChartComponent) barChartComponent!: BarChartComponent;

  private dashboardService = inject(DashboardServices);
  private planningService = inject(PlanningService);
  private newsServices = inject(NewsServices);
  private estadisticsService = inject(EstadisticsService);
  private socketService = inject(SocketService);
  private modalService = inject(NgbModal);

  // -----------------------------------------------------------
  // PARADAS DE PROCESO (Novedades) — vista gerencial
  // -----------------------------------------------------------

  /** Paradas abiertas AHORA en todas las áreas (independiente de la fecha consultada). */
  public ongoingStops: ProductionNews[] = [];
  /** Paradas de proceso reportadas en la fecha seleccionada (abiertas y cerradas). */
  public dayStops: EstadisticNews[] = [];
  /** Paradas del día agrupadas por sección, de mayor a menor tiempo detenido. */
  public stopsBySection: StopSectionSummary[] = [];
  public dayStopsMinutes = 0;
  public isLoadingStops = false;
  public now: Date = new Date();
  /** Paradas abiertas que se muestran antes de "+N más". */
  public readonly maxVisibleStops = 8;
  public showAllStops = false;

  private stopsClockTimer: ReturnType<typeof setInterval> | null = null;
  private stopsReloadTimer: ReturnType<typeof setTimeout> | null = null;
  private stopsSocketSub: Subscription | null = null;
  private lastStopsDate = '';

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

  // Mapa NOMBRE de referencia (normalizado) → cantidad planeada del día.
  // Lo usa el gráfico para construir la serie "Programados".
  private planningByName = new Map<string, number>();

  public ListGroup = [
    // ... tus datos ListGroup aquí ...
  ];

  constructor() {
    const todayBackendFormat = this.formatDateForBackend(new Date());
    this.loadDataForDate(todayBackendFormat); 
    this.loadTopProductsData(todayBackendFormat);
    this.loadTotalProducts(todayBackendFormat, this.timeStart, this.timeEnd);
    this.refreshAllData(todayBackendFormat);
    this.loadOngoingStops();
    this.startStopsLiveUpdates();
  }

  ngOnDestroy(): void {
    if (this.stopsClockTimer) clearInterval(this.stopsClockTimer);
    if (this.stopsReloadTimer) clearTimeout(this.stopsReloadTimer);
    this.stopsSocketSub?.unsubscribe();
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
    this.loadDayStops(date);
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
            // 2. Cruzamos los productos del gráfico con la planeación del día (serie "Programados").
            this.mergePlanningData(response.msg);
        },
        error: (error) => {
            console.error('Error en el gráfico', error);
            this.barChartData = { categories: [], produced: [], valid: [] };
        }
    });
}

  /**
   * Cruza los productos del gráfico con la planeación del día (/plannig/day) para construir
   * la serie "Programados". Cada producto suma su `plannedQuantity` (por todas las líneas).
   * Los productos que NO están en la planeación quedan en 0 y marcados para pintarse en rojo.
   * El mapa resultante (`plannedByName`) lo reutiliza también la tabla detallada.
   * @param base Datos del gráfico (categorías, producidos y válidos).
   */
  private mergePlanningData(base: ChartData): void {
    // La fecha del input ya está en formato ISO (YYYY-MM-DD), que es el que espera /plannig/day.
    this.planningService.getPlanningByDay(this.selectedDate).subscribe({
        next: (response: PlanningDayResponse) => {
            this.buildPlanningMap(response);
            this.barChartData = this.applyPlanning(base);
            this.triggerChartResize();
        },
        error: (error) => {
            // Sin planeación disponible: todos los productos quedan "Sin planeación" (rojo).
            console.error('Error cargando la planeación del día', error);
            this.planningByName.clear();
            this.barChartData = this.applyPlanning(base);
            this.triggerChartResize();
        }
    });
  }

  /**
   * Construye el mapa NOMBRE → cantidad planeada del día. El cruce producción ↔ planeación se hace
   * por NOMBRE de producto (`productName` ↔ `reference`), ya que los códigos viven en sistemas
   * distintos (productCode 6 díg. vs referenceCode 5 díg.). Cada referencia suma su
   * `plannedQuantity` a través de todas las líneas de ensamble.
   */
  private buildPlanningMap(planning: PlanningDayResponse): void {
    this.planningByName.clear();
    for (const item of planning.data ?? []) {
        const name = this.normalizeName(item.reference);
        if (name) {
            this.planningByName.set(name, (this.planningByName.get(name) ?? 0) + (item.plannedQuantity ?? 0));
        }
    }
  }

  /**
   * Construye los arrays `planned` y `plannedMissing` alineados con las categorías del gráfico,
   * usando el mapa de planeación ya cargado (`planningByName`).
   */
  private applyPlanning(base: ChartData): ChartData {
    const planned: number[] = [];
    const plannedMissing: boolean[] = [];

    base.categories.forEach((category) => {
        const name = this.normalizeName(category);
        if (this.planningByName.has(name)) {
            planned.push(this.planningByName.get(name)!);
            plannedMissing.push(false);
        } else {
            planned.push(0);
            plannedMissing.push(true);
        }
    });

    return { ...base, planned, plannedMissing };
  }

  /** Normaliza un nombre de referencia para cruzar producción vs planeación. */
  private normalizeName(value: string | null | undefined): string {
    return (value || '').toUpperCase().replace(/\s+/g, ' ').trim();
  }

  // -----------------------------------------------------------
  // HELPERS PARA LA TABLA "PRODUCCIÓN DEL DÍA DETALLADA"
  // -----------------------------------------------------------

  /** `true` si el producto tiene planeación cargada para la fecha seleccionada. */
  public hasPlanning(product: TopProductsItem): boolean {
    return this.planningByName.has(this.normalizeName(product.reference || product.productName));
  }

  /** Cantidad planeada del día para el producto (0 si no está en la planeación). */
  public getPlanned(product: TopProductsItem): number {
    return this.planningByName.get(this.normalizeName(product.reference || product.productName)) ?? 0;
  }

  /** Unidades que faltan para cumplir la meta (Planeado − Producido). Negativo o 0 = cumplido. */
  public getDifference(product: TopProductsItem): number {
    return this.getPlanned(product) - product.Producidos;
  }

  /** `true` si ya se cumplió (o superó) la meta planeada del producto. */
  public isGoalMet(product: TopProductsItem): boolean {
    return this.hasPlanning(product) && product.Producidos >= this.getPlanned(product);
  }

  /**
   * 🎯 EL TRUCO MAESTRO: tras renderizar el @if, dispara un resize para que ApexCharts se ajuste.
   */
  private triggerChartResize(): void {
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
        console.log('[Dashboard] Gráfico refrescado manualmente');
    }, 200);
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

  // -----------------------------------------------------------
  // PARADAS DE PROCESO (Novedades)
  // -----------------------------------------------------------

  /** Paradas abiertas en este momento, de todas las áreas (las más largas primero). */
  private loadOngoingStops(): void {
    this.newsServices.getOngoingStops('', true).subscribe({
      next: (res) => {
        this.now = new Date();
        this.ongoingStops = [...res.msg].sort((a, b) => this.stopMinutes(b) - this.stopMinutes(a));
      },
      error: (error) => {
        console.error('Error cargando paradas en curso', error);
        this.ongoingStops = [];
      }
    });
  }

  /**
   * Paradas de proceso de la fecha consultada (abiertas y cerradas), para el tiempo
   * total detenido y el ranking por sección.
   * @param date Fecha en formato DD/MM/YYYY.
   */
  private loadDayStops(date: string): void {
    this.lastStopsDate = date;
    this.isLoadingStops = true;
    this.estadisticsService.getViewNewsEstadistic({ date }).subscribe({
      next: (response) => {
        const news = response.ok && Array.isArray(response.msg) ? response.msg : [];
        this.dayStops = news.filter((n) => isStopCategory(n.category));
        this.buildStopsSummary();
        this.isLoadingStops = false;
      },
      error: (error) => {
        console.error('Error cargando paradas del día', error);
        this.dayStops = [];
        this.buildStopsSummary();
        this.isLoadingStops = false;
      }
    });
  }

  private buildStopsSummary(): void {
    const bySection = new Map<string, StopSectionSummary>();
    let total = 0;
    for (const stop of this.dayStops) {
      const minutes = this.stopMinutes(stop);
      const section = this.stopSection(stop);
      const current = bySection.get(section) ?? { section, count: 0, ongoing: 0, minutes: 0 };
      current.count += 1;
      current.minutes += minutes;
      if (isStopOngoing(stop)) current.ongoing += 1;
      bySection.set(section, current);
      total += minutes;
    }
    this.dayStopsMinutes = total;
    this.stopsBySection = [...bySection.values()].sort((a, b) => b.minutes - a.minutes || b.count - a.count);
  }

  /** Reloj para el tiempo transcurrido + recarga en vivo cuando cambian las novedades. */
  private startStopsLiveUpdates(): void {
    this.stopsClockTimer = setInterval(() => {
      this.now = new Date();
      // El tiempo de las paradas abiertas del día sigue corriendo.
      if (this.dayStops.some((s) => isStopOngoing(s))) this.buildStopsSummary();
    }, STOPS_CLOCK_TICK_MS);

    this.stopsSocketSub = merge(
      this.socketService.productionNewsCreated$,
      this.socketService.productionNewsRedirected$,
      this.socketService.productionNewsClosed$,
      this.socketService.productionNewsStopFinished$
    ).subscribe(() => {
      if (this.stopsReloadTimer) clearTimeout(this.stopsReloadTimer);
      this.stopsReloadTimer = setTimeout(() => {
        this.loadOngoingStops();
        if (this.lastStopsDate) this.loadDayStops(this.lastStopsDate);
      }, 400);
    });
  }

  /** Minutos detenidos: en curso = inicio → ahora; cerrada = total registrado (HH:mm). */
  public stopMinutes(stop: ProductionNews | EstadisticNews): number {
    if (isStopOngoing(stop)) {
      const start = stopStartMoment(stop);
      return start ? Math.max(0, minutesBetween(start, this.now)) : 0;
    }
    const match = /^(\d+):(\d{2})/.exec(stop.stop?.totalTime || stop.totalTime || '');
    return match ? +match[1] * 60 + +match[2] : 0;
  }

  /** Sección (origen) que quedó detenida: 'Área / Subárea'. */
  public stopSection(stop: ProductionNews | EstadisticNews): string {
    const area = displayArea(stop.origin?.area);
    const subArea = stop.origin?.subArea;
    return [area, subArea && subArea !== stop.origin?.area ? subArea : '']
      .filter((v) => !!v)
      .join(' / ') || 'Sin sección';
  }

  /** Área que está atendiendo la parada (asignación actual). */
  public stopAttendedBy(stop: ProductionNews | EstadisticNews): string {
    const area = displayArea(stop.assignment?.currentArea);
    const subArea = stop.assignment?.currentSubArea;
    return [area, subArea && subArea !== stop.assignment?.currentArea ? subArea : '']
      .filter((v) => !!v)
      .join(' / ') || '—';
  }

  public stopMachine(stop: ProductionNews | EstadisticNews): string {
    return stop.origin?.machineName || stop.origin?.machineCode || '—';
  }

  public stopSchedule(stop: ProductionNews | EstadisticNews): string {
    return formatStopSchedule(stop);
  }

  public stopIsOngoing(stop: ProductionNews | EstadisticNews): boolean {
    return isStopOngoing(stop);
  }

  public durationLabel(minutes: number): string {
    return formatDurationLabel(minutes);
  }

  /** Inicio legible de una parada en curso ('29/10 14:30'). */
  public stopStartLabel(stop: ProductionNews): string {
    return `${(stop.newsDate || '').slice(0, 5)} ${stop.stop?.startTime || ''}`.trim();
  }

  /** La parada abierta más larga (para la card "Procesos detenidos ahora"). */
  public get longestOngoingMinutes(): number {
    return this.ongoingStops.reduce((max, s) => Math.max(max, this.stopMinutes(s)), 0);
  }

  /** Paradas abiertas visibles en la franja (compacta: las más largas primero). */
  public get visibleOngoingStops(): ProductionNews[] {
    return this.showAllStops ? this.ongoingStops : this.ongoingStops.slice(0, this.maxVisibleStops);
  }

  /** Gravedad visual por tiempo detenido: >= 24h crítica, >= 2h alta. */
  public stopSeverity(stop: ProductionNews): 'critical' | 'high' | 'normal' {
    const minutes = this.stopMinutes(stop);
    if (minutes >= 24 * 60) return 'critical';
    if (minutes >= 2 * 60) return 'high';
    return 'normal';
  }

  public get topStopSection(): StopSectionSummary | null {
    return this.stopsBySection[0] ?? null;
  }

  public openStopsModal(content: TemplateRef<unknown>): void {
    this.modalService.open(content, { size: 'xl', scrollable: true, centered: true });
  }

  // IMPORTANTE: El método 'private transformToChartData' ha sido ELIMINADO ya que la lógica
  // reside en el DashboardServices, haciendo este componente más limpio y enfocado.
}