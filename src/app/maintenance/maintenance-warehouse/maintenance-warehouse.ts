// src/app/maintenance/maintenance-warehouse/maintenance-warehouse.ts
//
// Almacén de Mantenimiento: acá el personal de Almacén ve las solicitudes de mantenimiento
// y registra qué repuestos/materiales se entregan para cada una, quién entrega (el usuario
// logueado) y quién recibe, con fecha/hora. Cada entrega queda en el historial de la propia
// solicitud (warehouseDeliveries, con auditoría) para poder controlar el proceso completo.
//
// Acceso restringido a una lista puntual de usuarios (ver menu-access.service.ts +
// maintenance-warehouse.guard.ts): no es un componente abierto a toda el área de Mantenimiento.
import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import {
  AddWarehouseDeliveryRequest,
  MaintenanceListFilters,
  MaintenancePriority,
  MaintenanceRequest,
  MaintenanceStatus,
  PersonRef,
  SparePart,
} from '../../interfaces/maintenance.interface';
import { ActiveStaff } from '../../interfaces/rh-staff.interface';
import { AuthService } from '../../services/auth-services';
import { MaintenanceServices } from '../../services/maintenance-services';
import { RhStaffServices } from '../../services/rh-staff-services';

@Component({
  selector: 'app-maintenance-warehouse',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './maintenance-warehouse.html',
  styleUrl: './maintenance-warehouse.scss',
})
export class MaintenanceWarehouse implements OnInit {
  private maintenanceService = inject(MaintenanceServices);
  private rhStaffService = inject(RhStaffServices);
  private authService = inject(AuthService);
  private toastr = inject(ToastrService);

  readonly statuses: MaintenanceStatus[] = ['PENDIENTE', 'EN_PROCESO', 'COMPLETADO', 'CANCELADO'];

  // ============================================================
  //  LISTADO DE SOLICITUDES
  // ============================================================

  filters: { status: string; machineCode: string; area: string } = {
    status: '',
    machineCode: '',
    area: '',
  };

  orders: MaintenanceRequest[] = [];
  isLoading = false;

  ngOnInit(): void {
    this.search();
    this.loadStaff();
  }

  search(): void {
    const filters: MaintenanceListFilters = {};
    if (this.filters.status) filters.status = this.filters.status as MaintenanceStatus;
    if (this.filters.machineCode.trim()) filters.machineCode = this.filters.machineCode.trim();
    if (this.filters.area.trim()) filters.area = this.filters.area.trim();

    this.isLoading = true;
    this.maintenanceService.listMaintenance(filters).subscribe({
      next: (res) => {
        this.orders = res?.ok && res.data ? res.data : [];
      },
      error: (err: Error) => {
        this.orders = [];
        this.toastr.error(err.message || 'No se pudieron cargar las solicitudes.', 'Error');
      },
      complete: () => (this.isLoading = false),
    });
  }

  clearFilters(): void {
    this.filters = { status: '', machineCode: '', area: '' };
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

  /** Nombre(s) asignado(s) a mostrar en la tabla: usa `assignees` y cae a `assignedTo` (legado). */
  assignedDisplay(order: MaintenanceRequest): string {
    if (order.assignees?.length) return order.assignees.map((a) => a.fullName).join(', ');
    return order.assignedTo || '—';
  }

  deliveriesCount(order: MaintenanceRequest): number {
    return order.warehouseDeliveries?.length || 0;
  }

  // ============================================================
  //  MODAL: HISTORIAL + REGISTRAR NUEVA ENTREGA
  // ============================================================

  showDeliveryModal = false;
  selectedOrder: MaintenanceRequest | null = null;
  isSaving = false;

  // Renglones (repuestos/materiales) de la entrega que se está armando.
  deliveryItems: SparePart[] = [];
  newItem: { code: string; description: string; quantity: number } = this.buildEmptyItem();

  // Quién recibe (buscador predictivo sobre el personal activo de RH).
  staff: ActiveStaff[] = [];
  receivedBySearchTerm = '';
  selectedReceivedBy: PersonRef | null = null;
  predictiveStaffList: ActiveStaff[] = [];
  showStaffDropdown = false;
  private isSelectingStaff = false;

  deliveredAt = '';
  notes = '';

  private loadStaff(): void {
    this.rhStaffService.getActiveStaff().subscribe({
      next: (res) => (this.staff = res?.ok && res.data ? res.data : []),
      error: (err) => console.error('Error cargando personal activo:', err),
    });
  }

  /** Persona logueada, que queda registrada como quien entrega (no editable: control de acceso). */
  get currentDeliverer(): PersonRef {
    const user = this.authService.userData();
    return {
      document: user?.uid || user?.userApp || '',
      fullName: user?.full_name || '',
    };
  }

  openDeliveryModal(order: MaintenanceRequest): void {
    this.selectedOrder = order;
    this.resetDeliveryForm();
    this.showDeliveryModal = true;
  }

  closeDeliveryModal(): void {
    if (this.isSaving) return;
    this.showDeliveryModal = false;
    this.selectedOrder = null;
  }

  private resetDeliveryForm(): void {
    this.deliveryItems = [];
    this.newItem = this.buildEmptyItem();
    this.receivedBySearchTerm = '';
    this.selectedReceivedBy = null;
    this.predictiveStaffList = [];
    this.showStaffDropdown = false;
    this.deliveredAt = this.nowForDatetimeLocal();
    this.notes = '';
  }

  private buildEmptyItem(): { code: string; description: string; quantity: number } {
    return { code: '', description: '', quantity: 1 };
  }

  // ------------------------------------------------------------
  //  Renglones de repuestos/materiales
  // ------------------------------------------------------------

  addItem(): void {
    const description = this.newItem.description.trim();
    if (!description) {
      this.toastr.warning('Indique la descripción del repuesto/material.', 'Atención');
      return;
    }
    this.deliveryItems.push({
      code: this.newItem.code.trim(),
      description,
      quantity: this.newItem.quantity > 0 ? this.newItem.quantity : 1,
    });
    this.newItem = this.buildEmptyItem();
  }

  removeItem(index: number): void {
    this.deliveryItems.splice(index, 1);
  }

  // ------------------------------------------------------------
  //  Buscador predictivo de "quién recibe" (personal activo de RH)
  // ------------------------------------------------------------

  onReceivedBySearchChange(term: string): void {
    if (this.isSelectingStaff) return;
    const t = (term || '').toString().trim().toLowerCase();
    if (t.length < 1) {
      this.predictiveStaffList = [];
      this.showStaffDropdown = false;
      return;
    }
    this.predictiveStaffList = this.staff
      .filter(
        (s) =>
          (s.full_name || '').toLowerCase().includes(t) || (s.document || '').toLowerCase().includes(t),
      )
      .slice(0, 20);
    this.showStaffDropdown = this.predictiveStaffList.length > 0;
  }

  selectReceivedBy(person: ActiveStaff): void {
    this.isSelectingStaff = true;
    this.selectedReceivedBy = { document: person.document, fullName: person.full_name };
    this.receivedBySearchTerm = person.full_name;
    this.predictiveStaffList = [];
    this.showStaffDropdown = false;
    setTimeout(() => (this.isSelectingStaff = false), 300);
  }

  clearReceivedBy(): void {
    this.selectedReceivedBy = null;
    this.receivedBySearchTerm = '';
  }

  onStaffBlur(): void {
    setTimeout(() => (this.showStaffDropdown = false), 120);
  }

  onStaffFocus(): void {
    if (this.isSelectingStaff) return;
    if (this.predictiveStaffList.length > 0) this.showStaffDropdown = true;
  }

  // ------------------------------------------------------------
  //  Registrar la entrega
  // ------------------------------------------------------------

  submitDelivery(): void {
    if (!this.selectedOrder) return;
    if (this.deliveryItems.length === 0) {
      this.toastr.warning('Agregue al menos un repuesto/material a la entrega.', 'Atención');
      return;
    }
    if (!this.selectedReceivedBy) {
      this.toastr.warning('Indique quién recibe la entrega.', 'Atención');
      return;
    }

    const payload: AddWarehouseDeliveryRequest = {
      items: this.deliveryItems,
      deliveredBy: this.currentDeliverer,
      receivedBy: this.selectedReceivedBy,
      deliveredAt: this.deliveredAt ? this.toBackendDateTime(this.deliveredAt) : '',
      notes: this.notes.trim(),
    };

    this.isSaving = true;
    this.maintenanceService.addWarehouseDelivery(this.selectedOrder.id, payload).subscribe({
      next: (res) => {
        if (!res?.ok) {
          this.toastr.error(res?.msg || 'No se pudo registrar la entrega.', 'Error');
          return;
        }
        this.toastr.success('Entrega registrada.', 'Almacén de Mantenimiento');
        this.selectedOrder = res.data;
        this.replaceInList(res.data);
        // Deja el modal abierto mostrando el historial actualizado; solo se limpia el
        // formulario de "nueva entrega" para poder registrar otra a continuación.
        this.deliveryItems = [];
        this.newItem = this.buildEmptyItem();
        this.receivedBySearchTerm = '';
        this.selectedReceivedBy = null;
        this.deliveredAt = this.nowForDatetimeLocal();
        this.notes = '';
      },
      error: (err: Error) => this.toastr.error(err.message || 'Error al registrar la entrega.', 'Error'),
      complete: () => (this.isSaving = false),
    });
  }

  private replaceInList(updated: MaintenanceRequest): void {
    const idx = this.orders.findIndex((o) => o.id === updated.id);
    if (idx >= 0) this.orders[idx] = updated;
  }

  // ============================================================
  //  HELPERS DE FECHA
  // ============================================================

  /** yyyy-MM-ddTHH:mm (para el input datetime-local), con la hora actual. */
  private nowForDatetimeLocal(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }

  /** Convierte un datetime-local (yyyy-MM-ddTHH:mm) a 'dd/MM/yyyy, HH:mm:ss'. */
  private toBackendDateTime(value: string): string {
    const [datePart, timePart] = value.split('T');
    const [year, month, day] = datePart.split('-');
    const time = timePart ? `${timePart}:00`.slice(0, 8) : '00:00:00';
    return `${day}/${month}/${year}, ${time}`;
  }
}
