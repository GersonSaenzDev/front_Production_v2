// app/client-home/shipping-management/shipping-management.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OrderTrackingService } from '../../services/order-tracking-service';
import { ToastrService } from 'ngx-toastr';
import { OrderTracking } from '../../interfaces/order-tracking.interface';
import * as XLSX from 'xlsx'; // Importante para la exportación

@Component({
  selector: 'app-shipping-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './shipping-management.html',
  styleUrl: './shipping-management.scss'
})
export class ShippingManagement implements OnInit {
  // Inyección de servicios
  private readonly orderService = inject(OrderTrackingService);
  private readonly toastr = inject(ToastrService);

  // Estados
  public allOrders: OrderTracking[] = [];
  public filteredResults: OrderTracking[] = [];
  public selectedItems: OrderTracking[] = [];
  public searchQuery: string = '';

  ngOnInit() {
    this.loadInitialData();
  }

  // Carga inicial de datos
  loadInitialData() {
    this.orderService.getViewOrderTracking().subscribe({
      next: (res) => {
        this.allOrders = res.data || [];
      },
      error: () => this.toastr.error('Error al cargar órdenes base')
    });
  }

  // 1. Búsqueda inteligente
  onSearch() {
    const query = this.searchQuery.toLowerCase().trim();
    if (!query) {
      this.filteredResults = [];
      return;
    }

    this.filteredResults = this.allOrders.filter(o => 
      o.storePurchaseOrder?.toLowerCase().includes(query) ||
      o.clientName?.toLowerCase().includes(query) ||
      o.clientIdentification?.toLowerCase().includes(query) ||
      o.ean?.toLowerCase().includes(query) ||
      o.reference?.toLowerCase().includes(query) ||
      o.phones?.toLowerCase().includes(query) ||
      o.induselOrder?.toLowerCase().includes(query) ||
      o.address?.toLowerCase().includes(query) ||
      o.city?.toLowerCase().includes(query)
    ).slice(0, 15); // Limitamos resultados por rendimiento visual
  }

  // 2. Sostener ítem en la parte gráfica
  toggleSelection(order: OrderTracking) {
    const exists = this.selectedItems.find(item => item._id === order._id);
    
    if (!exists) {
      this.selectedItems.push(order);
      this.toastr.success(`Orden ${order.storePurchaseOrder} añadida`);
    } else {
      this.toastr.info('Este ítem ya está en tu lista');
    }
    // Opcional: limpiar búsqueda después de seleccionar
    this.searchQuery = '';
    this.filteredResults = [];
  }

  removeItem(index: number) {
    this.selectedItems.splice(index, 1);
  }

  // 3. Descarga de Excel
  exportToExcel() {
    if (this.selectedItems.length === 0) {
      this.toastr.warning('No hay ítems seleccionados para exportar');
      return;
    }

    const dataToExport = this.selectedItems.map(item => ({
      'ID': item._id,
      'ORDEN_TIENDA': item.storePurchaseOrder,
      'CLIENTE': item.clientName,
      'IDENTIFICACION': item.clientIdentification,
      'TELEFONOS': item.phones,
      'DIRECCION': item.address,
      'CIUDAD': item.city,
      'PRODUCTO': item.reference,
      'EAN': item.ean,
      'ESTADO_ACTUAL': item.deliveryStatus,
      'TRANSPORTADORA': '',
      'PLACA': '',
      'GUIA': '',
      'ORDEN_INDUSEL': '',
      'ORDEN_SALIDA': '',
      'SERIAL': '',

    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Guias_Pendientes');
    
    XLSX.writeFile(workbook, `Gestion_Envios_${new Date().getTime()}.xlsx`);
    this.toastr.success('Archivo Excel generado');
  }
}
