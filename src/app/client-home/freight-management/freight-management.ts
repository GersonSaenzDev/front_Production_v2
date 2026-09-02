// src/app/client-home/freight-management/freight-management.ts
import { CommonModule, registerLocaleData } from '@angular/common';
import { Component, LOCALE_ID, OnInit, inject } from '@angular/core';
import localeEs from '@angular/common/locales/es';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import * as XLSX from 'xlsx';

import { CustomerHouseService } from '../../services/customer-house.service';
import {
  FreightCarrier,
  FreightCostEntryInput,
  FreightDispatch,
  FreightDispatchRequest,
  FreightDispatchStatus,
  FreightInvoiceDocument
} from '../../interfaces/customer-house.interface';
import { parseInvoicePdf } from './invoice-pdf-parser';

registerLocaleData(localeEs, 'es');

interface FreightItemFormRow {
  client: string;
  destinationCity: string;
  ean: string;
  product: string;
  quantity: number | null;
  unitValue: number | null;
  volumeM3: number | null; // Volumen de la línea (m³): opcional, alimenta el cubicaje del viaje
  freightCost: number | null; // No obligatorio: puede quedar pendiente tras cargar una factura
  invoiceNumber: string;
}

/** Fila editable de costo adicional: valor + su descripción (obligatoria al guardar). */
interface AdditionalCostFormRow {
  value: number | null;
  observation: string;
}

interface FreightDispatchFormState {
  dispatchNumber: string; // Previsualizado por el backend, de solo lectura
  dispatchDate: string; // yyyy-MM-dd (binding de <input type="date">)
  warehouseExitDate: string; // Texto libre (no es una fecha)
  carrier: string; // Nombre de la transportadora (derivado del catálogo)
  carrierId: string; // _id de la transportadora elegida del catálogo
  vehicleType: string; // Tipo de vehículo del viaje (según catálogo de la transportadora)
  mainDestination: string; // Ciudad/ruta que fija la tarifa (se deriva de las ciudades de las líneas)
  ratedFreightValue: number | null; // Valor del flete que trae la tabla de tarifas (null = sin tarifa en catálogo)
  vehicleCapacityM3: number | null; // Capacidad de carga del vehículo (m³), precargada del catálogo y editable
  totalFreightCost: number | null;
  additionalCosts: AdditionalCostFormRow[];
  creationDetail: string;
  items: FreightItemFormRow[];
  invoiceFiles: File[];
  invoiceMeta: { invoiceNumber: string; totalValue: number }[];
}

const FREIGHT_STATUS_PILL_CLASS: Record<string, string> = {
  Pendiente: 'status-pending',
  Finalizado: 'status-closed',
  Parcial: 'status-partial',
  'Siniestro Parcial': 'status-claim-partial',
  'Siniestro Completo': 'status-claim-full'
};

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

  public readonly statusOptions: FreightDispatchStatus[] = ['Pendiente', 'Finalizado'];

  // ============================================================
  //  FILTRO POR RANGO DE FECHAS
  // ============================================================

  // Por defecto: del 1° del mes en curso hasta hoy.
  public dateIni: string = this.formatDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
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

  get totalAdditionalCostsSum(): number {
    return this.allDispatches.reduce((acc, dispatch) => acc + this.currentAdditionalCosts(dispatch), 0);
  }

  /** Costos adicionales del despacho: suma de todas las entradas del historial (cada una con su propia descripción). */
  public currentAdditionalCosts(dispatch: FreightDispatch): number {
    const entries = dispatch.additionalCosts || [];
    return entries.reduce((sum, entry) => sum + (entry.value || 0), 0);
  }

  public statusPillClass(status: string): string {
    return FREIGHT_STATUS_PILL_CLASS[status] || 'status-pending';
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
          this.isLoading = false;
        },
        complete: () => {
          this.isLoading = false;
        }
      });
  }

  // ============================================================
  //  BÚSQUEDA Y PAGINACIÓN
  // ============================================================

  /** Minúsculas y sin tildes/acentos, para que la búsqueda no dependa de escribirlos igual. */
  private normalizeSearchText(value: string): string {
    return value.normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').toLowerCase().trim();
  }

  /**
   * Búsqueda por múltiples términos: cada palabra escrita (en cualquier orden) debe
   * aparecer en algún campo del despacho o de sus líneas para que el despacho coincida.
   */
  public applyFilter(): void {
    const tokens = this.normalizeSearchText(this.searchTerm).split(/\s+/).filter(Boolean);

    this.filteredDispatches =
      tokens.length === 0
        ? [...this.allDispatches]
        : this.allDispatches.filter((dispatch) => {
            const haystack = this.normalizeSearchText(
              [
                dispatch.dispatchNumber,
                dispatch.dispatchDate,
                dispatch.carrier,
                dispatch.status,
                ...dispatch.items.map((item) => item.client),
                ...dispatch.items.map((item) => item.destinationCity),
                ...dispatch.items.map((item) => item.product),
                ...dispatch.items.map((item) => item.ean),
                ...dispatch.items.map((item) => item.invoiceNumber)
              ]
                .filter((value): value is string => !!value)
                .join(' ')
            );
            return tokens.every((token) => haystack.includes(token));
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
  public isLoadingDispatchNumber = false;
  public isParsingInvoices = false;
  public isLoadingCarriers = false;
  public form: FreightDispatchFormState = this.buildEmptyForm();

  /** Transportadoras activas del catálogo (con sus tarifas y capacidades por vehículo). */
  public carriers: FreightCarrier[] = [];
  /** Transportadora seleccionada en el formulario (fuente de tarifas / capacidades). */
  public selectedCarrier: FreightCarrier | null = null;

  private buildEmptyForm(): FreightDispatchFormState {
    return {
      dispatchNumber: '',
      dispatchDate: this.formatDate(new Date()),
      warehouseExitDate: '',
      carrier: '',
      carrierId: '',
      vehicleType: '',
      mainDestination: '',
      ratedFreightValue: null,
      vehicleCapacityM3: null,
      totalFreightCost: null,
      additionalCosts: [],
      creationDetail: '',
      items: [this.buildEmptyItemRow()],
      invoiceFiles: [],
      invoiceMeta: []
    };
  }

  /** Costo total del producto en la línea (cantidad × valor unitario, sin IVA). */
  public itemTotalValue(item: FreightItemFormRow): number {
    return (item.quantity || 0) * (item.unitValue || 0);
  }

  // ============================================================
  //  COSTOS ADICIONALES (lista dinámica: valor + descripción)
  // ============================================================

  public addCostEntry(list: AdditionalCostFormRow[]): void {
    list.push({ value: null, observation: '' });
  }

  public removeCostEntry(list: AdditionalCostFormRow[], index: number): void {
    list.splice(index, 1);
  }

  /** Cada costo adicional agregado debe traer valor (>= 0) y descripción no vacía. */
  private areCostEntriesValid(list: AdditionalCostFormRow[]): boolean {
    return list.every((cost) => cost.value !== null && cost.value >= 0 && !!cost.observation.trim());
  }

  private mapCostEntries(list: AdditionalCostFormRow[]): FreightCostEntryInput[] {
    return list.map((cost) => ({ value: Number(cost.value), observation: cost.observation.trim() }));
  }

  private buildEmptyItemRow(): FreightItemFormRow {
    return {
      client: '',
      destinationCity: '',
      ean: '',
      product: '',
      quantity: null,
      unitValue: null,
      volumeM3: null,
      freightCost: null,
      invoiceNumber: ''
    };
  }

  private isItemRowEmpty(row: FreightItemFormRow): boolean {
    return !row.client.trim() && !row.destinationCity.trim() && !row.ean.trim() && !row.product.trim() && !row.quantity && !row.unitValue;
  }

  public openFormModal(): void {
    this.form = this.buildEmptyForm();
    this.selectedCarrier = null;
    this.showFormModal = true;
    this.loadCarriers();

    this.isLoadingDispatchNumber = true;
    this.customerHouseService.getNextDispatchNumber().subscribe({
      next: (response) => {
        if (response.ok && response.data) {
          this.form.dispatchNumber = response.data.dispatchNumber;
        }
      },
      error: () => {
        this.toastr.warning('No se pudo previsualizar el N° de despacho. Se generará al registrar.');
      },
      complete: () => {
        this.isLoadingDispatchNumber = false;
      }
    });
  }

  /** Carga las transportadoras activas del catálogo para el selector del formulario. */
  private loadCarriers(): void {
    this.isLoadingCarriers = true;
    this.customerHouseService.listCarriers({ status: true }).subscribe({
      next: (response) => {
        this.carriers = response.ok && Array.isArray(response.data) ? response.data : [];
      },
      error: () => {
        this.carriers = [];
        this.toastr.warning('No se pudieron cargar las transportadoras. El transportador se diligencia manualmente.');
      },
      complete: () => {
        this.isLoadingCarriers = false;
      }
    });
  }

  public closeFormModal(): void {
    this.showFormModal = false;
  }

  public addItemRow(): void {
    this.form.items.push(this.buildEmptyItemRow());
    this.syncMainDestination();
  }

  public removeItemRow(index: number): void {
    if (this.form.items.length === 1) return;
    this.form.items.splice(index, 1);
    this.syncMainDestination();
  }

  // ============================================================
  //  TRANSPORTADORA · TIPO DE VEHÍCULO · TARIFA · CUBICAJE
  // ============================================================

  /** Minúsculas, sin tildes y en MAYÚSCULAS para comparar destinos con el catálogo. */
  private normalizeDestination(value: string): string {
    return (value || '').normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').trim().toUpperCase();
  }

  /** Ciudades distintas (no vacías) declaradas en las líneas del despacho. */
  public get destinationOptions(): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of this.form.items) {
      const city = (item.destinationCity || '').trim();
      const key = this.normalizeDestination(city);
      if (city && !seen.has(key)) {
        seen.add(key);
        result.push(city);
      }
    }
    return result;
  }

  /** Tipos de vehículo que la transportadora seleccionada cotiza (tarifas ∪ capacidades). */
  public get vehicleTypeOptions(): string[] {
    if (!this.selectedCarrier) return [];
    const types = new Set<string>();
    (this.selectedCarrier.rates || []).forEach((rate) => rate.vehicleType && types.add(rate.vehicleType));
    (this.selectedCarrier.vehicleCapacities || []).forEach((cap) => cap.vehicleType && types.add(cap.vehicleType));
    return [...types].sort();
  }

  /** m³ cargados: suma del volumen de todas las líneas. */
  public get loadedVolumeM3(): number {
    return this.form.items.reduce((sum, item) => sum + (Number(item.volumeM3) || 0), 0);
  }

  /** % de aprovechamiento del vehículo (null si no hay capacidad para comparar). */
  public get volumeUtilizationPct(): number | null {
    const capacity = Number(this.form.vehicleCapacityM3) || 0;
    if (capacity <= 0) return null;
    return (this.loadedVolumeM3 / capacity) * 100;
  }

  public onCarrierChange(carrierId: string): void {
    this.selectedCarrier = this.carriers.find((carrier) => carrier._id === carrierId) || null;
    this.form.carrierId = this.selectedCarrier ? this.selectedCarrier._id : '';
    this.form.carrier = this.selectedCarrier ? this.selectedCarrier.name : '';
    this.form.vehicleType = '';
    this.applyTariffAndCapacity();
  }

  /**
   * Si todas las líneas van a la misma ciudad, esa es el destino principal; si hay
   * varias, se conserva la elección del usuario mientras siga siendo una de ellas.
   * Cualquier cambio de destino recalcula la tarifa.
   */
  public syncMainDestination(): void {
    const options = this.destinationOptions;
    if (options.length === 1) {
      this.form.mainDestination = options[0];
    } else if (options.length === 0) {
      this.form.mainDestination = '';
    } else if (!options.some((city) => this.normalizeDestination(city) === this.normalizeDestination(this.form.mainDestination))) {
      this.form.mainDestination = '';
    }
    this.applyTariffAndCapacity();
  }

  /**
   * Con transportadora + tipo de vehículo + destino principal, busca la tarifa en
   * el catálogo: si existe, precarga el costo total del flete (editable) y marca
   * ratedFreightValue; si no, deja ratedFreightValue en null (bandera de "sin tarifa").
   * También precarga la capacidad (m³) del tipo de vehículo si el catálogo la tiene.
   */
  public applyTariffAndCapacity(): void {
    if (!this.selectedCarrier || !this.form.vehicleType) {
      this.form.ratedFreightValue = null;
      return;
    }

    const targetDestination = this.normalizeDestination(this.form.mainDestination);
    const rate = targetDestination
      ? (this.selectedCarrier.rates || []).find(
          (r) => r.vehicleType === this.form.vehicleType && this.normalizeDestination(r.destination) === targetDestination
        )
      : undefined;

    if (rate) {
      this.form.ratedFreightValue = rate.value;
      this.form.totalFreightCost = rate.value;
    } else {
      this.form.ratedFreightValue = null;
    }

    const capacity = (this.selectedCarrier.vehicleCapacities || []).find((cap) => cap.vehicleType === this.form.vehicleType);
    if (capacity && capacity.capacityM3 > 0) {
      this.form.vehicleCapacityM3 = capacity.capacityM3;
    }
  }

  // ============================================================
  //  CARGA DE FACTURAS PDF
  // ============================================================

  public async onInvoiceFilesSelected(fileList: FileList | null): Promise<void> {
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    this.isParsingInvoices = true;

    for (const file of files) {
      try {
        const result = await parseInvoicePdf(file);

        if (result.rows.length === 0) {
          this.toastr.warning(`No se encontraron líneas de producto en "${file.name}".`);
          continue;
        }

        if (this.form.items.length === 1 && this.isItemRowEmpty(this.form.items[0])) {
          this.form.items.splice(0, 1);
        }

        for (const row of result.rows) {
          this.form.items.push({
            client: row.client,
            destinationCity: row.destinationCity,
            ean: row.ean,
            product: row.product,
            quantity: row.quantity,
            unitValue: row.unitValue,
            volumeM3: null,
            freightCost: null,
            invoiceNumber: row.invoiceNumber
          });
        }

        this.form.invoiceFiles.push(file);
        this.form.invoiceMeta.push({ invoiceNumber: result.rows[0].invoiceNumber || '', totalValue: result.totalValue });

        result.warnings.forEach((warning) => this.toastr.warning(warning));
        this.toastr.success(`"${file.name}": ${result.rows.length} línea(s) cargada(s). Complete el Flete de cada línea.`);
      } catch {
        this.toastr.error(`No se pudo leer la factura "${file.name}". Verifique que sea un PDF válido.`);
      }
    }

    if (this.form.items.length === 0) {
      this.form.items.push(this.buildEmptyItemRow());
    }

    this.syncMainDestination();
    this.isParsingInvoices = false;
  }

  public removeInvoiceFile(index: number): void {
    this.form.invoiceFiles.splice(index, 1);
    this.form.invoiceMeta.splice(index, 1);
  }

  public get isFormValid(): boolean {
    if (!this.form.dispatchNumber.trim() || !this.form.dispatchDate || !this.form.warehouseExitDate.trim() || !this.form.carrier.trim())
      return false;
    if (this.form.totalFreightCost === null || this.form.totalFreightCost <= 0) return false;
    if (!this.areCostEntriesValid(this.form.additionalCosts)) return false;

    return this.form.items.every(
      (item) =>
        !!item.client.trim() &&
        !!item.destinationCity.trim() &&
        item.quantity !== null &&
        item.quantity > 0 &&
        item.unitValue !== null &&
        item.unitValue >= 0 &&
        (item.freightCost === null || item.freightCost >= 0)
    );
  }

  public submitDispatch(): void {
    if (!this.isFormValid) {
      this.toastr.warning(
        'Completa todos los campos requeridos antes de registrar el despacho. Si agregaste un costo adicional, indica su descripción.'
      );
      return;
    }

    const payload: FreightDispatchRequest = {
      dispatchDate: this.formatDateForBackend(this.form.dispatchDate),
      warehouseExitDate: this.form.warehouseExitDate.trim(),
      carrier: this.form.carrier.trim(),
      carrierId: this.form.carrierId || undefined,
      vehicleType: this.form.vehicleType || undefined,
      mainDestination: this.form.mainDestination.trim() || undefined,
      ratedFreightValue: this.form.ratedFreightValue !== null ? Number(this.form.ratedFreightValue) : undefined,
      vehicleCapacityM3: this.form.vehicleCapacityM3 !== null ? Number(this.form.vehicleCapacityM3) : undefined,
      totalFreightCost: Number(this.form.totalFreightCost),
      additionalCosts: this.mapCostEntries(this.form.additionalCosts),
      creationDetail: this.form.creationDetail.trim(),
      items: this.form.items.map((item) => ({
        client: item.client.trim(),
        destinationCity: item.destinationCity.trim(),
        ean: item.ean.trim(),
        product: item.product.trim(),
        quantity: Number(item.quantity),
        unitValue: Number(item.unitValue),
        totalValue: this.itemTotalValue(item),
        volumeM3: item.volumeM3 !== null ? Number(item.volumeM3) : 0,
        freightCost: item.freightCost !== null ? Number(item.freightCost) : 0,
        invoiceNumber: item.invoiceNumber.trim()
      }))
    };

    this.isSaving = true;
    this.customerHouseService.createFreightDispatch(payload, this.form.invoiceFiles, this.form.invoiceMeta).subscribe({
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
  //  DETALLE (MODAL) — visualización y actualización
  // ============================================================

  public showDetailModal = false;
  public isLoadingDetail = false;
  public isUpdatingDispatch = false;
  public detailDispatch: FreightDispatch | null = null;

  public updateForm = {
    additionalCosts: [] as AdditionalCostFormRow[],
    detail: '',
    status: '' as FreightDispatchStatus | ''
  };

  public openDetail(dispatch: FreightDispatch): void {
    this.detailDispatch = dispatch;
    this.showDetailModal = true;
    this.isLoadingDetail = true;
    this.resetUpdateForm(dispatch);

    this.customerHouseService.getFreightDispatchDetail({ dateIni: dispatch.dispatchDate, dateEnd: dispatch.dispatchDate }).subscribe({
      next: (response) => {
        if (response.ok && response.msg) {
          this.detailDispatch = response.msg;
          this.resetUpdateForm(response.msg);
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

  private resetUpdateForm(dispatch: FreightDispatch): void {
    this.updateForm = {
      additionalCosts: [], // Costos nuevos a agregar en esta actualización (no precarga los ya existentes)
      detail: '',
      status: dispatch.status
    };
  }

  public closeDetail(): void {
    this.showDetailModal = false;
    this.detailDispatch = null;
  }

  public submitDispatchUpdate(): void {
    if (!this.detailDispatch) return;

    if (!this.updateForm.detail.trim()) {
      this.toastr.warning('Debes indicar el detalle o novedad de la actualización.');
      return;
    }

    if (!this.areCostEntriesValid(this.updateForm.additionalCosts)) {
      this.toastr.warning('Cada costo adicional debe indicar un valor y su descripción.');
      return;
    }

    this.isUpdatingDispatch = true;
    this.customerHouseService
      .updateFreightDispatch(this.detailDispatch._id, {
        additionalCosts: this.updateForm.additionalCosts.length ? this.mapCostEntries(this.updateForm.additionalCosts) : undefined,
        detail: this.updateForm.detail.trim(),
        status: this.updateForm.status || undefined
      })
      .subscribe({
        next: (response) => {
          if (response.ok) {
            this.toastr.success(response.msg || 'Despacho actualizado exitosamente.');
            this.detailDispatch = response.data;
            this.resetUpdateForm(response.data);
            this.loadDispatches();
          } else {
            this.toastr.error(response.msg || 'No se pudo actualizar el despacho.');
          }
        },
        error: (err) => {
          this.toastr.error(err.message || 'Error al actualizar el despacho.');
        },
        complete: () => {
          this.isUpdatingDispatch = false;
        }
      });
  }

  public viewInvoiceDocument(doc: FreightInvoiceDocument): void {
    this.customerHouseService.downloadInvoiceDocument(doc.relativePath).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      },
      error: (err) => {
        this.toastr.error(err.message || 'No se pudo abrir la factura.');
      }
    });
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
        SALIDA_BODEGA: dispatch.warehouseExitDate,
        TRANSPORTADOR: dispatch.carrier,
        TIPO_VEHICULO: dispatch.vehicleType || '',
        DESTINO_PRINCIPAL: dispatch.mainDestination || '',
        TARIFA_CATALOGO: dispatch.ratedFreightValue ?? '',
        CAPACIDAD_M3: dispatch.vehicleCapacityM3 ?? '',
        M3_CARGADOS: dispatch.loadedVolumeM3 ?? '',
        APROVECHAMIENTO_PCT: dispatch.volumeUtilizationPct ?? '',
        COSTO_FLETE_TOTAL: dispatch.totalFreightCost,
        COSTOS_ADICIONALES: this.currentAdditionalCosts(dispatch),
        COSTOS_ADICIONALES_DETALLE: (dispatch.additionalCosts || []).map((cost) => `${cost.value} (${cost.observation})`).join(' | '),
        CLIENTE: item.client,
        CIUDAD_DESTINO: item.destinationCity,
        EAN: item.ean,
        PRODUCTO: item.product,
        CANTIDAD: item.quantity,
        VALOR_UNITARIO: item.unitValue,
        VALOR_TOTAL_PRODUCTO: item.totalValue,
        VOLUMEN_M3: item.volumeM3 ?? '',
        FLETE_LINEA: item.freightCost,
        FLETE_POR_UNIDAD: item.freightCostPerUnit,
        FACTURA_ORIGEN: item.invoiceNumber,
        ESTADO: dispatch.status,
        REGISTRADO_POR: dispatch.userCreate,
        FECHA_REGISTRO: dispatch.dateCreate,
        ACTUALIZADO_POR: dispatch.userUpdate || '',
        FECHA_ACTUALIZACION: dispatch.dateUpdate || ''
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
