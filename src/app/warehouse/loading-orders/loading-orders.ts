// src/app/warehouse/loading-orders/loading-orders.ts
//
// Administración de Órdenes de Cargue (solo administrativos de Bodega, ver warehouseAdminGuard):
// cargue del .PRN del ERP, cola / seguimiento, cierre parcial por OC, detalle con lecturas y
// auditoría, y registro de rechazos (reenvíos del ERP y archivos inválidos).
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { finalize } from 'rxjs';

import { DashInventoryServices } from '../../services/dashInventory-services';
import {
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
  LoadingOrderView
} from '../../interfaces/loading-order.interface';

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.prn', '.txt'];

type StatusFilter = 'queue' | 'closed' | 'all' | LoadingOrderStatus;
type AdminTab = 'orders' | 'rejections';
type ReadsFilter = 'ACTIVE' | 'VOIDED' | 'REJECTED' | 'ALL';

const STATUS_FILTERS: Record<'queue' | 'closed' | 'all', LoadingOrderStatus[]> = {
  queue: ['PENDING', 'IN_PICKING'],
  closed: ['PICKED', 'PICKED_PARTIAL'],
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

  // Detalle
  readonly detail = signal<LoadingOrderView | null>(null);
  readonly loadingDetail = signal(false);
  readonly readsFilter = signal<ReadsFilter>('ACTIVE');
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
      units: list.reduce((acc, o) => acc + (o.totals?.requestedQty ?? 0), 0)
    };
  });

  ngOnInit(): void {
    this.loadOrders();
  }

  setTab(tab: AdminTab): void {
    this.activeTab.set(tab);
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
    return order.status === 'PENDING' || order.status === 'IN_PICKING';
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
  //  DETALLE
  // ============================================================
  openDetail(order: LoadingOrderSummary): void {
    this.loadingDetail.set(true);
    this.readsFilter.set('ACTIVE');
    this.inventoryService
      .getLoadingOrderDetail({ loadingOrderId: order._id, includeReads: true, includeAudit: true })
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
