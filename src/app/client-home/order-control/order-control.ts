// app/client-home/order-control/order-control.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { OrderTracking } from '../../interfaces/order-tracking.interface';

// Servicios
import { ToastrService } from 'ngx-toastr';
import { OrderTrackingService } from 'src/app/services/order-tracking-service';

@Component({
  selector: 'app-order-control',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './order-control.html',
  styleUrl: './order-control.scss'
})
export class OrderControl implements OnInit {
  // 1. Inyección de servicios
  private readonly orderService = inject(OrderTrackingService);
  private readonly toastr = inject(ToastrService);

  // --- Estado de la UI ---
  selectedClient: string = '';
  selectedFileName: string | null = null;
  public selectedFile: File | null = null;
  searchQuery: string = '';
  
  // --- Paginación y Datos ---
  currentPage: number = 1;
  pageSize: number = 50;
  pageSizeOptions: number[] = [10, 25, 50, 100];

  /** * @description Rango de fechas dinámico (Día Actual)
   * Usamos toISOString().split('T')[0] para obtener "2026-02-14"
   */
  todayStr = new Date().toISOString().split('T')[0];
  dateRange = { start: this.todayStr, end: this.todayStr };
  
  paginatedOrders: OrderTracking[] = [];
  orders: OrderTracking[] = [];
  filteredOrders: OrderTracking[] = [];
  clients = ['Sao', 'Easy', 'Exito', 'Cencosud', 'Falabella', 'Soelco', 'ElectroJaponesa', 'Trazacencosud' ];

  // --- Control de Modales ---
  showDetailsModal: boolean = false;
  showFlowModal: boolean = false;
  selectedOrder: OrderTracking | null = null;
  flowData = { etapa: '', observaciones: '', operario: '' };

  ngOnInit() {
    this.loadOrders();
    this.updatePagination();
  }

  // --- Getters para la Plantilla (Solución a los errores) ---

  /** @description Calcula el número del primer registro visible */
  get startEntry(): number {
    return (this.currentPage - 1) * this.pageSize + 1;
  }

  /** @description Calcula el número del último registro visible */
  get endEntry(): number {
    return Math.min(this.currentPage * this.pageSize, this.filteredOrders.length);
  }

  /** @description Retorna el total de páginas */
  get totalPages(): number {
    return Math.ceil(this.filteredOrders.length / this.pageSize);
  }

  // --- Métodos de Control ---

  /** @description Ejecuta el cambio cuando el usuario varía el tamaño de página */
  changePageSize() {
    this.currentPage = 1;
    this.updatePagination();
  }

  changePage(newPage: number) {
    if (newPage < 1 || newPage > this.totalPages) return;
    this.currentPage = newPage;
    this.updatePagination();
  }

  updatePagination() {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.paginatedOrders = this.filteredOrders.slice(startIndex, endIndex);
  }

  // --- Lógica de Carga de Archivos ---

  onFileSelected(event: any) {
    const file: File = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      this.selectedFileName = file.name;
    }
  }

  uploadOrder() {
    const validation = this.orderService.validateUpload(this.selectedFile, this.selectedClient);
    
    if (!validation.valid) {
      this.toastr.warning(validation.error, 'Atención');
      return;
    }

    // Usamos los parámetros individuales para que el service arme el FormData
    this.orderService.uploadOrderFile(this.selectedFile!, this.selectedClient).subscribe({
      next: (res) => {
        this.toastr.success(res.msg || 'Archivo procesado correctamente', 'Éxito');
        this.resetUpload();
      },
      error: (err) => {
        this.toastr.error(err.message || 'Error en la carga', 'Fallo');
      }
    });
  }

  resetUpload() {
    this.selectedFileName = null;
    this.selectedFile = null;
    this.selectedClient = '';
  }

  // --- Métodos de búsqueda y modales ---

  onSearch() {
    this.filteredOrders = this.orders.filter(o => 
      o.storePurchaseOrder.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
      o.clientName.toLowerCase().includes(this.searchQuery.toLowerCase())
    );
    this.currentPage = 1;
    this.updatePagination();
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

  /**
   * @description Guarda la información del flujo/etapa de la orden.
   * Por ahora maneja la lógica local y notifica al usuario.
   */
  saveFlow() {
    if (!this.selectedOrder) return;

    // Log para depuración (según tu requerimiento de mantener mocks)
    console.log('Guardando flujo para:', {
      ordenIndusel: this.selectedOrder.induselOrder,
      datos: this.flowData
    });

    // Notificación de éxito con Toastr
    this.toastr.success(
      `Flujo actualizado para la orden ${this.selectedOrder.induselOrder}`, 
      'Proceso Guardado'
    );

    // Cerramos el modal y limpiamos el formulario
    this.closeFlow();
  }

  openDetails(order: OrderTracking) { this.selectedOrder = order; this.showDetailsModal = true; }
  closeDetails() { this.showDetailsModal = false; this.selectedOrder = null; }
  openFlow(order: OrderTracking) { this.selectedOrder = order; this.showFlowModal = true; }
  closeFlow() { this.showFlowModal = false; this.resetFlowForm(); }
  resetFlowForm() { this.flowData = { etapa: '', observaciones: '', operario: '' }; }
}