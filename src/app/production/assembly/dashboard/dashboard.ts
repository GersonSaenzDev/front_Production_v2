// app/production/assembly/dashboard/dashboard.ts
import { Component, LOCALE_ID, TemplateRef, inject, ViewChild } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es'; 
import { FormsModule } from '@angular/forms'; 

import { DashboardServices } from '../../../services/dashboard-services';
import { PlanningService } from '../../../services/planning.service';
import { ChartData, ChartDataResponse, CardAssemblyResponse, AssemblyMetrics, TopProductsItem, TopProductsResponse } from '../../../interfaces/assembly.interface';
import { PlanningDayResponse, PlanningDayItem, LineControlGroup } from '../../../interfaces/planning.interface';

import { BarChartComponent } from '../apexchart/bar-chart/bar-chart.component';
import { ErrorRecord, ErrorRecordsResponse } from '../../../interfaces/dashInventory.interface';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { SharedModule } from '../../../theme/shared/shared.module';
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
  private planningService = inject(PlanningService);
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

  // Mapa NOMBRE de referencia (normalizado) → cantidad planeada del día.
  // Lo comparten el gráfico ("Programados") y la tabla "Producción del día Detallada".
  private planningByName = new Map<string, number>();

  // Ítems crudos de la planeación del día (referencia + línea + cantidad), para cruzar con producción.
  private planningDayItems: PlanningDayItem[] = [];

  // Tabla "Control de Producción por Línea": producción real agrupada por línea de ensamble.
  public lineControlGroups: LineControlGroup[] = [];

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
            this.rebuildLineControl();
        },
        error: (error) => {
            console.error('Error cargando tabla detallada', error);
            this.totalProducts = [];
            this.rebuildLineControl();
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
            this.planningDayItems = response.data ?? [];
            this.buildPlanningMap(response);
            this.barChartData = this.applyPlanning(base);
            this.rebuildLineControl();
            this.triggerChartResize();
        },
        error: (error) => {
            // Sin planeación disponible: todos los productos quedan "Sin planeación" (rojo).
            console.error('Error cargando la planeación del día', error);
            this.planningDayItems = [];
            this.planningByName.clear();
            this.barChartData = this.applyPlanning(base);
            this.rebuildLineControl();
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
   * Reconstruye la tabla "Control de Producción por Línea" cruzando:
   *  - Producción real (totalProducts, de LoadBarcode) — NO trae la línea de ensamble.
   *  - Planeación del día (planningDayItems, de productionPlanning) — SÍ trae la línea.
   * El cruce es por NOMBRE de referencia. Así le asignamos la línea a cada referencia producida
   * y comparamos producido vs planeado. Las referencias producidas que no estén en la planeación
   * del día quedan en el grupo "SIN LÍNEA / SIN PLANEACIÓN".
   */
  private rebuildLineControl(): void {
    const SIN_LINEA = 'SIN LÍNEA / SIN PLANEACIÓN';

    // 1) Mapa NOMBRE → { reference (display), line, planned } desde la planeación del día.
    const planByName = new Map<string, { reference: string; line: string; planned: number }>();
    for (const item of this.planningDayItems) {
        const key = this.normalizeName(item.reference);
        if (!key) continue;
        const line = (item.assemblyLine || '').trim() || SIN_LINEA;
        const entry = planByName.get(key);
        if (entry) {
            entry.planned += item.plannedQuantity ?? 0;
        } else {
            planByName.set(key, { reference: (item.reference || '').trim() || key, line, planned: item.plannedQuantity ?? 0 });
        }
    }

    // 2) Mapa NOMBRE → { produced, productCode, productName } desde la producción real.
    const prodByName = new Map<string, { produced: number; productCode: string; productName: string }>();
    for (const p of this.totalProducts) {
        const key = this.normalizeName(p.productName);
        if (!key) continue;
        const entry = prodByName.get(key);
        if (entry) {
            entry.produced += p.Producidos;
        } else {
            prodByName.set(key, { produced: p.Producidos, productCode: p.productCode, productName: p.productName });
        }
    }

    // 3) Unión de referencias (producidas y/o planeadas) agrupadas por línea.
    const groups = new Map<string, LineControlGroup>();
    const ensureGroup = (line: string): LineControlGroup => {
        if (!groups.has(line)) groups.set(line, { line, rows: [], totalProduced: 0, totalPlanned: 0 });
        return groups.get(line)!;
    };

    const keys = new Set<string>([...planByName.keys(), ...prodByName.keys()]);
    for (const key of keys) {
        const plan = planByName.get(key);
        const prod = prodByName.get(key);
        const line = plan?.line ?? SIN_LINEA;
        const planned = plan?.planned ?? 0;
        const produced = prod?.produced ?? 0;
        const hasPlanning = !!plan;

        const group = ensureGroup(line);
        group.rows.push({
            reference: plan?.reference ?? prod?.productName ?? key,
            productCode: prod?.productCode ?? '',
            produced,
            planned,
            difference: planned - produced,
            met: hasPlanning && produced >= planned,
            hasPlanning
        });
        group.totalProduced += produced;
        group.totalPlanned += planned;
    }

    // 4) Ordenamos: filas por referencia, grupos por línea (el grupo "sin línea" siempre al final).
    const result = Array.from(groups.values());
    result.forEach((g) => g.rows.sort((a, b) => a.reference.localeCompare(b.reference)));
    result.sort((a, b) => {
        if (a.line === SIN_LINEA) return 1;
        if (b.line === SIN_LINEA) return -1;
        return a.line.localeCompare(b.line);
    });

    this.lineControlGroups = result;
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
    return this.planningByName.has(this.normalizeName(product.productName));
  }

  /** Cantidad planeada del día para el producto (0 si no está en la planeación). */
  public getPlanned(product: TopProductsItem): number {
    return this.planningByName.get(this.normalizeName(product.productName)) ?? 0;
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

  // IMPORTANTE: El método 'private transformToChartData' ha sido ELIMINADO ya que la lógica
  // reside en el DashboardServices, haciendo este componente más limpio y enfocado.
}