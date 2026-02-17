import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { OrderTracking } from '../../interfaces/order-tracking.interface';

// Servicios
import { ToastrService } from 'ngx-toastr';
import { OrderTrackingService } from 'src/app/services/order-tracking-service';

@Component({
  selector: 'app-processed-orders',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './processed-orders.html',
  styleUrl: './processed-orders.scss'
})
export class ProcessedOrders implements OnInit {
  
  private readonly orderService = inject(OrderTrackingService);
  private readonly toastr = inject(ToastrService);

  // --- Estado de la UI ---
  searchQuery: string = '';
  showDetailsModal: boolean = false;
  selectedOrder: OrderTracking | null = null;

  // --- Paginación y Datos ---
  currentPage: number = 1;
  pageSize: number = 25;
  pageSizeOptions: number[] = [10, 25, 50, 100];

  todayStr = new Date().toISOString().split('T')[0];
  dateRange = { start: this.todayStr, end: this.todayStr };

  orders: OrderTracking[] = [];
  filteredOrders: OrderTracking[] = [];
  paginatedOrders: OrderTracking[] = [];

  ngOnInit() {
    this.loadProcessedOrders();
  }

  /**
   * @description Carga las órdenes procesadas desde el backend
   */
  loadProcessedOrders() {
    this.orderService.getProcessedTrackings().subscribe({
      next: (res) => {
        this.orders = res.data || [];
        this.filteredOrders = [...this.orders];
        this.updatePagination();
        
        if (this.orders.length > 0) {
          this.toastr.success(`Se recuperaron ${res.count} registros procesados`, 'Auditoría');
        }
      },
      error: (err) => {
        this.toastr.error(err.message, 'Error de Carga');
      }
    });
  }

  /**
   * @description Búsqueda inteligente en múltiples campos
   */
  onSearch() {
    if (!this.searchQuery.trim()) {
      this.filteredOrders = [...this.orders];
    } else {
      const query = this.searchQuery.toLowerCase().trim();
      this.filteredOrders = this.orders.filter(o => {
        return (
          o.clientName?.toLowerCase().includes(query) ||
          o.storePurchaseOrder?.toLowerCase().includes(query) ||
          o.city?.toLowerCase().includes(query) ||
          o.deliveryStatus?.toLowerCase().includes(query) ||
          o.clientIdentification?.toString().toLowerCase().includes(query) ||
          o.ean?.toString().toLowerCase().includes(query) ||

          // Búsqueda segura en el array de guías
          (o.guideNumber && o.guideNumber.some(g => g.toLowerCase().includes(query)))
        );
      });
    }
    this.currentPage = 1;
    this.updatePagination();
  }

  // --- Lógica de Paginación ---
  updatePagination() {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.paginatedOrders = this.filteredOrders.slice(startIndex, endIndex);
  }

  changePage(newPage: number) {
    if (newPage < 1 || newPage > this.totalPages) return;
    this.currentPage = newPage;
    this.updatePagination();
  }

  changePageSize() {
    this.currentPage = 1;
    this.updatePagination();
  }

  get totalPages(): number {
    return Math.ceil(this.filteredOrders.length / this.pageSize);
  }

  get startEntry(): number {
    return (this.currentPage - 1) * this.pageSize + 1;
  }

  get endEntry(): number {
    return Math.min(this.currentPage * this.pageSize, this.filteredOrders.length);
  }

  // --- Modales ---
  openDetails(order: OrderTracking) {
    this.selectedOrder = order;
    this.showDetailsModal = true;
  }

  closeDetails() {
    this.showDetailsModal = false;
    this.selectedOrder = null;
  }

  /**
   * @description Suma los costos de envío acumulados en el array
   */
  getTotalShippingCost(costs: string[] | undefined): number {
    if (!costs) return 0;
    return costs.reduce((acc, curr) => acc + (parseFloat(curr) || 0), 0);
  }
}