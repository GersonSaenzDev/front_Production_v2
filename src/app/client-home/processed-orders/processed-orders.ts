// app/client-home/processed-orders/processed-orders.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { OrderTracking } from '../../interfaces/order-tracking.interface';

// Servicios
import { ToastrService } from 'ngx-toastr';
import { OrderTrackingService } from '../../services/order-tracking-service';

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

  public quickNote: string = '';
  public isSaving: boolean = false;

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

  /**
   * @description Guarda una observación rápida desde el Expediente Final
   * Reutiliza el servicio postOrderUpdate enviando solo la nueva nota.
   */
  saveQuickNote() {
    const order = this.selectedOrder;
    
    if (!order || !order._id) {
      this.toastr.error('No se ha podido identificar la orden', 'Error');
      return;
    }

    // Validación de longitud mínima para asegurar calidad en la información
    if (this.quickNote.trim().length < 10) {
      this.toastr.warning('La nota debe tener al menos 10 caracteres', 'Nota muy corta');
      return;
    }

    this.isSaving = true;

    // Construimos el payload optimizado
    const payload: any = {
        id: order._id,
        deliveryStatus: order.deliveryStatus, // Mantenemos el que ya tiene
        userUpdated: 'GESTION_EXPEDIENTE',    // Identificador de la acción
        processControlObservations: [
            {
                note: this.quickNote.toUpperCase(),
                userUpdated: 'USUARIO_SISTEMA', // Aquí puedes vincular el usuario logueado
                dateUpdated: '' // El backend genera la fecha CO
            }
        ]
    };

    this.orderService.postOrderUpdate(payload).subscribe({
        next: (res) => {
            this.toastr.success('Observación guardada en el expediente', 'Éxito');
            this.quickNote = ''; // Limpiamos el campo
            this.isSaving = false;
            this.loadOrders();   // Refrescamos los datos globales
            this.closeDetails(); // Cerramos el modal de detalles
        },
        error: (err) => {
            this.isSaving = false;
            this.toastr.error(err.message || 'Error al actualizar el expediente', 'Fallo');
        }
    });
  }

  /**
   * @description Obtiene las órdenes desde el Backend usando la interfaz OrderTrackingResponse
   */
  loadOrders() {
    this.orderService.getViewOrderTracking().subscribe({
      next: (res) => {
        // Cambiamos 'results' por 'data' que es el nombre real en tu interfaz
        this.orders = res.data || []; 
        
        this.filteredOrders = [...this.orders];
        this.updatePagination();
        
        // Usamos res.count que también está definido en tu interfaz
        if (this.orders.length > 0) {
          this.toastr.success(`Se cargaron ${res.count} registros`, 'Datos Actualizados');
        } else {
          this.toastr.info('No se encontraron registros para mostrar.', 'Información');
        }
      },
      error: (err) => {
        // Manejo de error usando el mensaje que viene del servicio
        this.toastr.error(err.message || 'Error al conectar con el servidor', 'Fallo de Red');
        console.error('Error en loadOrders:', err);
      }
    });
  }
}