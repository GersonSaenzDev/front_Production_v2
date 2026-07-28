// src/app/client-home/freight-management/freight-management.ts
import { CommonModule, registerLocaleData } from '@angular/common';
import { Component, LOCALE_ID, OnInit, inject } from '@angular/core';
import localeEs from '@angular/common/locales/es';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import * as XLSX from 'xlsx';

import { CustomerHouseService } from '../../services/customer-house.service';
import { FreightDispatch, FreightDispatchRequest } from '../../interfaces/customer-house.interface';

registerLocaleData(localeEs, 'es');

interface FreightItemFormRow {
  client: string;
  destinationCity: string;
  product: string;
  quantity: number | null;
  unitValue: number | null;
  unitVolume: number | null;
}

interface FreightDispatchFormState {
  dispatchNumber: string;
  dispatchDate: string; // yyyy-MM-dd (binding de <input type="date">)
  carrier: string;
  totalFreightCost: number | null;
  items: FreightItemFormRow[];
}

@Component({
  selector: 'app-freight-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './freight-management.html',
  styleUrls: ['./freight-management.scss'],
  providers: [{ provide: LOCALE_ID, useValue: 'es' }]
})
export class FreightManagement implements OnInit {
  private readonly customerHouseService = inject(CustomerHouseService);
  private readonly toastr = inject(ToastrService);

  // ============================================================
  //  FILTRO POR RANGO DE FECHAS
  // ============================================================

  public dateIni: string = this.formatDate(new Date());
  public dateEnd: string = this.formatDate(new Date());
  public isLoading = false;
  public searchTerm = '';

  private allDispatches: FreightDispatch[] = [];
  public filteredDispatches: FreightDispatch[] = [];
  public paginatedDispatches: FreightDispatch[] = [];

  public currentPage = 1;
  public pageSize = 10;
  public totalPages = 1;

  get totalDispatches(): number {
    return this.allDispatches.length;
  }

  get totalFreightCostSum(): number {
    return this.allDispatches.reduce((acc, dispatch) => acc + (dispatch.totalFreightCost || 0), 0);
  }

  get totalVolumeSum(): number {
    return this.allDispatches.reduce((acc, dispatch) => acc + (dispatch.totalVolume || 0), 0);
  }

  ngOnInit(): void {
    this.loadDispatches();
  }

  public onDateRangeChange(): void {
    this.loadDispatches();
  }

  public loadDispatches(): void {
    if (!this.dateIni || !this.dateEnd) return;

    this.isLoading = true;
    this.customerHouseService
      .listFreightDispatch({
        dateIni: this.formatDateForBackend(this.dateIni),
        dateEnd: this.formatDateForBackend(this.dateEnd)
      })
      .subscribe({
        next: (response) => {
          this.allDispatches = response.ok ? response.data || [] : [];
          this.applyFilter();
        },
        error: (err) => {
          this.allDispatches = [];
          this.applyFilter();
          this.toastr.error(err.message || 'No se pudieron cargar los despachos de flete.');
        },
        complete: () => {
          this.isLoading = false;
        }
      });
  }

  // ============================================================
  //  BÚSQUEDA Y PAGINACIÓN
  // ============================================================

  public applyFilter(): void {
    const term = this.searchTerm.toLowerCase().trim();
    this.filteredDispatches = !term
      ? [...this.allDispatches]
      : this.allDispatches.filter((dispatch) => {
          const haystack = [
            dispatch.dispatchNumber,
            dispatch.carrier,
            ...dispatch.items.map((item) => item.client),
            ...dispatch.items.map((item) => item.destinationCity),
            ...dispatch.items.map((item) => item.product)
          ]
            .filter((value): value is string => !!value)
            .join(' ')
            .toLowerCase();
          return haystack.includes(term);
        });

    this.currentPage = 1;
    this.updatePagination();
  }

  private updatePagination(): void {
    this.totalPages = Math.ceil(this.filteredDispatches.length / this.pageSize) || 1;
    const start = (this.currentPage - 1) * this.pageSize;
    this.paginatedDispatches = this.filteredDispatches.slice(start, start + this.pageSize);
  }

  public prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updatePagination();
    }
  }

  public nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.updatePagination();
    }
  }

  // ============================================================
  //  FORMULARIO DE REGISTRO (MODAL)
  // ============================================================

  public showFormModal = false;
  public isSaving = false;
  public form: FreightDispatchFormState = this.buildEmptyForm();

  private buildEmptyForm(): FreightDispatchFormState {
    return {
      dispatchNumber: '',
      dispatchDate: this.formatDate(new Date()),
      carrier: '',
      totalFreightCost: null,
      items: [this.buildEmptyItemRow()]
    };
  }

  private buildEmptyItemRow(): FreightItemFormRow {
    return {
      client: '',
      destinationCity: '',
      product: '',
      quantity: null,
      unitValue: null,
      unitVolume: null
    };
  }

  public openFormModal(): void {
    this.form = this.buildEmptyForm();
    this.showFormModal = true;
  }

  public closeFormModal(): void {
    this.showFormModal = false;
  }

  public addItemRow(): void {
    this.form.items.push(this.buildEmptyItemRow());
  }

  public removeItemRow(index: number): void {
    if (this.form.items.length === 1) return;
    this.form.items.splice(index, 1);
  }

  public get isFormValid(): boolean {
    if (!this.form.dispatchNumber.trim() || !this.form.dispatchDate || !this.form.carrier.trim()) return false;
    if (this.form.totalFreightCost === null || this.form.totalFreightCost <= 0) return false;

    return this.form.items.every(
      (item) =>
        !!item.client.trim() &&
        !!item.destinationCity.trim() &&
        !!item.product.trim() &&
        item.quantity !== null &&
        item.quantity > 0 &&
        item.unitValue !== null &&
        item.unitValue >= 0 &&
        item.unitVolume !== null &&
        item.unitVolume >= 0
    );
  }

  public submitDispatch(): void {
    if (!this.isFormValid) {
      this.toastr.warning('Completa todos los campos requeridos antes de registrar el despacho.');
      return;
    }

    const payload: FreightDispatchRequest = {
      dispatchNumber: this.form.dispatchNumber.trim(),
      dispatchDate: this.formatDateForBackend(this.form.dispatchDate),
      carrier: this.form.carrier.trim(),
      totalFreightCost: Number(this.form.totalFreightCost),
      items: this.form.items.map((item) => ({
        client: item.client.trim(),
        destinationCity: item.destinationCity.trim(),
        product: item.product.trim(),
        quantity: Number(item.quantity),
        unitValue: Number(item.unitValue),
        unitVolume: Number(item.unitVolume)
      }))
    };

    this.isSaving = true;
    this.customerHouseService.createFreightDispatch(payload).subscribe({
      next: (response) => {
        if (response.ok) {
          this.toastr.success(response.msg || 'Despacho de flete registrado exitosamente.');
          this.closeFormModal();
          this.loadDispatches();
        } else {
          this.toastr.error(response.msg || 'No se pudo registrar el despacho.');
        }
      },
      error: (err) => {
        this.toastr.error(err.message || 'Error al registrar el despacho de flete.');
      },
      complete: () => {
        this.isSaving = false;
      }
    });
  }

  // ============================================================
  //  DETALLE (MODAL)
  // ============================================================

  public showDetailModal = false;
  public isLoadingDetail = false;
  public detailDispatch: FreightDispatch | null = null;

  public openDetail(dispatch: FreightDispatch): void {
    this.detailDispatch = dispatch;
    this.showDetailModal = true;
    this.isLoadingDetail = true;

    this.customerHouseService.getFreightDispatchDetail({ dateIni: dispatch.dispatchDate, dateEnd: dispatch.dispatchDate }).subscribe({
      next: (response) => {
        if (response.ok && response.msg) {
          this.detailDispatch = response.msg;
        }
      },
      error: () => {
        // Si falla la consulta de detalle mantenemos los datos ya cargados desde el listado.
      },
      complete: () => {
        this.isLoadingDetail = false;
      }
    });
  }

  public closeDetail(): void {
    this.showDetailModal = false;
    this.detailDispatch = null;
  }

  // ============================================================
  //  EXPORTACIÓN A EXCEL
  // ============================================================

  public exportToExcel(): void {
    if (this.allDispatches.length === 0) return;

    const dataToExport = this.allDispatches.flatMap((dispatch) =>
      dispatch.items.map((item) => ({
        DESPACHO: dispatch.dispatchNumber,
        FECHA: dispatch.dispatchDate,
        TRANSPORTADOR: dispatch.carrier,
        COSTO_FLETE_TOTAL: dispatch.totalFreightCost,
        VOLUMEN_TOTAL_DESPACHO: dispatch.totalVolume,
        CLIENTE: item.client,
        CIUDAD_DESTINO: item.destinationCity,
        PRODUCTO: item.product,
        CANTIDAD: item.quantity,
        VALOR_UNITARIO: item.unitValue,
        VOLUMEN_UNITARIO: item.unitVolume,
        VOLUMEN_ITEM: item.itemVolume,
        PORCENTAJE_VOLUMEN: item.volumePercentage,
        FLETE_ASIGNADO: item.allocatedFreightCost,
        FLETE_POR_UNIDAD: item.freightCostPerUnit,
        ESTADO: dispatch.status ? 'Activo' : 'Inactivo',
        REGISTRADO_POR: dispatch.userCreate,
        FECHA_REGISTRO: dispatch.dateCreate
      }))
    );

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Fletes');
    XLSX.writeFile(workbook, `Fletes_${this.dateIni}_al_${this.dateEnd}.xlsx`);
  }

  // ============================================================
  //  UTILIDADES DE FECHA
  // ============================================================

  private formatDate(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  public formatDateForBackend(dateString: string): string {
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
  }
}
