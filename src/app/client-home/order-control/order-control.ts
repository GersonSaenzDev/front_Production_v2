// app/client-home/order-control/order-control.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { DeliveryStatus, FlowData, OrderTracking } from '../../interfaces/order-tracking.interface';

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

  // 2. Mock de Estados de Entrega (según imagen image_513b5f.png)
  public readonly DELIVERY_STATUSES: DeliveryStatus[] = [
    { value: 'ENTREGADO', label: 'Entregado Sin Novedad', color: '#10b981', icon: '🟢' },
    { value: 'EN RUTA', label: 'En Ruta al Cliente', color: '#facc15', icon: '🟡' },
    { value: 'NOVEDAD CLIENTE', label: 'Novedad Atribuida al Cliente', color: '#fb923c', icon: '🟠' },
    { value: 'CANCELADO', label: 'Cancelado (Confirmar Correo)', color: '#ef4444', icon: '🔴' },
    { value: 'INVENTARIO', label: 'Producto Agotado en Seccional', color: '#06b6d4', icon: '🔵' },
    { value: 'PENDIENTE ENTREGA', label: 'Pendiente de Entrega (Otras razones)', color: '#8b5cf6', icon: '🟣' },
    { value: 'ENTREGADO/CLIENTE', label: 'Entregado (Incump. Cliente)', color: '#ec4899', icon: '🌸' },
    { value: 'ENTREGADO/TIENDA', label: 'Entregado (Incump. Tienda)', color: '#f43f5e', icon: '🏮' },
    { value: 'ENTREGADO/TRANSPORTADOR', label: 'Entregado (Incump. Transportador)', color: '#d97706', icon: '📦' },
    { value: 'ENTREGADO/INVENTARIO', label: 'Entregado (Incump. Producto Agotado)', color: '#4b5563', icon: '🌑' },
    { value: 'ENTREGADO/SECCIONAL', label: 'Entregado a Seccional', color: '#65a30d', icon: '🌿' },
    { value: 'ENTREGADO/RUTA', label: 'Entregado (Incump. Frecuencia Ruta)', color: '#a855f7', icon: '🛤️' },
    { value: 'DESPACHO OPORTUNO', label: 'Despacho en Tiempos', color: '#0d9488', icon: '✨' },
    { value: 'AVERIA', label: 'Producto Averiado por Transportadora', color: '#6b7280', icon: '⚠️' }
  ];

  // --- Control de Modales ---
  showDetailsModal: boolean = false;
  showFlowModal: boolean = false;
  selectedOrder: OrderTracking | null = null;
  flowData: FlowData = {
    status: 'INGRESADO', // Valor por defecto
    transporter: '',
    vehiclePlate: '',
    guideNumber: '',
    deliveredSerial: '',
    userUpdated: '',
    note: ''
  };

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
  // --- Función Guardar Corregida ---
    saveFlow() {
    if (!this.selectedOrder?._id) return;

    // Preparamos el payload exacto para Mongoose
    const updatePayload = {
      status: this.flowData.status,
      userUpdated: this.flowData.userUpdated,
      dateUpdated: new Date().toLocaleString(),
      transporter: this.flowData.transporter.toUpperCase(),
      vehiclePlate: this.flowData.vehiclePlate,
      guideNumber: this.flowData.guideNumber,
      // Convertimos seriales a Array de strings
      deliveredSerial: this.flowData.deliveredSerial 
        ? this.flowData.deliveredSerial.split(',').map(s => s.trim()).filter(s => s !== '')
        : [],
      // Nueva observación para el array del Schema
      newObservation: {
        note: this.flowData.note,
        userUpdated: this.flowData.userUpdated,
        dateUpdated: new Date().toISOString()
      }
    };

    // Usamos 'orderService' sin guion bajo
    this.orderService.updateOrder(this.selectedOrder._id, updatePayload).subscribe({
      next: (resp) => {
        this.closeFlow();
        this.loadOrders(); // Recarga la tabla
        this.resetFlowForm();
      },
      error: (err) => console.error('Error al actualizar:', err)
    });
  }

  openDetails(order: OrderTracking) { this.selectedOrder = order; this.showDetailsModal = true; }
  closeDetails() { this.showDetailsModal = false; this.selectedOrder = null; }
  openFlow(order: OrderTracking) { this.selectedOrder = order; this.showFlowModal = true; }
  closeFlow() { this.showFlowModal = false; this.resetFlowForm(); }
  resetFlowForm() {
    this.flowData = { status: '', userUpdated: '', transporter: '', vehiclePlate: '', guideNumber: '', deliveredSerial: '', note: '' };
  }

  // --- Lógica para la Máscara de Placa ---
  onPlateInput(event: any) {
    // 1. Solo permitimos letras y números, convertimos a Mayúsculas
    let value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');

    // 2. Lógica de la máscara AAA-123
    if (value.length > 3) {
        // Insertamos el guion después del tercer carácter
        value = `${value.slice(0, 3)}-${value.slice(3, 6)}`;
    }

    // 3. Actualizamos el modelo (limitado a 7 caracteres incluyendo el guion)
    this.flowData.vehiclePlate = value.slice(0, 7);
  }

  // Obtener el color del estado seleccionado para el feedback visual
  getSelectedStatusColor(): string {
    const selected = this.DELIVERY_STATUSES.find(s => s.value === this.flowData.status);
    return selected ? selected.color : 'transparent';
  }
}