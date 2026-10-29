// src/app/machining/mechanics-management/mechanics-management.ts
//
// "Gestión de Solicitudes" de Mecánica (exclusivo del Jefe). Mismo comportamiento que
// "Visualizar Novedades" de Mantenimiento:
//   - Novedades entrantes asignadas a Mecánica + PARADAS DE PROCESO EN CURSO (seguimiento).
//   - Generar la Solicitud SME desde una novedad (queda ligada a quien la reportó).
//   - Asignar mecánicos, registrar/corregir intervenciones, habilitar correcciones al técnico.
//   - Aceptación del solicitante: enviar a aceptación, ver evaluación (1-5 + comentario),
//     cerrar solo cuando el solicitante aceptó; reabrir una solicitud cerrada para editarla.
import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { merge, Subscription } from 'rxjs';
import { ProductionNews } from '../../interfaces/assembly.interface';
import { AuditEntry, MaintenanceAssignee, MaintenancePriority, MaintenanceStatus, PersonRef } from '../../interfaces/maintenance.interface';
import {
  MECHANICS_MACHINE_TYPES,
  MECHANICS_REQUESTED_WORK,
  MECHANICS_SME_REQUEST_TYPES,
  MechanicsExternalWork,
  MechanicsIntervention,
  MechanicsInterventionInput,
  MechanicsListFilters,
  MechanicsMachineType,
  MechanicsMaterial,
  MechanicsRequest,
  MechanicsSmeRequestType,
  MechanicsUpdateInterventionRequest,
  UpdateMechanicsRequest
} from '../../interfaces/mechanics.interface';
import { MaintenanceTechnician } from '../../interfaces/rh-staff.interface';
import { DashboardServices } from '../../services/dashboard-services';
import { MechanicsDraftService } from '../../services/mechanics-draft-service';
import { MechanicsServices } from '../../services/mechanics-services';
import { MenuAccessService } from '../../services/menu-access.service';
import { NewsServices } from '../../services/news-services';
import { RhStaffServices } from '../../services/rh-staff-services';
import { ProductionNewsRedirectedEvent, SocketService } from '../../services/socket-service';
import { OngoingStopsComponent } from '../../theme/layout/admin/navigation/ongoing-stops/ongoing-stops.component';
import { formatStopSchedule, isStopCategory, isStopOngoing } from '../../theme/layout/admin/navigation/stop-time.util';
import { WorkOrderAcceptanceComponent } from '../../theme/layout/admin/navigation/work-order-acceptance/work-order-acceptance.component';
import {
  acceptanceState,
  isReadyToClose,
  requiresRequesterAcceptance,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_STATUSES,
  workOrderPriorityClass,
  workOrderStatusClass,
  workOrderStatusLabel
} from '../../theme/layout/admin/navigation/work-order-acceptance/work-order.util';
import { calculateMinutes, formatMinutes, toBackendDate, toBackendDateTime, toDateInput, toDatetimeLocal } from '../mechanics-time.util';

@Component({
  selector: 'app-mechanics-management',
  standalone: true,
  imports: [CommonModule, FormsModule, OngoingStopsComponent, WorkOrderAcceptanceComponent],
  templateUrl: './mechanics-management.html',
  styleUrl: './mechanics-management.scss'
})
export class MechanicsManagement implements OnInit, OnDestroy {
  private mechanicsService = inject(MechanicsServices);
  private rhStaffService = inject(RhStaffServices);
  private newsServices = inject(NewsServices);
  private dashboardService = inject(DashboardServices);
  private draftService = inject(MechanicsDraftService);
  private router = inject(Router);
  private toastr = inject(ToastrService);
  private socketService = inject(SocketService);
  private menuAccessService = inject(MenuAccessService);

  /** Nombre del área en el catálogo productionAreas (área y subárea "Mecanica"). */
  static readonly MECHANICS_AREA = 'Mecanica';
  readonly mechanicsArea = MechanicsManagement.MECHANICS_AREA;

  readonly formatMinutes = formatMinutes;
  readonly statusLabel = workOrderStatusLabel;
  readonly statusClass = workOrderStatusClass;
  readonly priorityClass = workOrderPriorityClass;
  readonly acceptanceState = acceptanceState;
  readonly statuses: MaintenanceStatus[] = WORK_ORDER_STATUSES;
  readonly priorities: MaintenancePriority[] = WORK_ORDER_PRIORITIES;
  readonly machineTypes = MECHANICS_MACHINE_TYPES;
  readonly requestedWorkOptions = MECHANICS_REQUESTED_WORK;
  readonly smeRequestTypes = MECHANICS_SME_REQUEST_TYPES;

  /** Jefe de Mecánica: habilita correcciones, corrige tiempos, envía a aceptación y cierra. */
  get canManage(): boolean {
    return this.menuAccessService.isMechanicsManager();
  }

  private socketSub: Subscription | null = null;
  private pendingNewsReloadTimer: ReturnType<typeof setTimeout> | null = null;

  technicians: MaintenanceTechnician[] = [];

  // Listado
  filters: { status: string; area: string; consecutive: string } = { status: '', area: '', consecutive: '' };
  orders: MechanicsRequest[] = [];
  isLoading = false;
  acceptanceFilter: '' | 'ESPERANDO' | 'LISTAS' = '';
  isSavingAcceptance = false;

  // Novedades entrantes + paradas en curso
  pendingNewsDate: string = this.formatDate(new Date());
  pendingNews: ProductionNews[] = [];
  ongoingStops: ProductionNews[] = [];
  filteredPendingNews: ProductionNews[] = [];
  pendingNewsSearchTerm = '';
  isLoadingPendingNews = false;

  // Detalle
  showDetailModal = false;
  detailOrder: MechanicsRequest | null = null;
  ratingObservationDraft = '';

  // Edición
  showEditModal = false;
  isSaving = false;
  editOrder: MechanicsRequest | null = null;
  editForm: EditForm = this.buildEmptyEditForm();
  editAssignees: MaintenanceAssignee[] = [];
  editMaterials: MechanicsMaterial[] = [];
  editExternalWork: MechanicsExternalWork[] = [];
  assigneeSearchTerm = '';
  predictiveTechnicianList: MaintenanceTechnician[] = [];
  showTechnicianDropdown = false;
  private isSelectingTechnician = false;

  // Eliminar
  showDeleteModal = false;
  isDeleting = false;
  orderToDelete: MechanicsRequest | null = null;

  // Intervenciones (Jefe)
  newIntervention: NewInterventionForm = this.buildEmptyNewIntervention();
  isAddingIntervention = false;
  editingInterventionId: string | null = null;
  interventionEditForm: InterventionEditForm = this.buildEmptyInterventionEdit();
  isSavingIntervention = false;
  expandedHistoryId: string | null = null;

  ngOnInit(): void {
    this.rhStaffService.getMechanicsTechnicians().subscribe({
      next: (techs) => (this.technicians = techs),
      error: (err) => console.error('Error cargando personal de mecánica:', err)
    });
    this.search();
    this.loadPendingNews();
    this.listenRealtimeNews();
  }

  ngOnDestroy(): void {
    this.socketSub?.unsubscribe();
    if (this.pendingNewsReloadTimer) clearTimeout(this.pendingNewsReloadTimer);
  }

  // ============================================================
  //  TIEMPO REAL (socket): novedades / paradas asignadas a Mecánica
  // ============================================================

  private listenRealtimeNews(): void {
    this.socketSub = new Subscription();

    this.socketSub.add(
      merge(this.socketService.productionNewsCreated$, this.socketService.productionNewsRedirected$).subscribe((event) => {
        const news = event?.news as ProductionNews | undefined;
        if (!news || !this.isAssignedToMechanics(news)) return;
        this.notifyIncomingNews(news);
        this.schedulePendingNewsReload(news);
      })
    );

    this.socketSub.add(
      merge(
        this.socketService.productionNewsStopFinished$,
        this.socketService.productionNewsClosed$,
        this.socketService.productionNewsResponded$,
        this.socketService.productionNewsRedirected$
      ).subscribe((event) => {
        const news = event?.news as ProductionNews | undefined;
        if (!news) return;
        const previousArea = (event as ProductionNewsRedirectedEvent).previousArea;
        const leftMechanics = this.sameArea(previousArea);
        const isListed = this.filteredPendingNews.some((n) => n._id === news._id) || this.isStop(news);
        if (isListed || leftMechanics) this.schedulePendingNewsReload(news);
      })
    );
  }

  private sameArea(area: string | null | undefined): boolean {
    const norm = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    return !!area && norm(area) === norm(MechanicsManagement.MECHANICS_AREA);
  }

  private isAssignedToMechanics(news: ProductionNews): boolean {
    return this.sameArea(news.assignment?.currentArea);
  }

  private notifyIncomingNews(news: ProductionNews): void {
    const where = [news.origin?.area, news.origin?.subArea].filter((v) => !!v).join(' / ');
    const machine = news.origin?.machineCode ? `Máq. ${news.origin.machineCode}` : '';
    const message = [where, machine].filter((v) => !!v).join(' · ') || news.detail;
    if (this.isStop(news)) {
      this.toastr.error(message, `Parada de Proceso${news.stop?.isOngoing ? ' EN CURSO' : ''}`, { timeOut: 15000, progressBar: true });
    } else {
      this.toastr.warning(message, news.category || 'Nueva novedad', { timeOut: 10000, progressBar: true });
    }
  }

  private schedulePendingNewsReload(news: ProductionNews): void {
    const otherDate = !!news.newsDate && news.newsDate !== this.formatDateForBackend(this.pendingNewsDate);
    if (otherDate && !this.isStop(news)) return;
    if (this.pendingNewsReloadTimer) clearTimeout(this.pendingNewsReloadTimer);
    this.pendingNewsReloadTimer = setTimeout(() => this.loadPendingNews(), 400);
  }

  // ============================================================
  //  LISTADO
  // ============================================================

  search(): void {
    const filters: MechanicsListFilters = {};
    if (this.filters.status) filters.status = this.filters.status as MaintenanceStatus;
    if (this.filters.area.trim()) filters.area = this.filters.area.trim();
    if (this.filters.consecutive.trim()) filters.consecutiveSme = this.filters.consecutive.trim();

    this.isLoading = true;
    this.mechanicsService.listMechanics(filters).subscribe({
      next: (res) => (this.orders = res?.ok && res.data ? res.data : []),
      error: (err: Error) => {
        this.orders = [];
        this.toastr.error(err.message || 'No se pudieron cargar las solicitudes.', 'Error');
      },
      complete: () => (this.isLoading = false)
    });
  }

  clearFilters(): void {
    this.filters = { status: '', area: '', consecutive: '' };
    this.search();
  }

  get awaitingAcceptanceCount(): number {
    return this.orders.filter((o) => acceptanceState(o) === 'ESPERANDO').length;
  }

  get readyToCloseCount(): number {
    return this.orders.filter((o) => isReadyToClose(o)).length;
  }

  get visibleOrders(): MechanicsRequest[] {
    if (this.acceptanceFilter === 'ESPERANDO') return this.orders.filter((o) => acceptanceState(o) === 'ESPERANDO');
    if (this.acceptanceFilter === 'LISTAS') return this.orders.filter((o) => isReadyToClose(o));
    return this.orders;
  }

  toggleAcceptanceFilter(filter: 'ESPERANDO' | 'LISTAS'): void {
    this.acceptanceFilter = this.acceptanceFilter === filter ? '' : filter;
  }

  requestedWorkLabel(value: string | null | undefined): string {
    return this.requestedWorkOptions.find((o) => o.value === value)?.label || '—';
  }

  smeRequestTypeLabel(value: string | null | undefined): string {
    return this.smeRequestTypes.find((o) => o.value === value)?.label || '—';
  }

  machineTypeLabel(value: string | null | undefined): string {
    return this.machineTypes.find((o) => o.value === value)?.label || '—';
  }

  // ============================================================
  //  NOVEDADES ENTRANTES + PARADAS EN CURSO
  // ============================================================

  loadPendingNews(): void {
    const date = this.formatDateForBackend(this.pendingNewsDate);
    this.isLoadingPendingNews = true;
    this.dashboardService.viewNews(date, MechanicsManagement.MECHANICS_AREA).subscribe({
      next: (res) => {
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
    this.newsServices.getOngoingStops(MechanicsManagement.MECHANICS_AREA).subscribe({
      next: (res) => {
        this.ongoingStops = res.ok ? res.msg : [];
        this.applyPendingNewsFilter();
      },
      error: (err) => console.error('Error cargando paradas en curso:', err)
    });
  }

  applyPendingNewsFilter(): void {
    const ids = new Set(this.pendingNews.map((n) => n._id));
    const all = [...this.pendingNews, ...this.ongoingStops.filter((s) => !ids.has(s._id))];
    const term = this.pendingNewsSearchTerm.trim().toLowerCase();
    const list = !term ? all : all.filter((n) => this.pendingNewsHaystack(n).includes(term));
    // Paradas en curso siempre primero (prioridad); luego lo más reciente.
    const rank = (n: ProductionNews): number => (this.isOngoingStop(n) ? 0 : 1);
    list.sort((a, b) => rank(a) - rank(b) || (b.origin?.reportedAt || '').localeCompare(a.origin?.reportedAt || ''));
    this.filteredPendingNews = list;
  }

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
      n.stop?.stopType,
      this.isOngoingStop(n) ? 'en curso' : '',
      generated ? `SME ${generated.consecutiveSme}` : ''
    ]
      .filter((v): v is string => !!v)
      .join(' ')
      .toLowerCase();
  }

  isOngoingStop(n: ProductionNews): boolean {
    return this.isStop(n) && isStopOngoing(n);
  }

  isStop(n: ProductionNews): boolean {
    return isStopCategory(n.category);
  }

  isStopOngoing(n: ProductionNews): boolean {
    return isStopOngoing(n);
  }

  stopSchedule(n: ProductionNews): string {
    return formatStopSchedule(n);
  }

  /** Texto del botón en el panel de paradas en curso. */
  readonly ongoingStopActionLabel = (n: ProductionNews): string => {
    const generated = this.generatedFrom(n._id);
    return generated ? `Asignar SME #${generated.consecutiveSme}` : 'Generar solicitud';
  };

  onOngoingStopAction(n: ProductionNews): void {
    const generated = this.generatedFrom(n._id);
    if (generated) this.openEdit(generated);
    else this.generateFromNews(n);
  }

  generatedFrom(newsId: string): MechanicsRequest | undefined {
    return this.orders.find((o) => o.sourceNewsId === newsId);
  }

  /** Prellena y abre "Solicitud Herramental (SME)" con los datos de esta novedad. */
  generateFromNews(item: ProductionNews): void {
    const stop =
      this.isStop(item) && item.stop
        ? ` [Parada de Proceso (${item.stop.stopType || 'sin tipo'}) ${item.newsDate} ${this.stopSchedule(item)}]`
        : '';
    this.draftService.setDraft({
      sourceNewsId: item._id,
      sourceReference: item.reference,
      sourceCategory: item.category,
      area: item.origin?.area || '',
      department: item.origin?.subArea || '',
      machineCode: item.origin?.machineCode || '',
      machineName: item.origin?.machineName || '',
      description: `${item.detail || ''}${stop}`.trim(),
      requestedBy: item.origin?.reportedBy?.name || '',
      reportedAt: item.origin?.reportedAt || ''
    });
    this.router.navigate(['/machining/mechanicsRequest']);
  }

  // ============================================================
  //  ACEPTACIÓN DEL SOLICITANTE / CIERRE / REAPERTURA
  // ============================================================

  isStatusOptionDisabled(order: MechanicsRequest, status: MaintenanceStatus): boolean {
    if (status === order.status) return false;
    if (status === 'PENDIENTE_ACEPTACION') return !requiresRequesterAcceptance(order) || !order.interventions?.length;
    if (status === 'COMPLETADO') return requiresRequesterAcceptance(order) && acceptanceState(order) !== 'ACEPTADA';
    return false;
  }

  sendToAcceptance(order: MechanicsRequest): void {
    if (
      !confirm(
        `¿Enviar SME #${order.consecutiveSme} a ${order.requester?.name || 'el solicitante'} para que acepte y evalúe la intervención?`
      )
    ) {
      return;
    }
    this.changeStatus(
      order,
      { status: 'PENDIENTE_ACEPTACION', observation: 'Intervención enviada a aceptación del solicitante' },
      'Enviada a aceptación del solicitante.'
    );
  }

  closeOrder(order: MechanicsRequest): void {
    const rating = order.requesterApproval?.rating;
    const payload: UpdateMechanicsRequest = {
      status: 'COMPLETADO',
      observation: `Cierre de la solicitud${rating ? ` (solicitante calificó ${rating}/5)` : ''}`
    };
    if (!order.deliveredAt) payload.deliveredAt = this.todayBackend();
    this.changeStatus(order, payload, 'Solicitud cerrada.');
  }

  /** Reabre una solicitud cerrada para que se pueda editar/agregar trabajo (queda en el historial). */
  reopenOrder(order: MechanicsRequest): void {
    const reason = prompt(`Motivo para reabrir SME #${order.consecutiveSme} (queda en el historial):`);
    if (!reason?.trim()) return;
    this.changeStatus(order, { status: 'EN_PROCESO', observation: `Reapertura: ${reason.trim()}` }, 'Solicitud reabierta.');
  }

  /** SME (B): observación del Jefe sobre la calificación del solicitante. */
  saveRatingObservation(order: MechanicsRequest): void {
    const text = this.ratingObservationDraft.trim();
    if (!text) {
      this.toastr.warning('Escriba la observación.', 'Atención');
      return;
    }
    this.changeStatus(order, { ratingObservation: text, observation: 'Observación de la calificación (SME B)' }, 'Observación guardada.');
  }

  private changeStatus(order: MechanicsRequest, payload: UpdateMechanicsRequest, successMsg: string): void {
    this.isSavingAcceptance = true;
    this.mechanicsService.updateMechanics(order.id, payload).subscribe({
      next: (res) => {
        this.isSavingAcceptance = false;
        if (!res?.ok) {
          this.toastr.error(res?.msg || 'No se pudo actualizar.', 'Error');
          return;
        }
        this.toastr.success(successMsg, 'Mecánica');
        this.replaceInList(res.data);
        if (this.detailOrder?.id === res.data.id) {
          this.detailOrder = res.data;
          this.ratingObservationDraft = res.data.ratingObservation || '';
        }
      },
      error: (err: Error) => {
        this.isSavingAcceptance = false;
        this.toastr.error(err.message || 'Error al actualizar.', 'Error');
      }
    });
  }

  approveSupervisor(order: MechanicsRequest): void {
    this.mechanicsService.registerApproval(order.id, { role: 'SUPERVISOR' }).subscribe({
      next: (res) => {
        if (!res?.ok) {
          this.toastr.error(res?.msg || 'No se pudo registrar el Vo.Bo.', 'Error');
          return;
        }
        this.replaceInList(res.data);
        if (this.detailOrder?.id === res.data.id) this.detailOrder = res.data;
        this.toastr.success(res.msg || 'Vo.Bo registrado.', 'Mecánica');
      },
      error: (err: Error) => this.toastr.error(err.message || 'Error al registrar Vo.Bo.', 'Error')
    });
  }

  // ============================================================
  //  DETALLE
  // ============================================================

  openDetail(order: MechanicsRequest): void {
    this.detailOrder = order;
    this.ratingObservationDraft = order.ratingObservation || '';
    this.newIntervention = this.buildEmptyNewIntervention();
    this.editingInterventionId = null;
    this.expandedHistoryId = null;
    this.showDetailModal = true;
  }

  closeDetail(): void {
    this.showDetailModal = false;
    this.detailOrder = null;
  }

  /**
   * Tabla "TIEMPO EMPLEADO" del formato: por máquina-herramienta, H. Máq (tiempo de máquina
   * registrado por el responsable) y H. Hom (tiempo de cada persona, incluye al auxiliar).
   */
  get timeTable(): { type: MechanicsMachineType | 'SIN'; label: string; machine: number; man: number }[] {
    const order = this.detailOrder;
    if (!order) return [];
    const typeByGroup = new Map<string, MechanicsMachineType | null>();
    for (const it of order.interventions || []) {
      if (it.role !== 'AYUDANTE' && it.groupId) typeByGroup.set(it.groupId, it.machineType);
    }
    const rows = new Map<string, { type: MechanicsMachineType | 'SIN'; label: string; machine: number; man: number }>();
    for (const it of order.interventions || []) {
      const type = (it.role === 'AYUDANTE' && it.groupId ? typeByGroup.get(it.groupId) : it.machineType) || 'SIN';
      const row = rows.get(type) || { type, label: type === 'SIN' ? 'Sin máquina' : this.machineTypeLabel(type), machine: 0, man: 0 };
      if (it.role !== 'AYUDANTE') row.machine += it.machineMinutes || 0;
      row.man += it.durationMinutes || 0;
      rows.set(type, row);
    }
    const order_ = this.machineTypes.map((m) => m.value as string);
    return [...rows.values()].sort((a, b) => order_.indexOf(a.type) - order_.indexOf(b.type));
  }

  get timeTotals(): { machine: number; man: number } {
    return this.timeTable.reduce((acc, r) => ({ machine: acc.machine + r.machine, man: acc.man + r.man }), { machine: 0, man: 0 });
  }

  personName(it: MechanicsIntervention): string {
    if (it.person?.fullName) return it.person.fullName;
    const codes = it.technicianCodes || [];
    if (!codes.length) return '—';
    return codes.map((c) => this.nameByDocument(c)).join(', ');
  }

  private nameByDocument(document: string): string {
    const assignee = this.detailOrder?.assignees?.find((a) => a.document === document);
    if (assignee?.fullName) return assignee.fullName;
    return this.technicians.find((t) => t.document === document)?.fullName || document;
  }

  /** Auxiliares de Mecánica (o todo el personal si RH no marca ninguno). */
  get assistantOptions(): MaintenanceTechnician[] {
    const assistants = this.technicians.filter((t) => t.isAssistant);
    return assistants.length ? assistants : this.technicians;
  }

  get newInterventionMinutes(): number | null {
    return calculateMinutes(this.newIntervention.startAt, this.newIntervention.endAt);
  }

  addIntervention(): void {
    if (!this.detailOrder) return;
    const f = this.newIntervention;
    if (!f.workDone.trim()) {
      this.toastr.warning('Describa el trabajo realizado.', 'Atención');
      return;
    }
    if (!f.responsibleDocument) {
      this.toastr.warning('Seleccione el mecánico responsable de la actividad.', 'Atención');
      return;
    }
    if (!f.startAt || !f.endAt || this.newInterventionMinutes === null) {
      this.toastr.warning('Indique inicio y fin válidos (el fin debe ser posterior al inicio).', 'Atención');
      return;
    }
    if (f.helperDocument && f.helperDocument === f.responsibleDocument) {
      this.toastr.warning('El auxiliar no puede ser el mismo mecánico responsable.', 'Atención');
      return;
    }

    const payload: MechanicsInterventionInput = {
      technicianCodes: [f.responsibleDocument],
      workDone: f.workDone.trim(),
      startAt: toBackendDateTime(f.startAt),
      endAt: toBackendDateTime(f.endAt),
      spareParts: [],
      helper: this.helperRefByDocument(f.helperDocument),
      machineType: f.machineType || null,
      machineMinutes: f.machineMinutes
    };

    this.isAddingIntervention = true;
    this.mechanicsService.addIntervention(this.detailOrder.id, payload).subscribe({
      next: (res) => {
        if (!res?.ok) {
          this.toastr.error(res?.msg || 'No se pudo agregar la intervención.', 'Error');
          return;
        }
        this.toastr.success(res.msg || 'Intervención agregada.', 'Mecánica');
        this.detailOrder = res.data;
        this.replaceInList(res.data);
        this.newIntervention = this.buildEmptyNewIntervention();
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

  startInterventionEdit(it: MechanicsIntervention): void {
    this.editingInterventionId = it.id;
    this.interventionEditForm = {
      workDone: it.workDone || '',
      startAt: toDatetimeLocal(it.startAt),
      endAt: toDatetimeLocal(it.endAt),
      notes: it.notes || '',
      helperDocument: it.helper?.document || '',
      machineType: it.machineType || '',
      machineMinutes: it.machineMinutes,
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

  saveInterventionEdit(it: MechanicsIntervention): void {
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

    const payload: MechanicsUpdateInterventionRequest = {
      workDone: f.workDone.trim(),
      startAt: toBackendDateTime(f.startAt),
      endAt: toBackendDateTime(f.endAt),
      notes: f.notes.trim(),
      observation: f.observation.trim()
    };
    if (!f.isHelperRecord) {
      if (f.machineType) payload.machineType = f.machineType;
      if (f.machineMinutes !== null && f.machineMinutes !== undefined) payload.machineMinutes = f.machineMinutes;
      if (f.helperDocument !== f.originalHelperDocument) {
        if (f.helperDocument && f.helperDocument === it.person?.document) {
          this.toastr.warning('El auxiliar no puede ser el mismo mecánico responsable.', 'Atención');
          return;
        }
        payload.helper = this.helperRefByDocument(f.helperDocument);
      }
    }

    this.isSavingIntervention = true;
    this.mechanicsService.updateIntervention(this.detailOrder.id, it.id, payload).subscribe({
      next: (res) => {
        if (!res?.ok) {
          this.toastr.error(res?.msg || 'No se pudo guardar la corrección.', 'Error');
          return;
        }
        this.toastr.success('Corrección guardada y registrada en el historial.', 'Mecánica');
        this.detailOrder = res.data;
        this.replaceInList(res.data);
        this.editingInterventionId = null;
        this.interventionEditForm = this.buildEmptyInterventionEdit();
      },
      error: (err: Error) => this.toastr.error(err.message || 'Error al guardar la corrección.', 'Error'),
      complete: () => (this.isSavingIntervention = false)
    });
  }

  unlockInterventionEdit(it: MechanicsIntervention): void {
    if (!this.detailOrder) return;
    this.mechanicsService.unlockInterventionEdit(this.detailOrder.id, it.id).subscribe({
      next: (res) => {
        if (!res?.ok) {
          this.toastr.error(res?.msg || 'No se pudo habilitar la corrección.', 'Error');
          return;
        }
        this.toastr.success('Corrección habilitada para el mecánico.', 'Mecánica');
        this.detailOrder = res.data;
        this.replaceInList(res.data);
      },
      error: (err: Error) => this.toastr.error(err.message || 'Error al habilitar la corrección.', 'Error')
    });
  }

  toggleHistory(it: MechanicsIntervention): void {
    this.expandedHistoryId = this.expandedHistoryId === it.id ? null : it.id;
  }

  changeCount(it: MechanicsIntervention): number {
    return (it.auditTrail || []).filter((a) => a.action !== 'INTERVENTION_ADDED').length;
  }

  auditActionLabel(action: string): string {
    switch (action) {
      case 'INTERVENTION_ADDED':
        return 'Registrada';
      case 'INTERVENTION_UPDATED':
        return 'Corregida por el mecánico';
      case 'INTERVENTION_UPDATED_BY_JEFE':
        return 'Corregida por el Jefe';
      case 'INTERVENTION_EDIT_UNLOCKED':
        return 'Corrección habilitada';
      case 'INTERVENTION_HELPER_CHANGED':
        return 'Cambio de auxiliar';
      default:
        return action;
    }
  }

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
    if (prev['machineType']) parts.push(`Máquina: ${this.machineTypeLabel(prev['machineType'] as string)}`);
    if (prev['machineMinutes'] !== undefined && prev['machineMinutes'] !== null) {
      parts.push(`H. Máq: ${formatMinutes(prev['machineMinutes'] as number)}`);
    }
    const person = prev['person'] as PersonRef | null | undefined;
    if (person?.fullName) parts.push(`Auxiliar: ${person.fullName}`);
    return parts.join(' · ');
  }

  // ============================================================
  //  EDICIÓN / ASIGNACIÓN
  // ============================================================

  openEdit(order: MechanicsRequest): void {
    this.editOrder = order;
    this.editForm = {
      status: order.status,
      priority: order.priority,
      smeRequestType: order.smeRequestType || '',
      changeNumber: order.changeNumber || '',
      projectNumber: order.projectNumber || '',
      agreedDeliveryDate: toDateInput(order.agreedDeliveryDate),
      scheduledDate: toDateInput(order.scheduledDate),
      deliveredAt: toDateInput(order.deliveredAt),
      diagnosis: order.diagnosis || '',
      observation: ''
    };
    this.editAssignees = (order.assignees || []).map((a) => ({ ...a }));
    this.editMaterials = (order.materials || []).map((m) => ({ ...m }));
    this.editExternalWork = (order.externalWork || []).map((w) => ({ ...w }));
    this.assigneeSearchTerm = '';
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
    if (!this.editForm.observation.trim()) {
      this.toastr.warning('Indique una observación que justifique el cambio.', 'Atención');
      return;
    }

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

    const f = this.editForm;
    const payload: UpdateMechanicsRequest = {
      status: f.status,
      priority: f.priority,
      smeRequestType: f.smeRequestType,
      changeNumber: f.changeNumber.trim(),
      projectNumber: f.projectNumber.trim(),
      agreedDeliveryDate: f.agreedDeliveryDate ? toBackendDate(f.agreedDeliveryDate) : '',
      scheduledDate: f.scheduledDate ? toBackendDate(f.scheduledDate) : '',
      deliveredAt: f.deliveredAt ? toBackendDate(f.deliveredAt) : '',
      diagnosis: f.diagnosis.trim(),
      assignees: this.editAssignees,
      materials: this.editMaterials.filter((m) => m.description?.trim()),
      externalWork: this.editExternalWork.filter((w) => w.description?.trim()),
      observation: f.observation.trim()
    };

    this.isSaving = true;
    this.mechanicsService.updateMechanics(this.editOrder.id, payload).subscribe({
      next: (res) => {
        if (!res?.ok) {
          this.toastr.error(res?.msg || 'No se pudo actualizar.', 'Error');
          return;
        }
        this.toastr.success('Solicitud actualizada.', 'Mecánica');
        this.replaceInList(res.data);
        this.showEditModal = false;
        this.editOrder = null;
      },
      error: (err: Error) => this.toastr.error(err.message || 'Error al actualizar.', 'Error'),
      complete: () => (this.isSaving = false)
    });
  }

  addEditMaterial(): void {
    this.editMaterials.push({ code: '', description: '', unit: '', quantity: 1 });
  }

  addEditExternalWork(): void {
    this.editExternalWork.push({ description: '', provider: '', orderNumber: '' });
  }

  removeRow<T>(list: T[], index: number): void {
    list.splice(index, 1);
  }

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

  removeEditAssignee(index: number): void {
    this.editAssignees.splice(index, 1);
  }

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
  //  ELIMINAR
  // ============================================================

  openDeleteModal(order: MechanicsRequest): void {
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
    this.mechanicsService.deleteMechanics(order.id).subscribe({
      next: (res) => {
        if (!res?.ok) {
          this.toastr.error(res?.msg || 'No se pudo eliminar.', 'Error');
          return;
        }
        this.orders = this.orders.filter((o) => o.id !== order.id);
        this.toastr.success('Solicitud eliminada.', 'Mecánica');
        this.showDeleteModal = false;
        this.orderToDelete = null;
      },
      error: (err: Error) => this.toastr.error(err.message || 'Error al eliminar.', 'Error'),
      complete: () => (this.isDeleting = false)
    });
  }

  // ============================================================
  //  HELPERS
  // ============================================================

  private replaceInList(updated: MechanicsRequest): void {
    const idx = this.orders.findIndex((o) => o.id === updated.id);
    if (idx >= 0) this.orders[idx] = updated;
  }

  private formatDate(date: Date): string {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private formatDateForBackend(dateString: string): string {
    const d = new Date(dateString.replace(/-/g, '/'));
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }

  private todayBackend(): string {
    return this.formatDateForBackend(this.formatDate(new Date()));
  }

  private buildEmptyEditForm(): EditForm {
    return {
      status: undefined,
      priority: undefined,
      smeRequestType: '',
      changeNumber: '',
      projectNumber: '',
      agreedDeliveryDate: '',
      scheduledDate: '',
      deliveredAt: '',
      diagnosis: '',
      observation: ''
    };
  }

  private buildEmptyNewIntervention(): NewInterventionForm {
    return { responsibleDocument: '', helperDocument: '', workDone: '', startAt: '', endAt: '', machineType: '', machineMinutes: null };
  }

  private buildEmptyInterventionEdit(): InterventionEditForm {
    return {
      workDone: '',
      startAt: '',
      endAt: '',
      notes: '',
      helperDocument: '',
      machineType: '',
      machineMinutes: null,
      observation: '',
      isHelperRecord: false,
      originalMinutes: null,
      originalHelperDocument: ''
    };
  }
}

interface NewInterventionForm {
  responsibleDocument: string;
  helperDocument: string;
  workDone: string;
  startAt: string;
  endAt: string;
  machineType: MechanicsMachineType | '';
  machineMinutes: number | null;
}

interface InterventionEditForm {
  workDone: string;
  startAt: string;
  endAt: string;
  notes: string;
  helperDocument: string;
  machineType: MechanicsMachineType | '';
  machineMinutes: number | null;
  observation: string;
  isHelperRecord: boolean;
  originalMinutes: number | null;
  originalHelperDocument: string;
}

interface EditForm {
  status?: MaintenanceStatus;
  priority?: MaintenancePriority;
  smeRequestType: MechanicsSmeRequestType | '';
  changeNumber: string;
  projectNumber: string;
  agreedDeliveryDate: string;
  scheduledDate: string;
  deliveredAt: string;
  diagnosis: string;
  observation: string;
}
