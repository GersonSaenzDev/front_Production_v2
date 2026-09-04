// src/app/warehouse/inventory-report/inventory-report.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DashboardServices } from '../../services/dashboard-services';
import { InventoryGroup } from '../../interfaces/dashInventory.interface';
import * as XLSX from 'xlsx';

// Interfaz extendida para controlar el despliegue
interface VisualInventoryGroup extends InventoryGroup {
  isExpanded?: boolean;
}

@Component({
  selector: 'app-inventory-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './inventory-report.html',
  styleUrl: './inventory-report.scss'
})
export class InventoryReport implements OnInit {
  private dashboardService = inject(DashboardServices);

  // Rango por defecto: mes actual (día 1 -> hoy).
  public dateIni: string = this.formatDate(this.firstDayOfCurrentMonth());
  public dateEnd: string = this.formatDate(new Date());
  public searchTerm: string = '';
  public isLoading: boolean = false;

  public groupedData: VisualInventoryGroup[] = [];
  public filteredGroups: VisualInventoryGroup[] = [];

  // Totales generales
  public totalRefs: number = 0;
  public totalItems: number = 0;

  ngOnInit(): void {
    this.loadReport();
  }

  private firstDayOfCurrentMonth(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  private formatDate(date: Date): string {
    const d = new Date(date);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    const year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;

    return [year, month, day].join('-');
  }

  public loadReport(): void {
    this.isLoading = true;
    this.dashboardService.getFinalInventoryReport(
      this.formatDateForBackend(this.dateIni), 
      this.formatDateForBackend(this.dateEnd)
    ).subscribe({
      next: (res) => {
        // res.data viene del backend según tu dashboard-services.ts
        this.groupedData = (res.data || []).map(group => ({ 
          ...group, 
          isExpanded: false 
        }));
        this.totalRefs = res.totalGrupos || this.groupedData.length;
        this.calculateGlobalTotals(this.groupedData);
        this.applyFilter();
      },
      error: (err) => {
        console.error('Error cargando inventario', err);
        this.isLoading = false;
      },
      complete: () => this.isLoading = false
    });
  }

  private calculateGlobalTotals(data: InventoryGroup[]): void {
    this.totalItems = data.reduce((acc, curr) => acc + curr.conteoTotal, 0);
  }

  public toggleGroup(group: VisualInventoryGroup): void {
    group.isExpanded = !group.isExpanded;
  }

  public applyFilter(): void {
    const term = this.searchTerm.toLowerCase().trim();
    if (!term) {
      this.filteredGroups = [...this.groupedData];
      return;
    }

    this.filteredGroups = this.groupedData.filter(group => 
      group.referencia.toLowerCase().includes(term) || 
      group.producto.toLowerCase().includes(term) ||
      group.items.some(item => item.barcode.includes(term))
    );
  }

  public exportToExcel(): void {
    // Para el Excel, aplanamos los datos para que el usuario pueda usar filtros nativos de Excel fácilmente
    const flatList = this.groupedData.flatMap(group =>
      group.items.map(item => ({
        Referencia: group.referencia,
        Producto: group.producto,
        Barcode: item.barcode,
        Consecutivo: item.consecutive,
        Fecha: item.fechaCaptura,
        Estado: item.estado,
        Novedades: item.novedades,
        Área: item.area || '',
        Operario: item.operario?.fullName || '',
        Documento: item.operario?.document || ''
      }))
    );

    const ws = XLSX.utils.json_to_sheet(flatList);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte Detallado');
    XLSX.writeFile(wb, `Inventario_${this.dateIni}_al_${this.dateEnd}.xlsx`);
  }

  private formatDateForBackend(dateStr: string): string {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  }
}