// src/app/warehouse/inventory-report/inventory-report.ts
import { Component, OnInit, TemplateRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbModal, NgbModalModule } from '@ng-bootstrap/ng-bootstrap';
import { DashboardServices } from '../../services/dashboard-services';
import { InventoryGroup } from '../../interfaces/dashInventory.interface';
import * as XLSX from 'xlsx';

// Interfaz extendida para controlar el despliegue
interface VisualInventoryGroup extends InventoryGroup {
  isExpanded?: boolean;
}

// Columna de día para la tabla pivote de productividad
interface StaffDayColumn {
  key: string;     // 'YYYY-MM-DD', usado para ordenar
  display: string; // 'DD/MM', usado para mostrar
}

// Fila por operario en la tabla pivote de productividad
interface StaffOperatorSummary {
  fullName: string;
  document: string;
  totalCount: number;
  activeDays: number;
  avgPerActiveDay: number;
  participation: number; // %
  dayValues: number[]; // alineado con staffDays
}

@Component({
  selector: 'app-inventory-report',
  standalone: true,
  imports: [CommonModule, FormsModule, NgbModalModule],
  templateUrl: './inventory-report.html',
  styleUrl: './inventory-report.scss'
})
export class InventoryReport implements OnInit {
  private dashboardService = inject(DashboardServices);
  private modalService = inject(NgbModal);

  @ViewChild('staffModal') staffModalTpl!: TemplateRef<unknown>;

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

  // Productividad por operario (modal)
  public staffDays: StaffDayColumn[] = [];
  public staffDayTotals: number[] = [];
  public staffSummary: StaffOperatorSummary[] = [];
  public staffGrandTotal: number = 0;
  public topOperator: StaffOperatorSummary | null = null;
  public bestDay: StaffDayColumn | null = null;
  public bestDayTotal: number = 0;

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

  // --- Productividad por operario ---

  // `fechaCaptura` llega como 'DD/MM/YYYY, HH:mm:ss' (dateCreate de inventoryControls)
  private parseDayKey(fechaCaptura: string): StaffDayColumn | null {
    if (!fechaCaptura) return null;
    const datePart = fechaCaptura.split(',')[0].trim();
    const [day, month, year] = datePart.split('/');
    if (!day || !month || !year) return null;
    return {
      key: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
      display: `${day}/${month}`
    };
  }

  private buildStaffReport(): void {
    const operators = new Map<string, { fullName: string; document: string; total: number; byDay: Map<string, number> }>();
    const dayTotals = new Map<string, number>();
    const dayDisplays = new Map<string, string>();
    let grandTotal = 0;

    for (const group of this.groupedData) {
      for (const item of group.items) {
        const op = item.operario;
        const dayInfo = this.parseDayKey(item.fechaCaptura);
        if (!op?.fullName || !dayInfo) continue;

        const opKey = op.document || op.fullName;
        if (!operators.has(opKey)) {
          operators.set(opKey, { fullName: op.fullName, document: op.document, total: 0, byDay: new Map() });
        }
        const opData = operators.get(opKey)!;
        opData.total++;
        opData.byDay.set(dayInfo.key, (opData.byDay.get(dayInfo.key) || 0) + 1);

        dayTotals.set(dayInfo.key, (dayTotals.get(dayInfo.key) || 0) + 1);
        dayDisplays.set(dayInfo.key, dayInfo.display);
        grandTotal++;
      }
    }

    const sortedDayKeys = Array.from(dayTotals.keys()).sort();
    this.staffDays = sortedDayKeys.map(key => ({ key, display: dayDisplays.get(key)! }));
    this.staffDayTotals = sortedDayKeys.map(key => dayTotals.get(key) || 0);
    this.staffGrandTotal = grandTotal;

    this.staffSummary = Array.from(operators.values())
      .map(op => {
        const activeDays = op.byDay.size;
        return {
          fullName: op.fullName,
          document: op.document,
          totalCount: op.total,
          activeDays,
          avgPerActiveDay: activeDays ? op.total / activeDays : 0,
          participation: grandTotal ? (op.total / grandTotal) * 100 : 0,
          dayValues: sortedDayKeys.map(key => op.byDay.get(key) || 0)
        };
      })
      .sort((a, b) => b.totalCount - a.totalCount);

    this.topOperator = this.staffSummary[0] || null;

    let bestDayIdx = -1;
    let bestDayTotal = 0;
    this.staffDayTotals.forEach((total, idx) => {
      if (total > bestDayTotal) {
        bestDayTotal = total;
        bestDayIdx = idx;
      }
    });
    this.bestDay = bestDayIdx >= 0 ? this.staffDays[bestDayIdx] : null;
    this.bestDayTotal = bestDayTotal;
  }

  public openStaffModal(): void {
    this.buildStaffReport();
    this.modalService.open(this.staffModalTpl, { size: 'xl', scrollable: true, centered: true });
  }
}