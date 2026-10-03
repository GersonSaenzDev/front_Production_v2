// src/app/warehouse/loading-orders/loading-orders.ts
//
// Administración de Órdenes de Cargue (solo administrativos de Bodega, ver warehouseAdminGuard):
// cargue del .PRN del ERP, cola / seguimiento, cierre parcial por OC, detalle con lecturas y
// auditoría, registro de rechazos (reenvíos del ERP y archivos inválidos), y asignación de OC a
// los operarios de prealistamiento (sin asignar = cola libre; varios = leen la OC en paralelo),
// vehículo y conductor para el Cargue en Muelle, y alertas de lecturas erradas en el muelle.
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { finalize } from 'rxjs';

import { DashInventoryServices } from '../../services/dashInventory-services';
import {
  DOCK_ALERT_LABELS,
  DockAlert,
  SUMMUM_EXPORT_LABELS,
  LOADING_ORDER_REJECT_LABELS,
  LOADING_ORDER_STATUS_LABELS,
  LoadingOrderFormatError,
  LoadingOrderListRequest,
  LoadingOrderRead,
  LoadingOrderRejection,
  LoadingOrderStatus,
  LoadingOrderSummary,
  LoadingOrderUploadResponse,
  LoadingOrderUploadResult,
  LoadingOrderView,
  PickingOperator,
  ScanSerialResponse
} from '../../interfaces/loading-order.interface';

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.prn', '.txt'];

type StatusFilter = 'queue' | 'closed' | 'dock' | 'all' | LoadingOrderStatus;
type AdminTab = 'orders' | 'operators' | 'dockAlerts' | 'rejections';
type ReadsFilter = 'ACTIVE' | 'VOIDED' | 'REJECTED' | 'ALL';

const STATUS_FILTERS: Record<'queue' | 'closed' | 'dock' | 'all', LoadingOrderStatus[]> = {
  queue: ['PENDING', 'IN_PICKING', 'PAUSED'],
  closed: ['PICKED', 'PICKED_PARTIAL'],
  dock: ['PICKED', 'PICKED_PARTIAL', 'LOADING'],
  all: []
};

const UPLOAD_REJECT_LABELS: Record<string, string> = {
  DUPLICATE_IDENTICAL: 'Reenvío idéntico',
  DUPLICATE_MODIFIED: 'Reenvío con modificaciones',
  INVALID_FORMAT: 'Formato inválido'
};

const CHANGE_LABELS: Record<string, string> = {
  ADDED: 'Agregado',
  REMOVED: 'Eliminado',
  QTY_CHANGED: 'Cantidad modificada'
};

@Component({
  selector: 'app-loading-orders',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './loading-orders.html',
  styleUrl: './loading-orders.scss'
})
export class LoadingOrders implements OnInit {
  private readonly inventoryService = inject(DashInventoryServices);
  private readonly toastr = inject(ToastrService);

  readonly statusLabels = LOADING_ORDER_STATUS_LABELS;
  readonly rejectLabels = LOADING_ORDER_REJECT_LABELS;
  readonly uploadRejectLabels = UPLOAD_REJECT_LABELS;
  readonly changeLabels = CHANGE_LABELS;
  readonly dockAlertLabels = DOCK_ALERT_LABELS;
  readonly summumLabels = SUMMUM_EXPORT_LABELS;
  readonly summumBusy = signal(false);
  readonly statusOptions = Object.keys(LOADING_ORDER_STATUS_LABELS) as LoadingOrderStatus[];

  readonly activeTab = signal<AdminTab>('orders');

  // Cargue
  readonly selectedFile = signal<File | null>(null);
  readonly uploading = signal(false);
  readonly uploadResult = signal<LoadingOrderUploadResult | null>(null);
  readonly uploadErrors = signal<LoadingOrderFormatError[]>([]);
  readonly uploadMessage = signal('');

  // Listado
  readonly orders = signal<LoadingOrderSummary[]>([]);
  readonly loadingOrders = signal(false);
  statusFilter: StatusFilter = 'queue';
  dateFrom = '';
  dateTo = '';
  orderNumber = '';

  // Cierre parcial
  readonly partialTarget = signal<LoadingOrderSummary | null>(null);
  readonly savingPartial = signal(false);
  partialObservation = '';

  // Operarios y asignación
  readonly operators = signal<PickingOperator[]>([]);
  readonly loadingOperators = signal(false);
  readonly savingOperator = signal(false);
  readonly activeOperators = computed(() => this.operators().filter((o) => o.active));
  newOperatorUserApp = '';
  newOperatorName = '';
  readonly assignTarget = signal<LoadingOrderSummary | null>(null);
  readonly assignSelection = signal<string[]>([]);
  readonly savingAssign = signal(false);

  // Vehículo y conductor (Cargue en Muelle)
  readonly dispatchTarget = signal<LoadingOrderSummary | null>(null);
  readonly savingDispatch = signal(false);
  dispatchForm = { vehiclePlate: '', driverName: '', driverDocument: '', driverPhone: '', carrier: '' };

  // Alertas del muelle
  readonly dockAlerts = signal<DockAlert[]>([]);
  readonly loadingDockAlerts = signal(false);
  readonly pendingDockAlerts = computed(() => this.dockAlerts().filter((a) => !a.review.reviewed).length);
  readonly reviewTarget = signal<DockAlert | null>(null);
  readonly savingReview = signal(false);
  reviewObservation = '';

  // Detalle
  readonly detail = signal<LoadingOrderView | null>(null);
  readonly loadingDetail = signal(false);
  readonly readsFilter = signal<ReadsFilter>('ACTIVE');
  /** Seriales ya subidos al vehículo: los prealistados que no estén aquí son el faltante del muelle */
  readonly loadedSet = computed(() => new Set(this.detail()?.loadedSerials ?? []));
  readonly detailInDock = computed(() => ['PICKED', 'PICKED_PARTIAL', 'LOADING'].includes(this.detail()?.status ?? ''));
  readonly detailInPicking = computed(() => ['PENDING', 'IN_PICKING'].includes(this.detail()?.status ?? ''));

  // Retiro y reposición de unidades (faltante del muelle)
  readonly removeTarget = signal<LoadingOrderRead | null>(null);
  readonly removing = signal(false);
  removeObservation = '';
  replenishSerial = '';
  readonly replenishing = signal(false);
  readonly closingPicking = signal(false);
  pickingCloseObservation = '';

  readonly filteredReads = computed<LoadingOrderRead[]>(() => {
    const reads = this.detail()?.reads ?? [];
    const filter = this.readsFilter();
    return filter === 'ALL' ? reads : reads.filter((r) => r.status === filter);
  });

  // Rechazos
  readonly rejections = signal<LoadingOrderRejection[]>([]);
  readonly loadingRejections = signal(false);
  readonly expandedRejection = signal<string | null>(null);

  readonly queueStats = computed(() => {
    const list = this.orders();
    return {
      total: list.length,
      pending: list.filter((o) => o.status === 'PENDING').length,
      inPicking: list.filter((o) => o.status === 'IN_PICKING').length,
      unassigned: list.filter((o) => this.isEditable(o) && !o.assignedTo?.length).length,
      units: list.reduce((acc, o) => acc + (o.totals?.requestedQty ?? 0), 0)
    };
  });

  ngOnInit(): void {
    this.loadOrders();
    this.loadOperators();
    this.loadDockAlerts();
  }

  setTab(tab: AdminTab): void {
    this.activeTab.set(tab);
    if (tab === 'dockAlerts') this.loadDockAlerts();
    if (tab === 'rejections' && !this.rejections().length) this.loadRejections();
  }

  // ============================================================
  //  CARGUE DEL .PRN
  // ============================================================
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;

    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      this.toastr.warning('El archivo de Órdenes de Cargue debe ser .PRN o .TXT.', 'Cargue de OC');
      return;
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      this.toastr.warning('El archivo está vacío o supera 2 MB.', 'Cargue de OC');
      return;
    }
    this.selectedFile.set(file);
  }

  clearFile(): void {
    this.selectedFile.set(null);
  }

  uploadFile(): void {
    const file = this.selectedFile();
    if (!file) return;

    this.uploading.set(true);
    this.uploadResult.set(null);
    this.uploadErrors.set([]);
    this.uploadMessage.set('');
    // Todo intento de cargue puede generar rechazos: se invalida la auditoría para recargarla
    this.rejections.set([]);

    this.inventoryService
      .uploadLoadingOrder(file)
      .pipe(
        finalize(() => {
          this.uploading.set(false);
          if (this.activeTab() === 'rejections') this.loadRejections();
        })
      )
      .subscribe({
        next: (res) => {
          this.handleUploadResponse(res);
          this.toastr.success(res.msg, 'Cargue de OC');
          this.selectedFile.set(null);
          this.loadOrders();
        },
        error: (err: HttpErrorResponse) => {
          const body = err.error as LoadingOrderUploadResponse | null;
          if (body?.msg) {
            this.handleUploadResponse(body);
            this.toastr.error(body.msg, 'Cargue de OC');
          } else {
            this.toastr.error('No se pudo cargar el archivo.', 'Cargue de OC');
          }
        }
      });
  }

  private handleUploadResponse(res: LoadingOrderUploadResponse): void {
    this.uploadMessage.set(res.msg);
    this.uploadResult.set(res.data ?? null);
    this.uploadErrors.set(res.errors ?? []);
  }

  // ============================================================
  //  LISTADO
  // ============================================================
  loadOrders(): void {
    const payload: LoadingOrderListRequest = {};
    const filter = this.statusFilter;
    const status = filter in STATUS_FILTERS ? STATUS_FILTERS[filter as keyof typeof STATUS_FILTERS] : [filter as LoadingOrderStatus];
    if (status.length) payload.status = status;
    if (this.dateFrom) payload.from = this.dateFrom;
    if (this.dateTo) payload.to = this.dateTo;

    const number = this.orderNumber.replace(/\D/g, '');
    if (number) payload.loadingOrder = number.padStart(10, '0');

    this.loadingOrders.set(true);
    this.inventoryService
      .listLoadingOrders(payload)
      .pipe(finalize(() => this.loadingOrders.set(false)))
      .subscribe({
        next: (res) => this.orders.set(res.data ?? []),
        error: (err: Error) => this.toastr.error(err.message, 'Órdenes de Cargue')
      });
  }

  clearFilters(): void {
    this.statusFilter = 'queue';
    this.dateFrom = '';
    this.dateTo = '';
    this.orderNumber = '';
    this.loadOrders();
  }

  percent(order: LoadingOrderSummary | LoadingOrderView): number {
    const requested = order.totals?.requestedQty ?? 0;
    return requested ? Math.round(((order.totals?.pickedQty ?? 0) / requested) * 100) : 0;
  }

  isEditable(order: LoadingOrderSummary): boolean {
    return order.status === 'PENDING' || order.status === 'IN_PICKING' || order.status === 'PAUSED';
  }

  // ============================================================
  //  CIERRE PARCIAL
  // ============================================================
  openPartialClose(order: LoadingOrderSummary): void {
    if (!this.isEditable(order)) return;
    this.partialObservation = '';
    this.partialTarget.set(order);
  }

  cancelPartialClose(): void {
    this.partialTarget.set(null);
  }

  confirmPartialClose(): void {
    const target = this.partialTarget();
    const observation = this.partialObservation.trim();
    if (!target) return;
    if (observation.length < 5) {
      this.toastr.warning('Indique el motivo del cambio (mínimo 5 caracteres).', 'Cierre parcial');
      return;
    }

    const allowPartialClose = !target.allowPartialClose;
    this.savingPartial.set(true);
    this.inventoryService
      .setLoadingOrderPartialClose({ loadingOrderId: target._id, allowPartialClose, observation })
      .pipe(finalize(() => this.savingPartial.set(false)))
      .subscribe({
        next: (res) => {
          this.toastr.success(res.msg || 'Actualizado.', 'Cierre parcial');
          this.orders.update((list) => list.map((o) => (o._id === target._id ? { ...o, allowPartialClose } : o)));
          this.partialTarget.set(null);
        },
        error: (err: Error) => this.toastr.error(err.message, 'Cierre parcial')
      });
  }

  // ============================================================
  //  OPERARIOS
  // ============================================================
  loadOperators(): void {
    this.loadingOperators.set(true);
    this.inventoryService
      .getPickingOperators()
      .pipe(finalize(() => this.loadingOperators.set(false)))
      .subscribe({
        next: (res) => this.operators.set(res.data ?? []),
        error: (err: Error) => this.toastr.error(err.message, 'Operarios')
      });
  }

  addOperator(): void {
    const userApp = this.newOperatorUserApp.trim().toUpperCase();
    if (!/^[A-Z0-9._-]{3,40}$/.test(userApp)) {
      this.toastr.warning('Ingrese el usuario de login del operario (ej. PREBODEGA3).', 'Operarios');
      return;
    }
    this.saveOperator({ userApp, name: this.newOperatorName.trim(), active: true }, () => {
      this.newOperatorUserApp = '';
      this.newOperatorName = '';
    });
  }

  toggleOperator(op: PickingOperator): void {
    this.saveOperator({ userApp: op.userApp, name: op.name, active: !op.active });
  }

  private saveOperator(payload: { userApp: string; name: string; active: boolean }, onSaved?: () => void): void {
    this.savingOperator.set(true);
    this.inventoryService
      .savePickingOperator(payload)
      .pipe(finalize(() => this.savingOperator.set(false)))
      .subscribe({
        next: (res) => {
          this.toastr.success(res.msg, 'Operarios');
          onSaved?.();
          this.loadOperators();
        },
        error: (err: Error) => this.toastr.error(err.message, 'Operarios')
      });
  }

  // ============================================================
  //  ASIGNACIÓN DE OC
  // ============================================================
  openAssign(order: LoadingOrderSummary): void {
    if (!this.isEditable(order)) return;
    this.assignSelection.set((order.assignedTo ?? []).map((a) => a.userApp));
    this.assignTarget.set(order);
  }

  cancelAssign(): void {
    this.assignTarget.set(null);
  }

  toggleAssignee(userApp: string): void {
    this.assignSelection.update((list) => (list.includes(userApp) ? list.filter((u) => u !== userApp) : [...list, userApp]));
  }

  confirmAssign(): void {
    const target = this.assignTarget();
    if (!target) return;

    this.savingAssign.set(true);
    this.inventoryService
      .assignLoadingOrder({ loadingOrderId: target._id, operators: this.assignSelection() })
      .pipe(finalize(() => this.savingAssign.set(false)))
      .subscribe({
        next: (res) => {
          this.toastr.success(res.msg, 'Asignar OC');
          this.orders.update((list) => list.map((o) => (o._id === target._id ? { ...o, assignedTo: res.data.assignedTo } : o)));
          this.assignTarget.set(null);
          this.loadOperators();
        },
        error: (err: Error) => this.toastr.error(err.message, 'Asignar OC')
      });
  }

  // ============================================================
  //  VEHÍCULO Y CONDUCTOR
  // ============================================================
  canSetDispatch(order: LoadingOrderSummary): boolean {
    return !['DISPATCHED', 'CANCELLED'].includes(order.status);
  }

  openDispatch(order: LoadingOrderSummary): void {
    if (!this.canSetDispatch(order)) return;
    const d = order.dispatch;
    this.dispatchForm = {
      vehiclePlate: d?.vehiclePlate ?? '',
      driverName: d?.driverName ?? '',
      driverDocument: d?.driverDocument ?? '',
      driverPhone: d?.driverPhone ?? '',
      carrier: d?.carrier ?? ''
    };
    this.dispatchTarget.set(order);
  }

  cancelDispatch(): void {
    this.dispatchTarget.set(null);
  }

  get dispatchFormValid(): boolean {
    const f = this.dispatchForm;
    const plate = f.vehiclePlate.toUpperCase().replace(/[\s-]/g, '');
    return /^[A-Z0-9]{5,7}$/.test(plate) && f.driverName.trim().length >= 5 && /^[0-9A-Za-z.\s]{5,20}$/.test(f.driverDocument.trim());
  }

  confirmDispatch(): void {
    const target = this.dispatchTarget();
    if (!target || !this.dispatchFormValid) return;
    const f = this.dispatchForm;

    this.savingDispatch.set(true);
    this.inventoryService
      .setLoadingOrderDispatchInfo({
        loadingOrderId: target._id,
        vehiclePlate: f.vehiclePlate.toUpperCase().replace(/[\s-]/g, ''),
        driverName: f.driverName.trim(),
        driverDocument: f.driverDocument.trim(),
        driverPhone: f.driverPhone.trim(),
        carrier: f.carrier.trim()
      })
      .pipe(finalize(() => this.savingDispatch.set(false)))
      .subscribe({
        next: (res) => {
          this.toastr.success(res.msg, 'Vehículo y conductor');
          this.orders.update((list) => list.map((o) => (o._id === target._id ? { ...o, dispatch: { ...o.dispatch, ...res.data.dispatch } } : o)));
          this.dispatchTarget.set(null);
        },
        error: (err: Error) => this.toastr.error(err.message, 'Vehículo y conductor')
      });
  }

  // ============================================================
  //  ALERTAS DEL MUELLE
  // ============================================================
  loadDockAlerts(): void {
    this.loadingDockAlerts.set(true);
    this.inventoryService
      .getDockAlerts()
      .pipe(finalize(() => this.loadingDockAlerts.set(false)))
      .subscribe({
        next: (res) => this.dockAlerts.set(res.data ?? []),
        error: (err: Error) => this.toastr.error(err.message, 'Alertas de muelle')
      });
  }

  openReview(alert: DockAlert): void {
    this.reviewObservation = '';
    this.reviewTarget.set(alert);
  }

  cancelReview(): void {
    this.reviewTarget.set(null);
  }

  confirmReview(): void {
    const target = this.reviewTarget();
    const observation = this.reviewObservation.trim();
    if (!target || observation.length < 5) return;

    this.savingReview.set(true);
    this.inventoryService
      .reviewDockAlert(target._id, observation)
      .pipe(finalize(() => this.savingReview.set(false)))
      .subscribe({
        next: (res) => {
          this.toastr.success(res.msg || 'Alerta revisada.', 'Alertas de muelle');
          this.dockAlerts.update((list) => list.map((a) => (a._id === target._id ? res.data : a)));
          this.reviewTarget.set(null);
        },
        error: (err: Error) => this.toastr.error(err.message, 'Alertas de muelle')
      });
  }

  // ============================================================
  //  DETALLE
  // ============================================================
  openDetail(order: LoadingOrderSummary): void {
    this.readsFilter.set('ACTIVE');
    this.replenishSerial = '';
    this.pickingCloseObservation = '';
    this.reloadDetail(order._id);
  }

  private reloadDetail(loadingOrderId: string): void {
    this.loadingDetail.set(true);
    this.inventoryService
      .getLoadingOrderDetail({ loadingOrderId, includeReads: true, includeAudit: true })
      .pipe(finalize(() => this.loadingDetail.set(false)))
      .subscribe({
        next: (res) => this.detail.set(res.data),
        error: (err: Error) => this.toastr.error(err.message, 'Detalle de OC')
      });
  }

  closeDetail(): void {
    this.detail.set(null);
  }

  // ============================================================
  //  ARCHIVO SUMMUM (.sal)
  // ============================================================
  /** Descarga el .sal tal cual se envió (latin1, CRLF) para cargarlo manualmente si hace falta. */
  downloadSummumFile(): void {
    const d = this.detail();
    if (!d) return;
    this.summumBusy.set(true);
    this.inventoryService
      .getSummumExportFile(d._id)
      .pipe(finalize(() => this.summumBusy.set(false)))
      .subscribe({
        next: (res) => {
          const { fileName, content } = res.data;
          const bytes = Uint8Array.from(content, (c) => c.charCodeAt(0) & 0xff);
          const url = URL.createObjectURL(new Blob([bytes], { type: 'text/plain' }));
          const link = document.createElement('a');
          link.href = url;
          link.download = fileName;
          link.click();
          URL.revokeObjectURL(url);
        },
        error: (err: Error) => this.toastr.error(err.message, 'Archivo Summum')
      });
  }

  resendSummumFile(): void {
    const d = this.detail();
    if (!d) return;
    this.summumBusy.set(true);
    this.inventoryService
      .resendSummumExport(d._id)
      .pipe(finalize(() => this.summumBusy.set(false)))
      .subscribe({
        next: (res) => {
          this.toastr.success(res.msg || 'Archivo reenviado.', 'Archivo Summum');
          this.reloadDetail(d._id);
        },
        error: (err: Error) => {
          this.toastr.error(err.message, 'Archivo Summum', { timeOut: 10000 });
          this.reloadDetail(d._id);
        }
      });
  }

  // ============================================================
  //  RETIRO Y REPOSICIÓN DE UNIDADES
  // ============================================================
  openRemove(read: LoadingOrderRead): void {
    this.removeObservation = '';
    this.removeTarget.set(read);
  }

  cancelRemove(): void {
    this.removeTarget.set(null);
  }

  confirmRemove(): void {
    const target = this.removeTarget();
    const observation = this.removeObservation.trim();
    const d = this.detail();
    if (!target || !d || observation.length < 5) return;

    this.removing.set(true);
    this.inventoryService
      .removePickedUnit(target._id, observation)
      .pipe(finalize(() => this.removing.set(false)))
      .subscribe({
        next: (res) => {
          this.toastr.warning(res.msg, 'Unidad retirada', { timeOut: 10000 });
          this.removeTarget.set(null);
          this.reloadDetail(d._id);
          this.loadOrders();
        },
        error: (err: Error) => this.toastr.error(err.message, 'Retirar unidad')
      });
  }

  /** Lectura de la unidad de reemplazo con los mismos controles del prealistamiento. */
  replenish(): void {
    const d = this.detail();
    const serial = this.replenishSerial.replace(/\D/g, '');
    this.replenishSerial = '';
    if (!d || !serial) return;
    if (serial.length !== 27) {
      this.toastr.warning(`El serial debe tener 27 dígitos (se leyeron ${serial.length}).`, 'Reponer unidad');
      return;
    }

    this.replenishing.set(true);
    this.inventoryService
      .scanLoadingOrderSerial({ loadingOrderId: d._id, serial })
      .pipe(finalize(() => this.replenishing.set(false)))
      .subscribe({
        next: (res) => {
          const read = (res.data as { read?: { reference?: string; product?: string } } | undefined)?.read;
          this.toastr.success(`${read?.reference || read?.product || 'Unidad'} agregada a la OC.`, 'Reponer unidad');
          this.reloadDetail(d._id);
        },
        error: (err: HttpErrorResponse) => {
          const body = err.error as ScanSerialResponse | null;
          const reason = body?.rejectReason ? this.rejectLabels[body.rejectReason] + ': ' : '';
          this.toastr.error(reason + (body?.msg || 'No se pudo registrar la lectura.'), 'Reponer unidad', { timeOut: 8000 });
        }
      });
  }

  /** Cierra de nuevo el prealistamiento tras reponer: la OC vuelve a quedar lista para el muelle. */
  closePicking(): void {
    const d = this.detail();
    if (!d) return;
    const observation = this.pickingCloseObservation.trim();
    const partial = d.progress.pendingQty > 0;
    if (partial && observation.length < 5) {
      this.toastr.warning('Faltan unidades: indique el motivo del cierre parcial (mínimo 5 caracteres).', 'Cerrar prealistamiento');
      return;
    }

    this.closingPicking.set(true);
    this.inventoryService
      .completeLoadingOrderPicking({ loadingOrderId: d._id, ...(partial ? { observation } : {}) })
      .pipe(finalize(() => this.closingPicking.set(false)))
      .subscribe({
        next: (res) => {
          this.toastr.success(res.msg, 'Cerrar prealistamiento');
          this.pickingCloseObservation = '';
          this.reloadDetail(d._id);
          this.loadOrders();
        },
        error: (err: HttpErrorResponse) => {
          this.toastr.error((err.error as { msg?: string } | null)?.msg || 'No se pudo cerrar el prealistamiento.', 'Cerrar prealistamiento');
          this.reloadDetail(d._id);
        }
      });
  }

  // ============================================================
  //  RECHAZOS
  // ============================================================
  loadRejections(): void {
    this.loadingRejections.set(true);
    this.inventoryService
      .listLoadingOrderRejections()
      .pipe(finalize(() => this.loadingRejections.set(false)))
      .subscribe({
        next: (res) => this.rejections.set(res.data ?? []),
        error: (err: Error) => this.toastr.error(err.message, 'Rechazos')
      });
  }

  toggleRejection(id: string): void {
    this.expandedRejection.update((current) => (current === id ? null : id));
  }
}
