// app/client-home/order-control/order-control.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { DeliveryStatus, FlowData, OrderTracking, OrderUpdatePayload } from '../../interfaces/order-tracking.interface';

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
    { value: 'EN_RUTA', label: 'En Ruta al Cliente', color: '#facc15', icon: '🟡' },
    { value: 'NOVEDAD', label: 'Novedad', color: '#fb923c', icon: '🟠' },
    { value: 'CANCELADO', label: 'Cancelado (Confirmar Correo)', color: '#ef4444', icon: '🔴' },
    { value: 'PRODUCTO_AGOTADO', label: 'Producto Agotado', color: '#06b6d4', icon: '🔵' },
    { value: 'PENDIENTE_ENTREGA', label: 'Pendiente de Entrega (Otras razones)', color: '#8b5cf6', icon: '🟣' },
    { value: 'ENTREGADO_CLIENTE', label: 'Entregado (Incump. Cliente)', color: '#ec4899', icon: '🌸' },
    { value: 'ENTREGADO_TIENDA', label: 'Entregado (Incump. Tienda)', color: '#f43f5e', icon: '🏮' },
    { value: 'ENTREGADO_TRANSPORTADOR', label: 'Entregado (Incump. Transportador)', color: '#d97706', icon: '📦' },
    { value: 'ENTREGADO_RUTA', label: 'Entregado (Incump. Frecuencia Ruta)', color: '#a855f7', icon: '🛤️' },
    { value: 'ENTREGADO_INVENTARIO', label: 'Entregado (Incump. Producto Agotado)', color: '#4b5563', icon: '🌑' },
    { value: 'DESPACHADO_AGOTADO', label: 'Despachado (Trans. Producto Agotado)', color: '#4b5563', icon: '🌑' },
    { value: 'ENTREGADO_SECCIONAL', label: 'Despachado desde Seccional', color: '#65a30d', icon: '🌿' },
    { value: 'DESPACHO_OPORTUNO', label: 'Despacho en Tiempos', color: '#0d9488', icon: '✨' },
    { value: 'AVERIA_TRANSPORTADOR', label: 'Producto Averiado por Transportadora', color: '#6b7280', icon: '⚠️' }
  ];

  public readonly INDUSEL_REQUIRED_STATUSES = [
  'ENTREGADO', 'CANCELADO', 'ENTREGADO_CLIENTE', 
  'ENTREGADO_TIENDA', 'ENTREGADO_TRANSPORTADOR', 
  'ENTREGADO_RUTA', 'ENTREGADO_INVENTARIO', 'AVERIA_TRANSPORTADOR'
];

  // --- Control de Modales ---
  showDetailsModal: boolean = false;
  showFlowModal: boolean = false;
  selectedOrder: OrderTracking | null = null;
  flowData: FlowData = {
    status: '',
    deliveryStatus: '',
    userUpdated: '',
    induselOrder: '',
    transporter: '',
    vehiclePlate: '',
    guideNumber: '',
    deliveredSerial: '',
    note: '',
    shippingCost: '',      
    warehouseExitDate: '', 
    processNote: '',       
    dispatchNote: '',    // Inicializado
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
    // Si la búsqueda está vacía, restauramos todos los pedidos
    if (!this.searchQuery.trim()) {
      this.filteredOrders = [...this.orders];
    } else {
      const query = this.searchQuery.toLowerCase().trim();

      this.filteredOrders = this.orders.filter(o => {
        // Campos de texto directo
        const name = (o.clientName || '').toLowerCase();
        const store = (o.store || '').toLowerCase();
        const city = (o.city || '').toLowerCase();
        const address = (o.address || '').toLowerCase();
        const oc = (o.storePurchaseOrder || '').toLowerCase();
        const eo = (o.deliveryStatus || '').toLowerCase();
        
        // Campos que suelen ser números o identificadores (convertidos a string)
        const id = (o.clientIdentification || '').toString().toLowerCase();
        const ean = (o.ean || '').toString().toLowerCase();
        const phones = (o.phones || '').toString().toLowerCase();

        // Retorna verdadero si la query coincide con CUALQUIERA de estos campos
        return name.includes(query) ||
               store.includes(query) ||
               city.includes(query) ||
               address.includes(query) ||
               oc.includes(query) ||
               eo.includes(query) ||
               id.includes(query) ||
               ean.includes(query) ||
               phones.includes(query);
      });
    }

    // Reiniciamos a la página 1 y actualizamos la vista
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
   * @description Procesa la actualización del flujo.
   * Se ha corregido el error de argumentos: ahora solo enviamos el objeto 'payload'.
   */
  saveOrderFlow() {
    const order = this.selectedOrder;
    // Validación de seguridad para evitar errores de undefined
    if (!order || !order._id) {
      this.toastr.error('No se ha podido identificar la orden', 'Error');
      return;
    }

    // Construimos el payload exacto que pide la interfaz OrderUpdatePayload
    const payload: OrderUpdatePayload = {
        id: order._id, // El ID va DENTRO del objeto
        deliveryStatus: this.flowData.status,
        userUpdated: this.flowData.userUpdated,
        induselOrder: this.flowData.induselOrder,
        address: order.address || '', 
        newTransporter: this.flowData.transporter.toUpperCase(),
        newVehiclePlate: this.flowData.vehiclePlate,
        newGuideNumber: this.flowData.guideNumber,
        newShippingCost: this.flowData.shippingCost,
        newWarehouseExitDate: this.flowData.warehouseExitDate,
        // Manejo de seriales
        deliveredSerial: this.flowData.deliveredSerial 
            ? this.flowData.deliveredSerial.split(',').map(s => s.trim()).filter(s => s !== '')
            : [],
        // Observaciones mapeadas al formato del Schema
        processControlObservations: [
            {
                note: this.flowData.processNote || '',
                userUpdated: this.flowData.userUpdated,
                dateUpdated: '' // El backend asigna la fecha
            }
        ],
        dispatchOfObservations: [
            {
                note: this.flowData.dispatchNote || '',
                userUpdated: this.flowData.userUpdated,
                dateUpdated: ''
            }
        ]
    };

    // LLAMADA CORRECTA: Solo un argumento (payload)
    this.orderService.postOrderUpdate(payload).subscribe({
        next: (res) => {
            this.toastr.success(res.msg || 'Registro actualizado', 'Éxito');
            this.loadOrders(); // Recarga la tabla
            this.closeFlow();
        },
        error: (err) => {
            this.toastr.error(err.message || 'Error al actualizar', 'Fallo');
        }
    });
  }

  openDetails(order: OrderTracking) { this.selectedOrder = order; this.showDetailsModal = true; }
  closeDetails() { this.showDetailsModal = false; this.selectedOrder = null; }
  // --- Dentro de la clase OrderControl ---

  /** * @description Prepara el modal de flujo con los datos de la orden seleccionada 
   */
  openFlow(order: OrderTracking) { 
    this.selectedOrder = order; 
    this.resetFlowForm(); 
    this.showFlowModal = true; 
  }
  closeFlow() { this.showFlowModal = false; this.resetFlowForm(); }
  resetFlowForm() {
    this.flowData = { 
      status: '', deliveryStatus: '',userUpdated: '', transporter: '', vehiclePlate: '', 
      guideNumber: '', deliveredSerial: '', note: '', 
      shippingCost: '', warehouseExitDate: '', processNote: '', dispatchNote: '' 
    };
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

  // Función auxiliar para verificar la condición en el HTML
  isInduselRequired(): boolean {
    return this.INDUSEL_REQUIRED_STATUSES.includes(this.flowData.status);
  }

  
}