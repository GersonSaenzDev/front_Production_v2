// src/app/theme/layout/admin/navigation/shared-view-news/shared-view-news.component.ts
//
// Componente GLOBAL de consulta de novedades (lo usan todos los módulos de área).
//   - Consulta por RANGO de fechas, en lotes de máx. 100 registros (no satura el navegador);
//     dentro del lote se pagina de 10 en 10 y al llegar al final se carga el lote siguiente.
//   - Búsqueda inteligente EN EL SERVIDOR: valida todo el rango, sin importar la página/lote,
//     incluido el consecutivo MTTO / SME.
//   - Muestra las respuestas de las áreas y lo que hizo Mantenimiento / Mecánica (orden,
//     intervenciones, aprobación con estrellas).
//   - Aprobación del cierre por el área que reportó (o su jefe): `app-requester-acceptance`.
//   - Seguimiento de hasta 5 novedades por usuario, sin importar la fecha de creación.
import { CommonModule, registerLocaleData } from '@angular/common';
import { Component, inject, Input, LOCALE_ID, OnDestroy, OnInit, ViewChild } from '@angular/core';
import localeEs from '@angular/common/locales/es';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import {
  NewsCategorySummary,
  NewsReplyPayload,
  NewsResponseItem,
  NewsUserRef,
  NewsWorkOrderSummary,
  ProductionNews
} from '../../../../../interfaces/assembly.interface';
import { ProductionAreaGrouped } from '../../../../../interfaces/production-news.interface';
import { AuthService } from '../../../../../services/auth-services';
import { DashboardServices } from '../../../../../services/dashboard-services';
import { MenuAccessService } from '../../../../../services/menu-access.service';
import { NewsServices } from '../../../../../services/news-services';
import { NewsThreadComponent } from '../news-thread/news-thread.component';
import { ProductionNewsEvent, ProductionNewsRedirectedEvent, SocketService } from '../../../../../services/socket-service';
import { displayArea } from '../area-display.util';
import { OngoingStopsComponent } from '../ongoing-stops/ongoing-stops.component';
import { ClosureTrackingComponent } from '../work-order-acceptance/closure-tracking.component';
import {
  AcceptanceEvaluatedEvent,
  RequesterAcceptanceComponent,
  ServiceArea
} from '../work-order-acceptance/requester-acceptance.component';
import { ratingStars, workOrderStatusLabel } from '../work-order-acceptance/work-order.util';
import { Time24Directive } from '../time-24.directive';
import {
  formatDurationLabel,
  formatStopSchedule,
  isoToDdMmYyyy,
  isStopOngoing,
  minutesBetween,
  parseStopMoment,
  stopStartMoment,
  toHHmm,
  toIsoDate
} from '../stop-time.util';

registerLocaleData(localeEs, 'es');

export interface CategorySummary {
  category: string;
  totalTime: string;
  count: number;
}

/** Atajos de rango de fechas. */
type QuickRange = 'today' | 'week' | 'month30' | 'thisMonth';

/** Tamaño del lote que se trae del servidor (tope para no saturar el navegador). */
const BATCH_SIZE = 100;
/** Rango máximo permitido (alineado con el backend). */
const MAX_RANGE_DAYS = 366;

@Component({
  selector: 'app-shared-view-news',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    OngoingStopsComponent,
    Time24Directive,
    RequesterAcceptanceComponent,
    ClosureTrackingComponent,
    NewsThreadComponent
  ],
  templateUrl: './shared-view-news.component.html',
  styleUrls: ['./shared-view-news.component.scss'],
  providers: [{ provide: LOCALE_ID, useValue: 'es' }]
})
export class SharedViewNewsComponent implements OnInit, OnDestroy {
  @Input() title: string = '';
  @Input() defaultArea: string = '';
  /** Subárea puntual (vistas por subárea, p. ej. Crudo / Acabados): tiene prioridad sobre el área. */
  @Input() subArea: string = '';

  private authService = inject(AuthService);
  private dashboardService = inject(DashboardServices);
  private socketService = inject(SocketService);
  private toastr = inject(ToastrService);
  private menuAccessService = inject(MenuAccessService);
  private newsServices = inject(NewsServices);

  // --- Filtro por área (jefes / dirección / gerencia) ---
  /** El usuario puede consultar novedades de otras áreas. */
  public readonly canFilterAreas: boolean = this.menuAccessService.canViewOtherAreas();
  /** Catálogo agrupado (área → subáreas) para el selector. */
  public areaOptions: ProductionAreaGrouped[] = [];
  /** '' = mi área (comportamiento por defecto); si no, área o subárea elegida. */
  public selectedScope: string = '';

  // --- Proyectos a mi cargo ---
  public myProjects: ProductionNews[] = [];
  public showMyProjects: boolean = true;

  /** Para app-news-thread: decide si el usuario puede aprobar una orden. */
  readonly canApproveFn = (wo: NewsWorkOrderSummary): boolean => this.canApprove(wo);

  @ViewChild(OngoingStopsComponent) private ongoingStops?: OngoingStopsComponent;
  @ViewChild(RequesterAcceptanceComponent) acceptance?: RequesterAcceptanceComponent;
  @ViewChild(ClosureTrackingComponent) private closureTracking?: ClosureTrackingComponent;

  private socketSubscriptions: Subscription[] = [];
  private subscribedArea: string = '';
  private searchChanged$ = new Subject<string>();

  readonly ratingStars = ratingStars;
  readonly workOrderStatusLabel = workOrderStatusLabel;
  readonly batchSize = BATCH_SIZE;

  // --- Rango de fechas (yyyy-mm-dd para los inputs) ---
  public startDate: string = this.formatDate(this.addDays(new Date(), -6));
  public endDate: string = this.formatDate(new Date());
  public activeQuickRange: QuickRange | null = 'week';
  public rangeError: string = '';

  public searchTerm: string = '';
  public isLoading: boolean = false;

  /** Lote actual (máx. 100) traído del servidor. */
  private allNews: ProductionNews[] = [];
  public paginatedNews: ProductionNews[] = [];
  public categorySummaries: CategorySummary[] = [];

  /** Total de novedades del rango/búsqueda (todas, no solo el lote). */
  public totalNews: number = 0;
  /** Desplazamiento del lote actual en el servidor. */
  public batchSkip: number = 0;

  public currentPage: number = 1;
  public pageSize: number = 10;
  public totalPages: number = 1;

  // --- Seguimiento (máx. 5 por usuario) ---
  public followedNews: ProductionNews[] = [];
  public followedIds = new Set<string>();
  public maxFollowed: number = 5;
  public followBusyId: string | null = null;
  public showFollowed: boolean = true;

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
    /** Fin de la parada (solo si está EN CURSO y se cierra al responder). */
    stopEndDate: string;
    stopEndTime: string;
  } = this.buildEmptyResponseForm();

  get effectiveArea(): string {
    return this.defaultArea || this.authService.userData()?.area || '';
  }

  /** Scope de consulta: la subárea si la vista es por subárea; si no, el área. */
  get effectiveScope(): string {
    return this.subArea || this.effectiveArea;
  }

  get displayTitle(): string {
    if (this.title) return this.title;
    const area = this.subArea || displayArea(this.effectiveArea);
    return area ? `Consultar Novedades de ${area}` : 'Consultar Novedades';
  }

  /** Etiqueta del área consultada cuando se usa el filtro. */
  get selectedScopeLabel(): string {
    return this.selectedScope ? displayArea(this.selectedScope) || this.selectedScope : '';
  }

  public onScopeChange(): void {
    this.reload();
  }

  /** Lote actual en texto: 'Registros 1–100 de 340'. */
  get batchLabel(): string {
    if (!this.totalNews) return '';
    const from = this.batchSkip + 1;
    const to = Math.min(this.batchSkip + this.allNews.length, this.totalNews);
    return `Registros ${from}–${to} de ${this.totalNews}`;
  }

  get hasPrevBatch(): boolean {
    return this.batchSkip > 0;
  }

  get hasNextBatch(): boolean {
    return this.batchSkip + this.allNews.length < this.totalNews;
  }

  get isFollowLimitReached(): boolean {
    return this.followedIds.size >= this.maxFollowed;
  }

  ngOnInit(): void {
    this.searchChanged$.pipe(debounceTime(400), distinctUntilChanged()).subscribe(() => this.reload());
    this.reload();
    this.loadFollowed();
    this.loadMyProjects();
    if (this.canFilterAreas) this.loadAreaOptions();
    this.initRealtime();
  }

  private loadAreaOptions(): void {
    this.newsServices.getProductionAreasGrouped().subscribe({
      next: (res) => (this.areaOptions = res.ok ? res.msg : []),
      error: (err) => console.error('Error cargando áreas para el filtro:', err)
    });
  }

  /** Novedades con proyecto a cargo del usuario (sin filtro de fecha). */
  public loadMyProjects(): void {
    this.dashboardService.getMyProjectNews().subscribe({
      next: (res) => (this.myProjects = res.ok ? res.msg : []),
      error: (err: Error) => console.error('Error cargando proyectos a cargo:', err)
    });
  }

  ngOnDestroy(): void {
    this.searchChanged$.complete();
    this.socketSubscriptions.forEach((sub) => sub.unsubscribe());
    this.socketSubscriptions = [];
    if (this.subscribedArea) {
      this.socketService.unsubscribeFromArea(this.subscribedArea);
      this.subscribedArea = '';
    }
  }

  // ============================================================
  //  TIEMPO REAL (Socket.IO)
  // ============================================================

  /**
   * Se une a la room del área visualizada y escucha los eventos de novedades
   * para reflejar en vivo las creaciones/respuestas/redirecciones/cierres
   * sin que el usuario tenga que refrescar la página.
   */
  private initRealtime(): void {
    const area = this.effectiveArea;
    if (area) {
      this.socketService.subscribeToArea(area);
      this.subscribedArea = area;
    }

    this.socketSubscriptions.push(
      this.socketService.productionNewsCreated$.subscribe((event) => this.handleNewsCreated(event)),
      this.socketService.productionNewsResponded$.subscribe((event) => this.handleNewsUpserted(event)),
      this.socketService.productionNewsClosed$.subscribe((event) => this.handleNewsUpserted(event)),
      this.socketService.productionNewsRedirected$.subscribe((event) => this.handleNewsRedirected(event)),
      this.socketService.productionNewsStopFinished$.subscribe((event) => this.handleNewsUpserted(event))
    );
  }

  private handleNewsCreated(event: ProductionNewsEvent): void {
    const news = event?.news as ProductionNews | undefined;
    if (!news || !this.isRelevant(news)) return;

    const existingIndex = this.allNews.findIndex((n) => n._id === news._id);
    if (existingIndex >= 0) {
      this.allNews[existingIndex] = this.keepWorkOrders(news, this.allNews[existingIndex]);
    } else if (this.canInsertLive()) {
      this.allNews = [news, ...this.allNews].slice(0, BATCH_SIZE);
      this.totalNews++;
      this.toastr.info('Se recibió una nueva novedad.', 'Novedad entrante');
    }
    this.refreshDerived();
  }

  /** Respuesta o cierre: si ya está en la vista, la actualiza; si entró en el área, la inserta. */
  private handleNewsUpserted(event: ProductionNewsEvent): void {
    const news = event?.news as ProductionNews | undefined;
    if (!news) return;

    this.updateFollowed(news);
    const existingIndex = this.allNews.findIndex((n) => n._id === news._id);
    if (existingIndex >= 0) {
      this.allNews[existingIndex] = this.keepWorkOrders(news, this.allNews[existingIndex]);
      this.refreshDerived();
    } else if (this.isRelevant(news) && this.canInsertLive()) {
      this.allNews = [news, ...this.allNews].slice(0, BATCH_SIZE);
      this.totalNews++;
      this.refreshDerived();
    }
  }

  /** Redirección: entra al área destino, sale del área origen. */
  private handleNewsRedirected(event: ProductionNewsRedirectedEvent): void {
    const news = event?.news as ProductionNews | undefined;
    if (!news) return;

    this.updateFollowed(news);
    const existingIndex = this.allNews.findIndex((n) => n._id === news._id);

    if (this.isRelevant(news)) {
      if (existingIndex >= 0) {
        this.allNews[existingIndex] = this.keepWorkOrders(news, this.allNews[existingIndex]);
      } else if (this.canInsertLive()) {
        this.allNews = [news, ...this.allNews].slice(0, BATCH_SIZE);
        this.totalNews++;
        this.toastr.info('Una novedad fue redireccionada a esta área.', 'Novedad entrante');
      }
      this.refreshDerived();
    } else if (existingIndex >= 0) {
      // Dejó de pertenecer a esta área: la quitamos de la vista.
      this.allNews = this.allNews.filter((n) => n._id !== news._id);
      this.totalNews = Math.max(0, this.totalNews - 1);
      this.refreshDerived();
    }
  }

  /**
   * Solo se insertan novedades en vivo en el PRIMER lote y sin búsqueda activa: en otros lotes
   * o con filtro, insertar desordenaría la vista (el usuario recarga para verlas).
   */
  private canInsertLive(): boolean {
    return this.batchSkip === 0 && !this.searchTerm.trim() && !this.selectedScope;
  }

  /** Los eventos del socket no traen el cruce con la orden MTTO/SME: se conserva el que ya había. */
  private keepWorkOrders(incoming: ProductionNews, previous?: ProductionNews): ProductionNews {
    return incoming.workOrders || !previous?.workOrders ? incoming : { ...incoming, workOrders: previous.workOrders };
  }

  /**
   * Una novedad es relevante para esta vista si quedó asignada al área
   * visualizada y su fecha está dentro del rango consultado.
   */
  private isRelevant(news: ProductionNews): boolean {
    const area = this.effectiveArea;
    if (!area) return false;
    if ((news.assignment?.currentArea || '') !== area) return false;

    const newsDate = (news.newsDate || '').trim();
    // Si el backend no envía newsDate en el evento, no descartamos por fecha.
    return !newsDate || this.isDateInRange(newsDate);
  }

  /** 'DD/MM/YYYY' dentro del rango seleccionado (inclusivo). */
  private isDateInRange(ddmmyyyy: string): boolean {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(ddmmyyyy);
    if (!match) return true;
    const iso = `${match[3]}-${match[2]}-${match[1]}`;
    return iso >= this.startDate && iso <= this.endDate;
  }

  /** Recalcula la paginación conservando la página actual del usuario. */
  private refreshDerived(): void {
    this.updatePagination();
  }

  // ============================================================
  //  CONSULTA (rango + lotes de 100 + búsqueda en servidor)
  // ============================================================

  /** Compatibilidad: algunos flujos (respuesta, finalizar parada) recargan con este nombre. */
  public onDateChange(): void {
    this.activeQuickRange = null;
    this.reload();
  }

  public setQuickRange(range: QuickRange): void {
    const today = new Date();
    let start = today;
    switch (range) {
      case 'today':
        start = today;
        break;
      case 'week':
        start = this.addDays(today, -6);
        break;
      case 'month30':
        start = this.addDays(today, -29);
        break;
      case 'thisMonth':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
    }
    this.startDate = this.formatDate(start);
    this.endDate = this.formatDate(today);
    this.activeQuickRange = range;
    this.reload();
  }

  /** Cada tecla programa la búsqueda en el servidor (con debounce). */
  public onSearchChange(term: string): void {
    this.searchChanged$.next((term || '').trim());
  }

  public clearSearch(): void {
    this.searchTerm = '';
    this.searchChanged$.next('');
  }

  /** Nueva consulta desde el primer lote (cambió el rango o la búsqueda). */
  public reload(): void {
    this.loadBatch(0, 1);
  }

  public nextBatch(): void {
    if (this.hasNextBatch) this.loadBatch(this.batchSkip + BATCH_SIZE, 1);
  }

  public prevBatch(): void {
    if (this.hasPrevBatch) this.loadBatch(Math.max(0, this.batchSkip - BATCH_SIZE), 'last');
  }

  private validateRange(): boolean {
    this.rangeError = '';
    if (!this.startDate || !this.endDate) {
      this.rangeError = 'Seleccione la fecha inicial y final.';
      return false;
    }
    if (this.startDate > this.endDate) {
      this.rangeError = 'La fecha inicial no puede ser posterior a la final.';
      return false;
    }
    const days = Math.round((this.parseIso(this.endDate).getTime() - this.parseIso(this.startDate).getTime()) / 86400000) + 1;
    if (days > MAX_RANGE_DAYS) {
      this.rangeError = `El rango máximo es de ${MAX_RANGE_DAYS} días.`;
      return false;
    }
    return true;
  }

  /**
   * Trae un lote del servidor.
   * @param skip desplazamiento del lote.
   * @param page página a mostrar dentro del lote (número o 'last').
   */
  private loadBatch(skip: number, page: number | 'last'): void {
    const scope = this.selectedScope || this.effectiveScope;
    if (!scope) {
      this.resetResults();
      return;
    }
    if (!this.validateRange()) {
      this.resetResults();
      return;
    }

    this.isLoading = true;
    this.dashboardService
      .viewNewsPage({
        startDate: this.formatDateForBackend(this.startDate),
        endDate: this.formatDateForBackend(this.endDate),
        // Con el filtro de área se consulta EXACTAMENTE lo elegido (sin sumar las subáreas del jefe).
        ...(this.selectedScope
          ? { area: this.selectedScope, exactScope: true }
          : { area: this.effectiveArea, ...(this.subArea ? { subArea: this.subArea } : {}) }),
        search: this.searchTerm.trim(),
        skip,
        limit: BATCH_SIZE
      })
      .subscribe({
        next: (response) => {
          this.allNews = response.ok && response.msg ? response.msg : [];
          this.totalNews = response.total ?? this.allNews.length;
          this.batchSkip = response.skip ?? skip;
          this.categorySummaries = this.toCategorySummaries(response.summary);
          this.totalPages = Math.ceil(this.allNews.length / this.pageSize) || 1;
          this.currentPage = page === 'last' ? this.totalPages : page;
          this.isLoading = false;
          this.updatePagination();
        },
        error: (err: Error) => {
          this.resetResults();
          this.isLoading = false;
          this.toastr.error(err.message || 'No se pudieron cargar las novedades.', 'Error');
        }
      });
  }

  private resetResults(): void {
    this.allNews = [];
    this.paginatedNews = [];
    this.categorySummaries = [];
    this.totalNews = 0;
    this.batchSkip = 0;
    this.currentPage = 1;
    this.totalPages = 1;
  }

  private toCategorySummaries(summary: NewsCategorySummary[] | undefined): CategorySummary[] {
    return (summary || []).map((s) => ({
      category: s.category,
      count: s.count,
      totalTime: this.formatMinutesToDisplay(s.totalMinutes || 0)
    }));
  }

  private formatMinutesToDisplay(totalMinutes: number): string {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  private updatePagination(): void {
    this.totalPages = Math.ceil(this.allNews.length / this.pageSize) || 1;
    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages;
    }
    if (this.currentPage < 1) this.currentPage = 1;
    const startIndex = (this.currentPage - 1) * this.pageSize;
    this.paginatedNews = this.allNews.slice(startIndex, startIndex + this.pageSize);
  }

  /** Página global (considerando lotes anteriores) para el indicador. */
  get globalPage(): number {
    return Math.floor(this.batchSkip / this.pageSize) + this.currentPage;
  }

  get globalTotalPages(): number {
    return Math.max(1, Math.ceil(this.totalNews / this.pageSize));
  }

  public prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updatePagination();
    } else if (this.hasPrevBatch) {
      this.prevBatch();
    }
  }

  public nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.updatePagination();
    } else if (this.hasNextBatch) {
      this.nextBatch();
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
    return formatStopSchedule(item);
  }

  // ============================================================
  //  ORDEN MTTO / SME + RESPUESTAS
  // ============================================================

  public workOrdersOf(item: ProductionNews | null): NewsWorkOrderSummary[] {
    return item?.workOrders || [];
  }

  public responsesOf(item: ProductionNews | null): NewsResponseItem[] {
    return item?.responses || [];
  }

  /** Etapa del cierre de la orden, en lenguaje del área. */
  public workOrderPhaseLabel(wo: NewsWorkOrderSummary): string {
    if (wo.status === 'COMPLETADO') return 'Cerrada';
    if (wo.status === 'CANCELADO') return 'Cancelada';
    if (wo.status === 'PENDIENTE_ACEPTACION') {
      return wo.acceptance ? `Aprobada · pendiente cierre ${this.serviceAreaLabel(wo.serviceArea)}` : 'Terminada · por aprobar del área';
    }
    return this.workOrderStatusLabel(wo.status as never);
  }

  public workOrderPhaseClass(wo: NewsWorkOrderSummary): string {
    if (wo.status === 'COMPLETADO') return 'wo-closed';
    if (wo.status === 'CANCELADO') return 'wo-cancelled';
    if (wo.status === 'PENDIENTE_ACEPTACION') return wo.acceptance ? 'wo-ready' : 'wo-awaiting';
    return 'wo-progress';
  }

  /** La orden espera la aprobación del área (la terminó Mantenimiento / Mecánica). */
  public isAwaitingApproval(wo: NewsWorkOrderSummary): boolean {
    return wo.status === 'PENDIENTE_ACEPTACION' && !wo.acceptance && !!wo.requester;
  }

  /** El usuario logueado puede aprobarla (la reportó o es jefe del área de origen). */
  public canApprove(wo: NewsWorkOrderSummary): boolean {
    return this.isAwaitingApproval(wo) && !!this.acceptance?.canApprove(wo.serviceArea as ServiceArea, wo.id);
  }

  public approveWorkOrder(wo: NewsWorkOrderSummary): void {
    if (!this.acceptance) return;
    this.closeDetailModal();
    this.acceptance.openByWorkOrder(wo.serviceArea as ServiceArea, wo.id);
  }

  /** Tras aprobar/rechazar: refresca el lote, el seguimiento y el panel de cierre. */
  public onAcceptanceEvaluated(event: AcceptanceEvaluatedEvent): void {
    // Si el detalle estaba abierto sobre esa orden, se cierra para no mostrar datos viejos.
    if (this.detailNews?.workOrders?.some((wo) => wo.id === event.id)) this.closeDetailModal();
    this.loadBatch(this.batchSkip, this.currentPage);
    this.loadFollowed();
    this.closureTracking?.load();
  }

  public serviceAreaLabel(area: string): string {
    return area === 'MECANICA' ? 'Mecánica' : 'Mantenimiento';
  }

  public formatWorkMinutes(minutes: number | null | undefined): string {
    if (minutes === null || minutes === undefined) return '—';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (!h) return `${m} min`;
    return m ? `${h} h ${m} min` : `${h} h`;
  }

  // ============================================================
  //  SEGUIMIENTO (máx. 5 novedades por usuario)
  // ============================================================

  public loadFollowed(): void {
    this.dashboardService.getFollowedNews().subscribe({
      next: (res) => {
        if (!res.ok) return;
        this.followedNews = res.msg;
        this.followedIds = new Set(res.newsIds);
        this.maxFollowed = res.max || 5;
      },
      error: (err: Error) => console.error('Error cargando novedades en seguimiento:', err)
    });
  }

  public isFollowed(item: ProductionNews): boolean {
    return this.followedIds.has(item._id);
  }

  public toggleFollow(item: ProductionNews): void {
    const follow = !this.isFollowed(item);
    if (follow && this.isFollowLimitReached) {
      this.toastr.warning(`Solo puede seguir ${this.maxFollowed} novedades. Quite una para marcar otra.`, 'Seguimiento');
      return;
    }

    this.followBusyId = item._id;
    this.dashboardService.toggleFollowNews(item._id, follow).subscribe({
      next: (res) => {
        this.followBusyId = null;
        if (!res.ok) {
          this.toastr.warning(res.msg || 'No se pudo actualizar el seguimiento.', 'Seguimiento');
          return;
        }
        this.followedIds = new Set(res.newsIds);
        this.toastr.success(res.msg, 'Seguimiento');
        this.loadFollowed();
      },
      error: (err: Error) => {
        this.followBusyId = null;
        this.toastr.warning(err.message || 'No se pudo actualizar el seguimiento.', 'Seguimiento');
      }
    });
  }

  /** Mantiene al día el panel de seguimiento con los eventos en vivo. */
  private updateFollowed(news: ProductionNews): void {
    const index = this.followedNews.findIndex((n) => n._id === news._id);
    if (index >= 0) this.followedNews[index] = this.keepWorkOrders(news, this.followedNews[index]);
  }

  // ============================================================
  //  PARADAS EN CURSO
  // ============================================================

  public isStopOngoing(item: ProductionNews | null): boolean {
    return isStopOngoing(item);
  }

  /** Tiempo que lleva detenida una parada en curso ('1d 4h 10m'). */
  public getOngoingElapsed(item: ProductionNews): string {
    const start = stopStartMoment(item);
    return start ? formatDurationLabel(minutesBetween(start, new Date())) : '—';
  }

  /** Abre el modal global para registrar el fin de la parada. */
  public openFinishStop(item: ProductionNews): void {
    this.closeDetailModal();
    this.ongoingStops?.openFinish(item);
  }

  /** La parada se finalizó desde el panel: se refleja en la tabla sin recargar. */
  public onStopFinished(news: ProductionNews): void {
    this.updateFollowed(news);
    const index = this.allNews.findIndex((n) => n._id === news._id);
    if (index >= 0) {
      this.allNews[index] = this.keepWorkOrders(news, this.allNews[index]);
      this.refreshDerived();
    }
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
    if (isStopOngoing(item)) this.setResponseStopEndNow();
    this.responseError = '';
    this.showResponseModal = true;
  }

  /** Al cerrar una parada EN CURSO se debe indicar su fin (por defecto, ahora). */
  public get requiresStopEnd(): boolean {
    return isStopOngoing(this.selectedNews) && this.responseForm.closeNews && !this.responseForm.needsRedirect;
  }

  public setResponseStopEndNow(): void {
    const now = new Date();
    this.responseForm.stopEndDate = toIsoDate(now);
    this.responseForm.stopEndTime = toHHmm(now);
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

    let stopEnd: NewsReplyPayload['stopEnd'];
    if (this.requiresStopEnd && this.selectedNews) {
      const endDate = isoToDdMmYyyy(this.responseForm.stopEndDate);
      const end = parseStopMoment(endDate, this.responseForm.stopEndTime);
      const start = stopStartMoment(this.selectedNews);
      if (!end) {
        this.responseError = 'La parada sigue en curso: indique la fecha y hora en que terminó para poder cerrarla.';
        return;
      }
      if (start && end <= start) {
        this.responseError = 'El fin de la parada debe ser posterior a su inicio.';
        return;
      }
      stopEnd = { endDate, endTime: this.responseForm.stopEndTime };
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
      closeNews: this.responseForm.closeNews,
      ...(stopEnd ? { stopEnd } : {})
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
        if (stopEnd) this.ongoingStops?.refresh();
        // Se recarga el MISMO lote/página para no perder el lugar del usuario.
        this.loadBatch(this.batchSkip, this.currentPage);
        this.loadFollowed();
      },
      error: (err: Error) => {
        this.responseError = err.message || 'Error al registrar la respuesta.';
        this.isSubmittingResponse = false;
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
      redirectSubArea: '',
      stopEndDate: '',
      stopEndTime: ''
    };
  }

  private addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  /** 'yyyy-mm-dd' -> Date local (sin desfase de zona horaria). */
  private parseIso(value: string): Date {
    return new Date(value.replace(/-/g, '/'));
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
