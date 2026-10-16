// src/app/maintenance/view-news/view-news.ts
import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { merge, Subscription } from 'rxjs';
import { ProductionNews } from '../../interfaces/assembly.interface';
import {
  AddInterventionRequest,
  ApprovalRole,
  AuditEntry,
  Intervention,
  MaintenanceAssignee,
  MaintenanceListFilters,
  MaintenancePriority,
  MaintenanceRequest,
  MaintenanceStatus,
  MaintenanceType,
  PersonRef,
  UpdateInterventionRequest,
  UpdateMaintenanceRequest
} from '../../interfaces/maintenance.interface';
import { Machine, ProductionAreaGrouped, ProductionSubArea } from '../../interfaces/production-news.interface';
import { MaintenanceTechnician } from '../../interfaces/rh-staff.interface';
import { DashboardServices } from '../../services/dashboard-services';
import { MaintenanceDraftService } from '../../services/maintenance-draft-service';
import { MaintenanceServices } from '../../services/maintenance-services';
import { MenuAccessService } from '../../services/menu-access.service';
import { NewsServices } from '../../services/news-services';
import { RhStaffServices } from '../../services/rh-staff-services';
import { ProductionNewsRedirectedEvent, SocketService } from '../../services/socket-service';
import { OngoingStopsComponent } from '../../theme/layout/admin/navigation/ongoing-stops/ongoing-stops.component';
import { formatStopSchedule, isStopCategory, isStopOngoing } from '../../theme/layout/admin/navigation/stop-time.util';
import { calculateMinutes, formatMinutes, toBackendDateTime, toDatetimeLocal } from '../maintenance-time.util';

@Component({
  selector: 'app-maintenance-view-news',
  standalone: true,
  imports: [CommonModule, FormsModule, OngoingStopsComponent],
  templateUrl: './view-news.html',
  styleUrl: './view-news.scss'
})
export class ViewNews implements OnInit, OnDestroy {
  private maintenanceService = inject(MaintenanceServices);
  private rhStaffService = inject(RhStaffServices);
  private newsServices = inject(NewsServices);
  private dashboardService = inject(DashboardServices);
  private draftService = inject(MaintenanceDraftService);
  private router = inject(Router);
  private toastr = inject(ToastrService);
  private socketService = inject(SocketService);
  private menuAccessService = inject(MenuAccessService);

  readonly formatMinutes = formatMinutes;

  /** Jefe de Mantenimiento: habilita correcciones y corrige tiempos/actividad (alineado con el backend). */
  get canManage(): boolean {
    return this.menuAccessService.isMaintenanceManager();
  }

  private static readonly MAINTENANCE_AREA = 'Mantenimiento';
  private socketSub: Subscription | null = null;
  private pendingNewsReloadTimer: ReturnType<typeof setTimeout> | null = null;

  readonly statuses: MaintenanceStatus[] = ['PENDIENTE', 'EN_PROCESO', 'COMPLETADO', 'CANCELADO'];
  readonly priorities: MaintenancePriority[] = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'];
  readonly maintenanceTypes: MaintenanceType[] = ['PREVENTIVO', 'CORRECTIVO', 'PREDICTIVO'];

  technicians: MaintenanceTechnician[] = [];

  filters: { status: string; maintenanceType: string; machineCode: string; area: string } = {
    status: '',
    maintenanceType: '',
    machineCode: '',
    area: ''
  };

  orders: MaintenanceRequest[] = [];
  isLoading = false;

  // Novedades entrantes de otras áreas (productionNews asignadas a Mantenimiento, cualquier categoría).
  pendingNewsDate: string = this.formatDate(new Date());
  pendingNews: ProductionNews[] = [];
  // Paradas EN CURSO (sin importar la fecha): son prioridad, se fijan arriba en la tabla.
  ongoingStops: ProductionNews[] = [];
  filteredPendingNews: ProductionNews[] = [];
  pendingNewsSearchTerm = '';
  pendingNewsSortField: PendingNewsSortField = 'reportedAt';
  pendingNewsSortDirection: 'asc' | 'desc' = 'desc';
  isLoadingPendingNews = false;

  // Detalle
  showDetailModal = false;
  detailOrder: MaintenanceRequest | null = null;

  // Edición
  showEditModal = false;
  isSaving = false;
  editOrder: MaintenanceRequest | null = null;
  editForm: EditForm = this.buildEmptyEditForm();

  // Áreas + departamentos (servicio agrupado) para el modal de edición
  groupedAreas: ProductionAreaGrouped[] = [];
  availableDepartments: ProductionSubArea[] = [];

  // Buscador predictivo de máquinas en edición
  machinesByArea: Machine[] = [];
  predictiveMachineList: Machine[] = [];
  showMachineDropdown = false;
  private isSelectingMachine = false;

  // Técnicos asignados en edición (1 o N): se agregan por nombre/documento y se pueden quitar.
  editAssignees: MaintenanceAssignee[] = [];
  assigneeSearchTerm = '';
  predictiveTechnicianList: MaintenanceTechnician[] = [];
  showTechnicianDropdown = false;
  private isSelectingTechnician = false;

  // Eliminar
  showDeleteModal = false;
  isDeleting = false;
  orderToDelete: MaintenanceRequest | null = null;

  // Nueva intervención (acción de contención) registrada por el Jefe a nombre de un técnico.
  newIntervention: NewInterventionForm = this.buildEmptyNewIntervention();
  isAddingIntervention = false;

  // Corrección de una intervención por el Jefe (siempre con motivo, queda en la auditoría).
  editingInterventionId: string | null = null;
  interventionEditForm: InterventionEditForm = this.buildEmptyInterventionEdit();
  isSavingIntervention = false;
  expandedHistoryId: string | null = null;

  ngOnInit(): void {
    this.loadTechnicians();
    this.loadGroupedAreas();
    this.search();
    this.loadPendingNews();
    this.listenRealtimeNews();
  }

  ngOnDestroy(): void {
    this.socketSub?.unsubscribe();
    if (this.pendingNewsReloadTimer) clearTimeout(this.pendingNewsReloadTimer);
  }

  // ============================================================
  //  TIEMPO REAL (socket): novedades / paradas asignadas a Mantenimiento
  // ============================================================

  private listenRealtimeNews(): void {
    this.socketSub = new Subscription();

    // Alerta inmediata cuando entra una novedad nueva (o redirigida) para Mantenimiento.
    this.socketSub.add(
      merge(this.socketService.productionNewsCreated$, this.socketService.productionNewsRedirected$).subscribe((event) => {
        const news = event?.news as ProductionNews | undefined;
        if (!news || !this.isAssignedToMaintenance(news)) return;
        this.notifyIncomingNews(news);
        this.schedulePendingNewsReload(news);
      })
    );

    // Cambios sobre novedades existentes (fin de parada, cierre, respuesta, salida por redirección).
    this.socketSub.add(
      merge(
        this.socketService.productionNewsStopFinished$,
        this.socketService.productionNewsClosed$,
        this.socketService.productionNewsResponded$,
        this.socketService.productionNewsRedirected$
      ).subscribe((event) => {
        const news = event?.news as ProductionNews | undefined;
        if (!news) return;
        const leftMaintenance = (event as ProductionNewsRedirectedEvent).previousArea === ViewNews.MAINTENANCE_AREA;
        const isListed = this.filteredPendingNews.some((n) => n._id === news._id) || this.isStop(news);
        if (isListed || leftMaintenance) this.schedulePendingNewsReload(news);
      })
    );
  }

  private isAssignedToMaintenance(news: ProductionNews): boolean {
    return news.assignment?.currentArea === ViewNews.MAINTENANCE_AREA;
  }

  private notifyIncomingNews(news: ProductionNews): void {
    const where = [news.origin?.area, news.origin?.subArea].filter((v) => !!v).join(' / ');
    const machine = news.origin?.machineCode ? `Máq. ${news.origin.machineCode}` : '';
    const message = [where, machine].filter((v) => !!v).join(' · ') || news.detail;

    if (this.isStop(news)) {
      this.toastr.error(message, `Parada de Proceso${news.stop?.isOngoing ? ' EN CURSO' : ''}`, {
        timeOut: 15000,
        progressBar: true
      });
    } else {
      this.toastr.warning(message, news.category || 'Nueva novedad', { timeOut: 10000, progressBar: true });
    }
  }

  /**
   * Recarga la tabla si el evento corresponde a la fecha consultada o es una parada
   * (las paradas en curso se muestran sin importar la fecha). Debounce para ráfagas.
   */
  private schedulePendingNewsReload(news: ProductionNews): void {
    const otherDate = !!news.newsDate && news.newsDate !== this.formatDateForBackend(this.pendingNewsDate);
    if (otherDate && !this.isStop(news)) return;
    if (this.pendingNewsReloadTimer) clearTimeout(this.pendingNewsReloadTimer);
    this.pendingNewsReloadTimer = setTimeout(() => this.loadPendingNews(), 400);
  }

  private loadGroupedAreas(): void {
    this.newsServices.getProductionAreasGrouped().subscribe({
      next: (res) => {
        if (res.ok) this.groupedAreas = res.msg;
      },
      error: (err) => console.error('Error cargando áreas agrupadas:', err)
    });
  }

  private loadTechnicians(): void {
    this.rhStaffService.getMaintenanceTechnicians().subscribe({
      next: (techs) => (this.technicians = techs),
      error: (err) => console.error('Error cargando técnicos de mantenimiento:', err)
    });
  }

  // ============================================================
  //  LISTADO
  // ============================================================

  search(): void {
    const filters: MaintenanceListFilters = {};
    if (this.filters.status) filters.status = this.filters.status as MaintenanceStatus;
    if (this.filters.maintenanceType) filters.maintenanceType = this.filters.maintenanceType as MaintenanceType;
    if (this.filters.machineCode.trim()) filters.machineCode = this.filters.machineCode.trim();
    if (this.filters.area.trim()) filters.area = this.filters.area.trim();

    this.isLoading = true;
    this.maintenanceService.listMaintenance(filters).subscribe({
      next: (res) => {
        // Más recientes primero por id (ObjectId = orden de creación); dateCreate es texto DD/MM/YYYY.
        const data = res?.ok && res.data ? [...res.data] : [];
        this.orders = data.sort((a, b) => String(b.id).localeCompare(String(a.id)));
      },
      error: (err: Error) => {
        this.orders = [];
        this.toastr.error(err.message || 'No se pudieron cargar las solicitudes.', 'Error');
      },
      complete: () => (this.isLoading = false)
    });
  }

  clearFilters(): void {
    this.filters = { status: '', maintenanceType: '', machineCode: '', area: '' };
    this.search();
  }

  statusClass(status: MaintenanceStatus): string {
    switch (status) {
      case 'PENDIENTE':
        return 'badge bg-secondary';
      case 'EN_PROCESO':
        return 'badge bg-info text-dark';
      case 'COMPLETADO':
        return 'badge bg-success';
      case 'CANCELADO':
        return 'badge bg-danger';
      default:
        return 'badge bg-light text-dark';
    }
  }

  priorityClass(priority: MaintenancePriority): string {
    switch (priority) {
      case 'BAJA':
        return 'badge bg-light text-dark';
      case 'MEDIA':
        return 'badge bg-primary';
      case 'ALTA':
        return 'badge bg-warning text-dark';
      case 'CRITICA':
        return 'badge bg-danger';
      default:
        return 'badge bg-light text-dark';
    }
  }

  // ============================================================
  //  NOVEDADES ENTRANTES (productionNews asignadas a Mantenimiento)
  // ============================================================

  /** Trae, para la fecha seleccionada, las novedades de otras áreas asignadas a Mantenimiento. */
  loadPendingNews(): void {
    const date = this.formatDateForBackend(this.pendingNewsDate);
    this.isLoadingPendingNews = true;
    this.dashboardService.viewNews(date, 'Mantenimiento').subscribe({
      next: (res) => {
        // El backend ya filtra por área asignada (Mantenimiento): se muestran TODAS las
        // categorías (Reporte Mantenimiento, Parada de Proceso, etc.), no solo los reportes.
        this.pendingNews = res.ok && res.msg ? res.msg : [];
        this.applyPendingNewsFilter();
      },
      error: (err: Error) => {
        this.pendingNews = [];
        this.filteredPendingNews = [];
        this.toastr.error(err.message || 'No se pudieron cargar las novedades entrantes.', 'Error');
      },
      complete: () => (this.isLoadingPendingNews = false)
    });
    this.loadOngoingStops();
  }

  /** Paradas en curso visibles para Mantenimiento, sin filtro de fecha (pueden durar días). */
  private loadOngoingStops(): void {
    this.newsServices.getOngoingStops(ViewNews.MAINTENANCE_AREA).subscribe({
      next: (res) => {
        this.ongoingStops = res.ok ? res.msg : [];
        this.applyPendingNewsFilter();
      },
      error: (err) => console.error('Error cargando paradas en curso:', err)
    });
  }

  /** Filtro de texto libre (buscador inteligente) sobre cualquier dato visible de la novedad. */
  applyPendingNewsFilter(): void {
    // Novedades de la fecha + paradas en curso de cualquier fecha (sin duplicar).
    const ids = new Set(this.pendingNews.map((n) => n._id));
    const all = [...this.pendingNews, ...this.ongoingStops.filter((s) => !ids.has(s._id))];

    const term = this.pendingNewsSearchTerm.trim().toLowerCase();
    const list = !term ? all : all.filter((n) => this.pendingNewsHaystack(n).includes(term));

    // Paradas en curso siempre primero (prioridad); dentro de cada grupo, el orden elegido.
    const dir = this.pendingNewsSortDirection === 'asc' ? 1 : -1;
    const rank = (n: ProductionNews): number => (this.isOngoingStop(n) ? 0 : 1);
    list.sort((a, b) => rank(a) - rank(b) || dir * this.comparePendingNews(a, b, this.pendingNewsSortField));
    this.filteredPendingNews = list;
  }

  /** Parada de Proceso que sigue abierta (sin hora de fin). */
  isOngoingStop(n: ProductionNews): boolean {
    return this.isStop(n) && this.isStopOngoing(n);
  }

  /** Texto del botón de acción en el panel de paradas en curso. */
  readonly ongoingStopActionLabel = (n: ProductionNews): string => {
    const generated = this.generatedFrom(n._id);
    return generated ? `Asignar MTTO #${generated.consecutiveMtto}` : 'Generar solicitud';
  };

  /** Desde una parada en curso: si ya tiene MTTO se abre la asignación; si no, se genera la solicitud. */
  onOngoingStopAction(n: ProductionNews): void {
    const generated = this.generatedFrom(n._id);
    if (generated) this.openEdit(generated);
    else this.generateFromNews(n);
  }

  /** Texto plano (concatenado) sobre el que corre la búsqueda: cualquier dato que el usuario tenga a mano. */
  private pendingNewsHaystack(n: ProductionNews): string {
    const generated = this.generatedFrom(n._id);
    return [
      n.category,
      n.reference,
      n.detail,
      n.origin?.area,
      n.origin?.subArea,
      n.origin?.machineCode,
      n.origin?.machineName,
      n.origin?.reportedBy?.name,
      n.origin?.reportedBy?.userApp,
      n.stop?.stopType,
      this.isStop(n) && this.isStopOngoing(n) ? 'en curso' : '',
      generated ? `MTTO ${generated.consecutiveMtto}` : ''
    ]
      .filter((v): v is string => !!v)
      .join(' ')
      .toLowerCase();
  }

  /** Cambia el campo de orden; si ya es el activo, invierte la dirección. */
  sortPendingNewsBy(field: PendingNewsSortField): void {
    if (this.pendingNewsSortField === field) {
      this.pendingNewsSortDirection = this.pendingNewsSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.pendingNewsSortField = field;
      this.pendingNewsSortDirection = 'asc';
    }
    this.applyPendingNewsFilter();
  }

  /** Ícono de orden a mostrar junto al título de columna. */
  pendingNewsSortIcon(field: PendingNewsSortField): string {
    if (this.pendingNewsSortField !== field) return '↕';
    return this.pendingNewsSortDirection === 'asc' ? '↑' : '↓';
  }

  private comparePendingNews(a: ProductionNews, b: ProductionNews, field: PendingNewsSortField): number {
    const value = (n: ProductionNews): string => {
      switch (field) {
        case 'reportedAt':
          return n.origin?.reportedAt || '';
        case 'category':
          return n.category || '';
        case 'origin':
          return `${n.origin?.area || ''} ${n.origin?.subArea || ''}`.trim();
        case 'machine':
          return `${n.origin?.machineCode || ''} ${n.origin?.machineName || ''}`.trim();
        case 'detail':
          return n.detail || '';
        case 'reportedBy':
          return n.origin?.reportedBy?.name || '';
        case 'status':
          return this.generatedFrom(n._id) ? '1' : '0';
        default:
          return '';
      }
    };
    return value(a).localeCompare(value(b), 'es', { sensitivity: 'base' });
  }

  /** Solicitud MTTO ya generada a partir de esta novedad, si existe (cruce en memoria). */
  generatedFrom(newsId: string): MaintenanceRequest | undefined {
    return this.orders.find((o) => o.sourceNewsId === newsId);
  }

  /** La novedad es una Parada de Proceso (valor actual o legacy). */
  isStop(n: ProductionNews): boolean {
    return isStopCategory(n.category);
  }

  isStopOngoing(n: ProductionNews): boolean {
    return isStopOngoing(n);
  }

  /** Horario legible de la parada: '09:00 - 09:10', '09:00 - En curso', etc. */
  stopSchedule(n: ProductionNews): string {
    return formatStopSchedule(n);
  }

  /** Resumen de la parada para prellenar la descripción de la falla en la solicitud. */
  private stopSummary(n: ProductionNews): string {
    const stop = n.stop;
    if (!stop) return '';
    const parts = [
      `Parada de Proceso (${stop.stopType || 'sin tipo'}) ${n.newsDate} ${this.stopSchedule(n)}`,
      stop.totalTime ? `Total: ${stop.totalTime}` : '',
      stop.finishedBy?.name ? `Finalizada por: ${stop.finishedBy.name}` : ''
    ];
    return parts.filter((p) => !!p).join(' · ');
  }

  /** Prellena y abre "Novedades Mantenimiento" con los datos de esta novedad. */
  generateFromNews(item: ProductionNews): void {
    const isStop = this.isStop(item);
    this.draftService.setDraft({
      ...(isStop && { maintenanceType: 'CORRECTIVO', failureDescription: this.stopSummary(item) }),
      sourceNewsId: item._id,
      sourceReference: item.reference,
      sourceCategory: item.category,
      machineArea: item.origin?.area || '',
      machineDepartment: item.origin?.subArea || '',
      machineCode: item.origin?.machineCode || '',
      machineName: item.origin?.machineName || '',
      description: item.detail || '',
      requestedBy: item.origin?.reportedBy?.name || '',
      reportedAt: item.origin?.reportedAt || ''
    });
    this.router.navigate(['/maintenance/maintenanceNews']);
  }

  private formatDate(date: Date): string {
    const d = new Date(date);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  }

  private formatDateForBackend(dateString: string): string {
    const d = new Date(dateString.replace(/-/g, '/'));
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${day}/${month}/${d.getFullYear()}`;
  }

  // ============================================================
  //  DETALLE
  // ============================================================

  openDetail(order: MaintenanceRequest): void {
    this.detailOrder = order;
    this.resetNewIntervention();
    this.editingInterventionId = null;
    this.expandedHistoryId = null;
    this.showDetailModal = true;
  }

  closeDetail(): void {
    this.showDetailModal = false;
    this.detailOrder = null;
  }

  // ============================================================
  //  EDICIÓN / ASIGNACIÓN
  // ============================================================

  openEdit(order: MaintenanceRequest): void {
    this.editOrder = order;

    // El backend guarda area/department por separado; si una solicitud vieja no trae
    // department, se recurre a partir el "area" compuesto como fallback.
    const area = order.area || '';
    const department = order.department || this.parseArea(order.area).department;
    this.editForm = {
      status: order.status,
      priority: order.priority,
      maintenanceType: order.maintenanceType,
      assignedTo: order.assignedTo || '',
      machineArea: area,
      machineDepartment: department,
      machineCode: order.machineCode || '',
      machineName: order.machineName || '',
      scheduledDate: order.scheduledDate || '',
      observation: ''
    };
    this.editAssignees = (order.assignees || []).map((a) => ({ ...a }));
    this.assigneeSearchTerm = '';

    // Preparar áreas/departamentos y máquinas del área actual.
    const group = this.groupedAreas.find((g) => g.area === area);
    this.availableDepartments = group ? group.subAreas : [];
    this.loadMachinesByArea(area);

    this.predictiveMachineList = [];
    this.showMachineDropdown = false;
    this.predictiveTechnicianList = [];
    this.showTechnicianDropdown = false;
    this.showEditModal = true;
  }

  closeEdit(): void {
    if (this.isSaving) return;
    this.showEditModal = false;
    this.editOrder = null;
  }

  saveEdit(): void {
    if (!this.editOrder) return;
    if (!this.editForm.observation?.trim()) {
      this.toastr.warning('Indique una observación que justifique el cambio.', 'Atención');
      return;
    }

    // Quitar a un técnico no borra lo que ya registró, pero se confirma para evitar errores.
    const kept = new Set(this.editAssignees.map((a) => a.document));
    const removedWithWork = (this.editOrder.assignees || []).filter((a) => !kept.has(a.document) && this.sessionsOf(a.document) > 0);
    if (
      removedWithWork.length &&
      !confirm(
        `${removedWithWork.map((a) => a.fullName).join(', ')} ya tiene actividades registradas. ` +
          'Se quitará de la asignación, pero sus actividades se conservan en el historial. ¿Continuar?'
      )
    ) {
      return;
    }

    const payload: UpdateMaintenanceRequest = {
      status: this.editForm.status,
      priority: this.editForm.priority,
      maintenanceType: this.editForm.maintenanceType,
      // `assignees` es el dato real (el técnico ve la solicitud en "Cargue de Novedad" por él);
      // el backend deriva `assignedTo` y lo deja vacío si se quitaron todos.
      assignees: this.editAssignees,
      // machineCode no es actualizable por el backend; sí machineName, area y department.
      machineName: this.editForm.machineName,
      area: this.editForm.machineArea,
      department: this.editForm.machineDepartment,
      scheduledDate: this.editForm.scheduledDate,
      observation: this.editForm.observation.trim()
    };

    this.isSaving = true;
    this.maintenanceService.updateMaintenance(this.editOrder.id, payload).subscribe({
      next: (res) => {
        if (!res?.ok) {
          this.toastr.error(res?.msg || 'No se pudo actualizar.', 'Error');
          return;
        }
        this.toastr.success('Solicitud actualizada.', 'Mantenimiento');
        this.replaceInList(res.data);
        this.showEditModal = false;
        this.editOrder = null;
      },
      error: (err: Error) => this.toastr.error(err.message || 'Error al actualizar.', 'Error'),
      complete: () => (this.isSaving = false)
    });
  }

  // ============================================================
  //  Vo.Bo (aprobaciones)
  // ============================================================

  approve(order: MaintenanceRequest, role: ApprovalRole): void {
    this.maintenanceService.registerApproval(order.id, { role }).subscribe({
      next: (res) => {
        if (!res?.ok) {
          this.toastr.error(res?.msg || 'No se pudo registrar el Vo.Bo.', 'Error');
          return;
        }
        order.supervisorApproval = res.data.supervisorApproval;
        order.requesterApproval = res.data.requesterApproval;
        this.toastr.success(res.msg || `Vo.Bo ${role} registrado.`, 'Mantenimiento');
      },
      error: (err: Error) => this.toastr.error(err.message || 'Error al registrar Vo.Bo.', 'Error')
    });
  }

  // ============================================================
  //  INTERVENCIONES
  // ============================================================

  /** Nombre legible del colaborador de un registro (snapshot, asignados o personal de RH). */
  personName(it: Intervention): string {
    if (it.person?.fullName) return it.person.fullName;
    const codes = it.technicianCodes || [];
    if (!codes.length) return '—';
    return codes.map((c) => this.nameByDocument(c)).join(', ');
  }

  private nameByDocument(document: string): string {
    const assignee = this.detailOrder?.assignees?.find((a) => a.document === document);
    if (assignee?.fullName) return assignee.fullName;
    const tech = this.technicians.find((t) => t.document === document);
    return tech?.fullName || document;
  }

  /** Personal elegible como ayudante: Auxiliares de Mantenimiento (o todo mantenimiento si RH no marca ninguno). */
  get assistantOptions(): MaintenanceTechnician[] {
    const assistants = this.technicians.filter((t) => t.isAssistant);
    return assistants.length ? assistants : this.technicians;
  }

  /** Tiempo total registrado por persona en la solicitud abierta (para validar). */
  get minutesByPerson(): { name: string; minutes: number; sessions: number }[] {
    const map = new Map<string, { name: string; minutes: number; sessions: number }>();
    for (const it of this.detailOrder?.interventions || []) {
      const key = it.person?.document || (it.technicianCodes || []).join(',') || '—';
      const row = map.get(key) || { name: this.personName(it), minutes: 0, sessions: 0 };
      row.minutes += it.durationMinutes || 0;
      row.sessions += 1;
      map.set(key, row);
    }
    return [...map.values()];
  }

  get newInterventionMinutes(): number | null {
    return calculateMinutes(this.newIntervention.startAt, this.newIntervention.endAt);
  }

  addIntervention(): void {
    if (!this.detailOrder) return;
    const workDone = this.newIntervention.workDone.trim();
    if (!workDone) {
      this.toastr.warning('Describa el trabajo realizado.', 'Atención');
      return;
    }
    if (!this.newIntervention.responsibleDocument) {
      this.toastr.warning('Seleccione el técnico responsable de la actividad.', 'Atención');
      return;
    }
    if (!this.newIntervention.startAt || !this.newIntervention.endAt || this.newInterventionMinutes === null) {
      this.toastr.warning('Indique inicio y fin válidos (el fin debe ser posterior al inicio).', 'Atención');
      return;
    }
    if (this.newIntervention.helperDocument === this.newIntervention.responsibleDocument) {
      this.toastr.warning('El ayudante no puede ser el mismo técnico responsable.', 'Atención');
      return;
    }

    const payload: AddInterventionRequest = {
      technicianCodes: [this.newIntervention.responsibleDocument],
      workDone,
      startAt: toBackendDateTime(this.newIntervention.startAt),
      endAt: toBackendDateTime(this.newIntervention.endAt),
      spareParts: [],
      helper: this.helperRefByDocument(this.newIntervention.helperDocument)
    };

    this.isAddingIntervention = true;
    this.maintenanceService.addIntervention(this.detailOrder.id, payload).subscribe({
      next: (res) => {
        if (!res?.ok) {
          this.toastr.error(res?.msg || 'No se pudo agregar la intervención.', 'Error');
          return;
        }
        this.toastr.success(res.msg || 'Acción de contención agregada.', 'Mantenimiento');
        this.detailOrder = res.data;
        this.replaceInList(res.data);
        this.resetNewIntervention();
      },
      error: (err: Error) => this.toastr.error(err.message || 'Error al agregar.', 'Error'),
      complete: () => (this.isAddingIntervention = false)
    });
  }

  private helperRefByDocument(document: string): PersonRef | null {
    if (!document) return null;
    const tech = this.technicians.find((t) => t.document === document);
    return { document, fullName: tech?.fullName || document };
  }

  // ---------- Corrección del Jefe (ej. registraron 300 min y eran 30) ----------

  startInterventionEdit(it: Intervention): void {
    this.editingInterventionId = it.id;
    this.interventionEditForm = {
      workDone: it.workDone || '',
      startAt: toDatetimeLocal(it.startAt),
      endAt: toDatetimeLocal(it.endAt),
      notes: it.notes || '',
      helperDocument: it.helper?.document || '',
      observation: '',
      isHelperRecord: it.role === 'AYUDANTE',
      originalMinutes: it.durationMinutes,
      originalHelperDocument: it.helper?.document || ''
    };
  }

  cancelInterventionEdit(): void {
    if (this.isSavingIntervention) return;
    this.editingInterventionId = null;
    this.interventionEditForm = this.buildEmptyInterventionEdit();
  }

  get interventionEditMinutes(): number | null {
    return calculateMinutes(this.interventionEditForm.startAt, this.interventionEditForm.endAt);
  }

  saveInterventionEdit(it: Intervention): void {
    if (!this.detailOrder) return;
    const f = this.interventionEditForm;
    if (!f.workDone.trim()) {
      this.toastr.warning('Describa el trabajo realizado.', 'Atención');
      return;
    }
    if (!f.startAt || !f.endAt || this.interventionEditMinutes === null) {
      this.toastr.warning('Indique inicio y fin válidos (el fin debe ser posterior al inicio).', 'Atención');
      return;
    }
    if (!f.observation.trim()) {
      this.toastr.warning('Indique el motivo del cambio: queda registrado en el historial.', 'Atención');
      return;
    }

    const payload: UpdateInterventionRequest = {
      workDone: f.workDone.trim(),
      startAt: toBackendDateTime(f.startAt),
      endAt: toBackendDateTime(f.endAt),
      notes: f.notes.trim(),
      observation: f.observation.trim()
    };
    // El ayudante solo se cambia/retira desde el registro del responsable.
    if (!f.isHelperRecord && f.helperDocument !== f.originalHelperDocument) {
      if (f.helperDocument && f.helperDocument === it.person?.document) {
        this.toastr.warning('El ayudante no puede ser el mismo técnico responsable.', 'Atención');
        return;
      }
      payload.helper = this.helperRefByDocument(f.helperDocument);
    }

    this.isSavingIntervention = true;
    this.maintenanceService.updateIntervention(this.detailOrder.id, it.id, payload).subscribe({
      next: (res) => {
        if (!res?.ok) {
          this.toastr.error(res?.msg || 'No se pudo guardar la corrección.', 'Error');
          return;
        }
        this.toastr.success('Corrección guardada y registrada en el historial.', 'Mantenimiento');
        this.detailOrder = res.data;
        this.replaceInList(res.data);
        this.editingInterventionId = null;
        this.interventionEditForm = this.buildEmptyInterventionEdit();
      },
      error: (err: Error) => this.toastr.error(err.message || 'Error al guardar la corrección.', 'Error'),
      complete: () => (this.isSavingIntervention = false)
    });
  }

  // ---------- Historial de cambios de una intervención ----------

  toggleHistory(it: Intervention): void {
    this.expandedHistoryId = this.expandedHistoryId === it.id ? null : it.id;
  }

  /** Cambios posteriores al registro (correcciones, habilitaciones, cambios de ayudante). */
  changeCount(it: Intervention): number {
    return (it.auditTrail || []).filter((a) => a.action !== 'INTERVENTION_ADDED').length;
  }

  auditActionLabel(action: string): string {
    switch (action) {
      case 'INTERVENTION_ADDED':
        return 'Registrada';
      case 'INTERVENTION_UPDATED':
        return 'Corregida por el técnico';
      case 'INTERVENTION_UPDATED_BY_JEFE':
        return 'Corregida por el Jefe';
      case 'INTERVENTION_EDIT_UNLOCKED':
        return 'Corrección habilitada';
      case 'INTERVENTION_HELPER_CHANGED':
        return 'Cambio de ayudante';
      default:
        return action;
    }
  }

  /** Resumen "antes" de una entrada de auditoría: valores anteriores de tiempo y actividad. */
  auditPreviousSummary(entry: AuditEntry): string {
    const prev = entry.previousState as unknown as Record<string, unknown> | null;
    if (!prev || typeof prev !== 'object') return '';
    const parts: string[] = [];
    if (prev['durationMinutes'] !== undefined && prev['durationMinutes'] !== null) {
      parts.push(`Tiempo: ${formatMinutes(prev['durationMinutes'] as number)}`);
    }
    if (prev['startAt']) parts.push(`Inicio: ${prev['startAt']}`);
    if (prev['endAt']) parts.push(`Fin: ${prev['endAt']}`);
    if (prev['workDone']) parts.push(`Trabajo: ${prev['workDone']}`);
    const person = prev['person'] as PersonRef | null | undefined;
    if (person?.fullName) parts.push(`Ayudante: ${person.fullName}`);
    return parts.join(' · ');
  }

  /** Habilita puntualmente que el técnico corrija esta intervención (Cargue de Novedad). */
  unlockInterventionEdit(intervention: Intervention): void {
    if (!this.detailOrder) return;
    this.maintenanceService.unlockInterventionEdit(this.detailOrder.id, intervention.id).subscribe({
      next: (res) => {
        if (!res?.ok) {
          this.toastr.error(res?.msg || 'No se pudo habilitar la corrección.', 'Error');
          return;
        }
        this.toastr.success('Corrección habilitada para el técnico.', 'Mantenimiento');
        this.detailOrder = res.data;
        this.replaceInList(res.data);
      },
      error: (err: Error) => this.toastr.error(err.message || 'Error al habilitar la corrección.', 'Error')
    });
  }

  // ============================================================
  //  ELIMINAR
  // ============================================================

  openDeleteModal(order: MaintenanceRequest): void {
    this.orderToDelete = order;
    this.showDeleteModal = true;
  }

  closeDeleteModal(): void {
    if (this.isDeleting) return;
    this.showDeleteModal = false;
    this.orderToDelete = null;
  }

  confirmDelete(): void {
    if (!this.orderToDelete) return;
    const order = this.orderToDelete;

    this.isDeleting = true;
    this.maintenanceService.deleteMaintenance(order.id).subscribe({
      next: (res) => {
        if (!res?.ok) {
          this.toastr.error(res?.msg || 'No se pudo eliminar.', 'Error');
          return;
        }
        this.orders = this.orders.filter((o) => o.id !== order.id);
        this.toastr.success('Solicitud eliminada.', 'Mantenimiento');
        this.showDeleteModal = false;
        this.orderToDelete = null;
      },
      error: (err: Error) => this.toastr.error(err.message || 'Error al eliminar.', 'Error'),
      complete: () => (this.isDeleting = false)
    });
  }

  // ============================================================
  //  EDICIÓN: ÁREA + DEPARTAMENTO (servicio agrupado)
  // ============================================================

  onEditAreaChange(area: string): void {
    const group = this.groupedAreas.find((g) => g.area === area);
    this.availableDepartments = group ? group.subAreas : [];
    this.editForm.machineDepartment = '';
    this.editForm.machineCode = '';
    this.editForm.machineName = '';
    this.predictiveMachineList = [];
    this.showMachineDropdown = false;
    this.loadMachinesByArea(area);
  }

  // ============================================================
  //  EDICIÓN: BUSCADOR PREDICTIVO DE MÁQUINAS
  // ============================================================

  private loadMachinesByArea(area: string): void {
    if (!area) {
      this.machinesByArea = [];
      return;
    }
    this.newsServices.getMachinesByArea({ area: area.toUpperCase() }).subscribe({
      next: (res) => (this.machinesByArea = res.ok ? res.msg : []),
      error: (err) => {
        console.error('Error cargando máquinas por área:', err);
        this.machinesByArea = [];
      }
    });
  }

  onEditMachineCodeChange(term: string): void {
    if (this.isSelectingMachine) return;
    const t = (term || '').toString().trim().toLowerCase();
    if (t.length < 1) {
      this.predictiveMachineList = [];
      this.showMachineDropdown = false;
      this.editForm.machineName = '';
      return;
    }
    this.predictiveMachineList = this.machinesByArea
      .filter((m) => (m.machineCode || '').toLowerCase().includes(t) || (m.machineName || '').toLowerCase().includes(t))
      .slice(0, 20);
    this.showMachineDropdown = this.predictiveMachineList.length > 0;
  }

  resolveMachineName(machine: Machine): string {
    return (machine.machineName || '').trim() || 'Definir Nombre';
  }

  selectEditMachine(machine: Machine): void {
    this.isSelectingMachine = true;
    this.editForm.machineCode = machine.machineCode;
    this.editForm.machineName = this.resolveMachineName(machine);
    this.predictiveMachineList = [];
    this.showMachineDropdown = false;
    setTimeout(() => (this.isSelectingMachine = false), 300);
  }

  onMachineBlur(): void {
    setTimeout(() => (this.showMachineDropdown = false), 120);
  }

  onMachineFocus(): void {
    if (this.isSelectingMachine) return;
    if (this.predictiveMachineList.length > 0) this.showMachineDropdown = true;
  }

  // ============================================================
  //  EDICIÓN: BUSCADOR PREDICTIVO DE TÉCNICOS (nombre o documento)
  // ============================================================

  onAssigneeSearchChange(term: string): void {
    if (this.isSelectingTechnician) return;
    const t = (term || '').toString().trim().toLowerCase();
    if (t.length < 1) {
      this.predictiveTechnicianList = [];
      this.showTechnicianDropdown = false;
      return;
    }
    const selected = new Set(this.editAssignees.map((a) => a.document));
    this.predictiveTechnicianList = this.technicians
      .filter(
        (tech) =>
          !selected.has(tech.document) &&
          ((tech.fullName || '').toLowerCase().includes(t) || (tech.document || '').toLowerCase().includes(t))
      )
      .slice(0, 20);
    this.showTechnicianDropdown = this.predictiveTechnicianList.length > 0;
  }

  addEditAssignee(tech: MaintenanceTechnician): void {
    this.isSelectingTechnician = true;
    if (!this.editAssignees.some((a) => a.document === tech.document)) {
      this.editAssignees.push({ document: tech.document, fullName: tech.fullName, specialty: tech.specialty });
    }
    this.assigneeSearchTerm = '';
    this.predictiveTechnicianList = [];
    this.showTechnicianDropdown = false;
    setTimeout(() => (this.isSelectingTechnician = false), 300);
  }

  /** Quita un técnico asignado por error. Sus actividades ya registradas se conservan (historial). */
  removeEditAssignee(index: number): void {
    this.editAssignees.splice(index, 1);
  }

  /** Actividades ya registradas por un técnico en la solicitud en edición (aviso al quitarlo). */
  sessionsOf(document: string): number {
    return (this.editOrder?.interventions || []).filter((i) => i.technicianCodes?.includes(document)).length;
  }

  onTechnicianBlur(): void {
    setTimeout(() => (this.showTechnicianDropdown = false), 120);
  }

  onTechnicianFocus(): void {
    if (this.isSelectingTechnician) return;
    if (this.predictiveTechnicianList.length > 0) this.showTechnicianDropdown = true;
  }

  // ============================================================
  //  HELPERS
  // ============================================================

  /** Separa un "Área / Departamento" en sus partes (fallback para datos antiguos sin department). */
  private parseArea(value?: string | null): { area: string; department: string } {
    const raw = (value || '').trim();
    if (!raw) return { area: '', department: '' };
    const [area, ...rest] = raw.split('/').map((p) => p.trim());
    return { area: area || '', department: rest.join(' / ') };
  }

  private replaceInList(updated: MaintenanceRequest): void {
    const idx = this.orders.findIndex((o) => o.id === updated.id);
    if (idx >= 0) this.orders[idx] = updated;
  }

  private buildEmptyEditForm(): EditForm {
    return {
      status: undefined,
      priority: undefined,
      maintenanceType: undefined,
      assignedTo: '',
      machineArea: '',
      machineDepartment: '',
      machineCode: '',
      machineName: '',
      scheduledDate: '',
      observation: ''
    };
  }

  private resetNewIntervention(): void {
    this.newIntervention = this.buildEmptyNewIntervention();
  }

  private buildEmptyNewIntervention(): NewInterventionForm {
    return { responsibleDocument: '', helperDocument: '', workDone: '', startAt: '', endAt: '' };
  }

  private buildEmptyInterventionEdit(): InterventionEditForm {
    return {
      workDone: '',
      startAt: '',
      endAt: '',
      notes: '',
      helperDocument: '',
      observation: '',
      isHelperRecord: false,
      originalMinutes: null,
      originalHelperDocument: ''
    };
  }
}

/** Alta de actividad por el Jefe a nombre de un técnico asignado (+ ayudante opcional). */
interface NewInterventionForm {
  responsibleDocument: string;
  helperDocument: string;
  workDone: string;
  startAt: string;
  endAt: string;
}

/** Corrección de una intervención por el Jefe (motivo obligatorio). */
interface InterventionEditForm {
  workDone: string;
  startAt: string;
  endAt: string;
  notes: string;
  helperDocument: string;
  observation: string;
  isHelperRecord: boolean;
  originalMinutes: number | null;
  originalHelperDocument: string;
}

/** Columnas por las que se puede ordenar la tabla de novedades entrantes. */
type PendingNewsSortField = 'reportedAt' | 'category' | 'origin' | 'machine' | 'detail' | 'reportedBy' | 'status';

/** Modelo del formulario de edición (área/departamento separados para los selects). */
interface EditForm {
  status?: MaintenanceStatus;
  priority?: MaintenancePriority;
  maintenanceType?: MaintenanceType;
  assignedTo: string;
  machineArea: string;
  machineDepartment: string;
  machineCode: string;
  machineName: string;
  scheduledDate: string;
  observation: string;
}
