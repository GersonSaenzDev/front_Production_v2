// src/app/client-home/carrier-management/carrier-management.ts
import { CommonModule, registerLocaleData } from '@angular/common';
import { Component, LOCALE_ID, OnInit, inject } from '@angular/core';
import localeEs from '@angular/common/locales/es';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import * as XLSX from 'xlsx';

import { CustomerHouseService } from '../../services/customer-house.service';
import {
  FreightAdditionalCostInput,
  FreightCarrier,
  FreightCarrierCreateRequest,
  FreightCarrierInput,
  FreightCarrierUpdateRequest,
  FreightRateInput,
  FreightVehicleCapacityInput,
  FreightVehicleType
} from '../../interfaces/customer-house.interface';

registerLocaleData(localeEs, 'es');

type CarrierStatusFilter = 'all' | 'active' | 'inactive';
type CarrierFormMode = 'create' | 'edit';

/** Fila editable de tarifa: destino + tipo de vehículo + valor (todos obligatorios al guardar). */
interface CarrierRateFormRow {
  destination: string;
  vehicleType: FreightVehicleType | '';
  value: number | null;
  observation: string;
}

/** Fila editable de costo adicional al flete: descripción + valor obligatorios al guardar. */
interface CarrierAdditionalCostFormRow {
  description: string;
  value: number | null;
  observation: string;
}

/** Fila editable de capacidad: tipo de vehículo + capacidad (m³) obligatorios al guardar. */
interface CarrierVehicleCapacityFormRow {
  vehicleType: FreightVehicleType | '';
  capacityM3: number | null;
}

interface CarrierFormState {
  name: string;
  nit: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  insurancePct: number | null;
  extraCityValue: number | null;
  offerDate: string; // yyyy-MM-dd (binding de <input type="date">)
  currency: string;
  notes: string;
  rates: CarrierRateFormRow[];
  additionalCosts: CarrierAdditionalCostFormRow[];
  vehicleCapacities: CarrierVehicleCapacityFormRow[];
}

@Component({
  selector: 'app-carrier-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './carrier-management.html',
  styleUrls: ['./carrier-management.scss'],
  providers: [{ provide: LOCALE_ID, useValue: 'es' }]
})
export class CarrierManagement implements OnInit {
  private readonly customerHouseService = inject(CustomerHouseService);
  private readonly toastr = inject(ToastrService);

  // ============================================================
  //  LISTADO + FILTROS
  // ============================================================

  public isLoading = false;
  public searchTerm = '';
  public statusFilter: CarrierStatusFilter = 'all';
  public vehicleTypes: FreightVehicleType[] = [];

  private allCarriers: FreightCarrier[] = [];
  public filteredCarriers: FreightCarrier[] = [];
  public paginatedCarriers: FreightCarrier[] = [];

  public currentPage = 1;
  public pageSize = 10;
  public totalPages = 1;

  get totalCarriers(): number {
    return this.allCarriers.length;
  }

  get activeCarriers(): number {
    return this.allCarriers.filter((carrier) => carrier.status).length;
  }

  get inactiveCarriers(): number {
    return this.allCarriers.filter((carrier) => !carrier.status).length;
  }

  ngOnInit(): void {
    this.loadVehicleTypes();
    this.loadCarriers();
  }

  public loadVehicleTypes(): void {
    this.customerHouseService.getCarrierVehicleTypes().subscribe({
      next: (response) => {
        this.vehicleTypes = response.ok ? response.data || [] : [];
      },
      error: () => {
        this.vehicleTypes = [];
      }
    });
  }

  public loadCarriers(): void {
    this.isLoading = true;
    this.customerHouseService.listCarriers({}).subscribe({
      next: (response) => {
        const list = response.ok && Array.isArray(response.data) ? response.data : [];
        this.allCarriers = list.filter((carrier): carrier is FreightCarrier => !!carrier).map((carrier) => this.normalizeCarrier(carrier));
        this.applyFilter();
      },
      error: (err) => {
        this.allCarriers = [];
        this.applyFilter();
        this.toastr.error(err.message || 'No se pudieron cargar las transportadoras.');
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
   * aparecer en algún campo de la transportadora o de sus tarifas para que coincida.
   * El filtro por estado se aplica antes de la búsqueda por texto.
   */
  public applyFilter(): void {
    const tokens = this.normalizeSearchText(this.searchTerm).split(/\s+/).filter(Boolean);

    const byStatus = this.allCarriers.filter((carrier) => {
      if (this.statusFilter === 'active') return carrier.status;
      if (this.statusFilter === 'inactive') return !carrier.status;
      return true;
    });

    this.filteredCarriers =
      tokens.length === 0
        ? [...byStatus]
        : byStatus.filter((carrier) => {
            const haystack = this.normalizeSearchText(
              [
                carrier.name,
                carrier.nit,
                carrier.contactName,
                carrier.contactPhone,
                carrier.contactEmail,
                ...(carrier.rates || []).map((rate) => rate.destination),
                ...(carrier.rates || []).map((rate) => rate.vehicleType),
                ...(carrier.additionalCosts || []).map((cost) => cost.description)
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
    this.totalPages = Math.ceil(this.filteredCarriers.length / this.pageSize) || 1;
    const start = (this.currentPage - 1) * this.pageSize;
    this.paginatedCarriers = this.filteredCarriers.slice(start, start + this.pageSize);
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

  /** Suma de los costos adicionales al flete de la transportadora. */
  public additionalCostsTotal(carrier: FreightCarrier): number {
    return (carrier?.additionalCosts || []).reduce((sum, cost) => sum + (cost.value || 0), 0);
  }

  /** Vista previa de destinos con tarifa (máx. 3 + contador del resto). */
  public carrierDestinationsPreview(carrier: FreightCarrier): string {
    const destinations = Array.from(new Set((carrier?.rates || []).map((rate) => rate.destination).filter(Boolean)));
    const preview = destinations.slice(0, 3).join(', ');
    return destinations.length > 3 ? `${preview} +${destinations.length - 3}` : preview;
  }

  /**
   * El backend puede devolver documentos sin las colecciones `rates` / `additionalCosts`
   * (o sin cabecera completa). Se normaliza para que la vista nunca reciba `undefined`.
   */
  private normalizeCarrier(raw: FreightCarrier): FreightCarrier {
    return {
      ...raw,
      name: raw.name || '',
      currency: raw.currency || 'COP',
      insurancePct: raw.insurancePct ?? 0,
      extraCityValue: raw.extraCityValue ?? 0,
      status: raw.status ?? false,
      rates: Array.isArray(raw.rates) ? raw.rates : [],
      additionalCosts: Array.isArray(raw.additionalCosts) ? raw.additionalCosts : [],
      vehicleCapacities: Array.isArray(raw.vehicleCapacities) ? raw.vehicleCapacities : [],
      auditTrail: Array.isArray(raw.auditTrail) ? raw.auditTrail : []
    };
  }

  /**
   * El detalle de una transportadora llega en `msg` (convención de este backend);
   * se acepta también `data` por robustez. Devuelve la transportadora ya normalizada.
   */
  private pickCarrier(response: { ok?: boolean; msg?: unknown; data?: unknown }): FreightCarrier | null {
    if (response && typeof response.msg === 'object' && response.msg) {
      return this.normalizeCarrier(response.msg as FreightCarrier);
    }
    if (response && typeof response.data === 'object' && response.data) {
      return this.normalizeCarrier(response.data as FreightCarrier);
    }
    return null;
  }

  // ============================================================
  //  FORMULARIO (CREAR / EDITAR)
  // ============================================================

  public showFormModal = false;
  public isSaving = false;
  public isLoadingForm = false;
  public formMode: CarrierFormMode = 'create';
  public editingCarrierId: string | null = null;
  /** Transportadora que se está editando (para mostrar su nombre y su meta en el modal). */
  public editingCarrier: FreightCarrier | null = null;
  public editObservation = '';
  public form: CarrierFormState = this.buildEmptyForm();

  private buildEmptyForm(): CarrierFormState {
    return {
      name: '',
      nit: '',
      contactName: '',
      contactPhone: '',
      contactEmail: '',
      insurancePct: null,
      extraCityValue: null,
      offerDate: '',
      currency: 'COP',
      notes: '',
      rates: [],
      additionalCosts: [],
      vehicleCapacities: []
    };
  }

  public openCreateModal(): void {
    this.formMode = 'create';
    this.editingCarrierId = null;
    this.editingCarrier = null;
    this.editObservation = '';
    this.isLoadingForm = false;
    this.form = this.buildEmptyForm();
    this.showFormModal = true;
  }

  /**
   * Abre el formulario en modo edición: precarga de inmediato con los datos que ya
   * tenemos del listado y luego los refresca con el detalle completo del backend
   * (tarifas y costos adicionales), para no editar sobre datos parciales.
   */
  public openEditModal(carrier: FreightCarrier): void {
    this.formMode = 'edit';
    this.editingCarrierId = carrier._id;
    this.editingCarrier = this.normalizeCarrier(carrier);
    this.editObservation = '';
    this.form = this.carrierToForm(this.editingCarrier);
    this.showDetailModal = false;
    this.showFormModal = true;

    this.isLoadingForm = true;
    this.customerHouseService.getCarrierDetail({ id: carrier._id }).subscribe({
      next: (response) => {
        const detail = this.pickCarrier(response);
        if (detail) {
          this.editingCarrier = detail;
          this.form = this.carrierToForm(detail);
        }
      },
      error: () => {
        // Si falla el detalle se mantiene la precarga desde el listado.
      },
      complete: () => {
        this.isLoadingForm = false;
      }
    });
  }

  public closeFormModal(): void {
    this.showFormModal = false;
  }

  private carrierToForm(carrier: FreightCarrier): CarrierFormState {
    return {
      name: carrier.name || '',
      nit: carrier.nit || '',
      contactName: carrier.contactName || '',
      contactPhone: carrier.contactPhone || '',
      contactEmail: carrier.contactEmail || '',
      insurancePct: carrier.insurancePct ?? null,
      extraCityValue: carrier.extraCityValue ?? null,
      offerDate: carrier.offerDate ? this.backendDateToInput(carrier.offerDate) : '',
      currency: carrier.currency || 'COP',
      notes: carrier.notes || '',
      rates: (carrier.rates || []).map((rate) => ({
        destination: rate.destination,
        vehicleType: rate.vehicleType,
        value: rate.value,
        observation: rate.observation || ''
      })),
      additionalCosts: (carrier.additionalCosts || []).map((cost) => ({
        description: cost.description,
        value: cost.value,
        observation: cost.observation || ''
      })),
      vehicleCapacities: (carrier.vehicleCapacities || []).map((cap) => ({
        vehicleType: cap.vehicleType,
        capacityM3: cap.capacityM3
      }))
    };
  }

  public addRateRow(): void {
    this.form.rates.push({ destination: '', vehicleType: '', value: null, observation: '' });
  }

  public removeRateRow(index: number): void {
    this.form.rates.splice(index, 1);
  }

  public addCostRow(): void {
    this.form.additionalCosts.push({ description: '', value: null, observation: '' });
  }

  public removeCostRow(index: number): void {
    this.form.additionalCosts.splice(index, 1);
  }

  public addCapacityRow(): void {
    this.form.vehicleCapacities.push({ vehicleType: '', capacityM3: null });
  }

  public removeCapacityRow(index: number): void {
    this.form.vehicleCapacities.splice(index, 1);
  }

  /** Cada tarifa agregada debe traer destino, tipo de vehículo y valor (>= 0). */
  private areRatesValid(): boolean {
    return this.form.rates.every((rate) => !!rate.destination.trim() && !!rate.vehicleType && rate.value !== null && rate.value >= 0);
  }

  /** Cada costo adicional agregado debe traer descripción y valor (>= 0). */
  private areCostsValid(): boolean {
    return this.form.additionalCosts.every((cost) => !!cost.description.trim() && cost.value !== null && cost.value >= 0);
  }

  /** Cada capacidad agregada debe traer tipo de vehículo y capacidad (>= 0). */
  private areCapacitiesValid(): boolean {
    return this.form.vehicleCapacities.every((cap) => !!cap.vehicleType && cap.capacityM3 !== null && cap.capacityM3 >= 0);
  }

  public get isFormValid(): boolean {
    if (!this.form.name.trim()) return false;
    if (this.form.insurancePct !== null && this.form.insurancePct < 0) return false;
    if (this.form.extraCityValue !== null && this.form.extraCityValue < 0) return false;
    if (!this.areRatesValid() || !this.areCostsValid() || !this.areCapacitiesValid()) return false;
    if (this.formMode === 'edit' && !this.editObservation.trim()) return false;
    return true;
  }

  private mapRates(): FreightRateInput[] {
    return this.form.rates.map((rate) => ({
      destination: rate.destination.trim(),
      vehicleType: rate.vehicleType as FreightVehicleType,
      value: Number(rate.value),
      observation: rate.observation.trim() || undefined
    }));
  }

  private mapCosts(): FreightAdditionalCostInput[] {
    return this.form.additionalCosts.map((cost) => ({
      description: cost.description.trim(),
      value: Number(cost.value),
      observation: cost.observation.trim() || undefined
    }));
  }

  private mapCapacities(): FreightVehicleCapacityInput[] {
    return this.form.vehicleCapacities.map((cap) => ({
      vehicleType: cap.vehicleType as FreightVehicleType,
      capacityM3: Number(cap.capacityM3)
    }));
  }

  private buildHeaderPayload(): FreightCarrierInput {
    return {
      name: this.form.name.trim(),
      nit: this.form.nit.trim() || undefined,
      contactName: this.form.contactName.trim() || undefined,
      contactPhone: this.form.contactPhone.trim() || undefined,
      contactEmail: this.form.contactEmail.trim() || undefined,
      insurancePct: this.form.insurancePct !== null ? Number(this.form.insurancePct) : undefined,
      extraCityValue: this.form.extraCityValue !== null ? Number(this.form.extraCityValue) : undefined,
      offerDate: this.form.offerDate ? this.inputDateToBackend(this.form.offerDate) : undefined,
      currency: this.form.currency.trim() || undefined,
      notes: this.form.notes.trim() || undefined
    };
  }

  public submitForm(): void {
    if (!this.isFormValid) {
      this.toastr.warning(
        this.formMode === 'edit'
          ? 'Completa el nombre, revisa las tarifas/costos y escribe el motivo del cambio.'
          : 'Completa el nombre y revisa que cada tarifa y costo adicional tenga sus datos.'
      );
      return;
    }

    const request$ =
      this.formMode === 'create'
        ? this.customerHouseService.createCarrier({
            ...this.buildHeaderPayload(),
            rates: this.mapRates(),
            additionalCosts: this.mapCosts(),
            vehicleCapacities: this.mapCapacities()
          } as FreightCarrierCreateRequest)
        : this.customerHouseService.updateCarrier(
            this.editingCarrierId as string,
            {
              ...this.buildHeaderPayload(),
              rates: this.mapRates(),
              additionalCosts: this.mapCosts(),
              vehicleCapacities: this.mapCapacities(),
              observation: this.editObservation.trim()
            } as FreightCarrierUpdateRequest
          );

    this.isSaving = true;
    request$.subscribe({
      next: (response) => {
        if (response.ok) {
          this.toastr.success(
            response.msg ||
              (this.formMode === 'create' ? 'Transportadora registrada exitosamente.' : 'Transportadora actualizada exitosamente.')
          );
          this.closeFormModal();
          this.loadCarriers();
        } else {
          this.toastr.error(response.msg || 'No se pudo guardar la transportadora.');
        }
      },
      error: (err) => {
        this.toastr.error(err.message || 'Error al guardar la transportadora.');
        this.isSaving = false;
      },
      complete: () => {
        this.isSaving = false;
      }
    });
  }

  // ============================================================
  //  DETALLE (VISUALIZACIÓN)
  // ============================================================

  public showDetailModal = false;
  public isLoadingDetail = false;
  public detailCarrier: FreightCarrier | null = null;

  public openDetail(carrier: FreightCarrier): void {
    this.detailCarrier = this.normalizeCarrier(carrier);
    this.showDetailModal = true;
    this.isLoadingDetail = true;

    this.customerHouseService.getCarrierDetail({ id: carrier._id }).subscribe({
      next: (response) => {
        const detail = this.pickCarrier(response);
        if (detail) {
          this.detailCarrier = detail;
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
    this.detailCarrier = null;
  }

  // ============================================================
  //  ACTIVAR / DESACTIVAR ("apagar" servicio) — borrado lógico
  // ============================================================

  public showStatusModal = false;
  public isTogglingStatus = false;
  public statusTarget: FreightCarrier | null = null;
  public statusObservation = '';

  public get statusModalActionLabel(): string {
    if (!this.statusTarget) return '';
    return this.statusTarget.status ? 'Desactivar' : 'Reactivar';
  }

  public openStatusModal(carrier: FreightCarrier): void {
    this.statusTarget = carrier;
    this.statusObservation = '';
    this.showStatusModal = true;
  }

  public closeStatusModal(): void {
    this.showStatusModal = false;
    this.statusTarget = null;
  }

  public confirmStatusChange(): void {
    if (!this.statusTarget) return;

    if (!this.statusObservation.trim()) {
      this.toastr.warning('Indica el motivo del cambio de estado.');
      return;
    }

    this.isTogglingStatus = true;
    this.customerHouseService
      .setCarrierStatus(this.statusTarget._id, {
        status: !this.statusTarget.status,
        observation: this.statusObservation.trim()
      })
      .subscribe({
        next: (response) => {
          if (response.ok) {
            this.toastr.success(response.msg || 'Estado de la transportadora actualizado.');
            this.closeStatusModal();
            this.closeDetail();
            this.loadCarriers();
          } else {
            this.toastr.error(response.msg || 'No se pudo cambiar el estado.');
          }
        },
        error: (err) => {
          this.toastr.error(err.message || 'Error al cambiar el estado de la transportadora.');
          this.isTogglingStatus = false;
        },
        complete: () => {
          this.isTogglingStatus = false;
        }
      });
  }

  // ============================================================
  //  EXPORTACIÓN A EXCEL
  // ============================================================

  public exportToExcel(): void {
    if (this.allCarriers.length === 0) return;

    const rows: Record<string, string | number>[] = this.allCarriers.flatMap((carrier): Record<string, string | number>[] => {
      const base: Record<string, string | number> = {
        TRANSPORTADORA: carrier.name,
        NIT: carrier.nit || '',
        CONTACTO: carrier.contactName || '',
        TELEFONO: carrier.contactPhone || '',
        CORREO: carrier.contactEmail || '',
        SEGURO_PCT: carrier.insurancePct ?? '',
        VALOR_CIUDAD_ADICIONAL: carrier.extraCityValue ?? '',
        MONEDA: carrier.currency || 'COP',
        FECHA_OFERTA: carrier.offerDate || '',
        ESTADO: carrier.status ? 'ACTIVA' : 'INACTIVA',
        COSTOS_ADICIONALES_TOTAL: this.additionalCostsTotal(carrier),
        COSTOS_ADICIONALES_DETALLE: (carrier.additionalCosts || []).map((cost) => `${cost.description}: ${cost.value}`).join(' | '),
        CAPACIDADES_M3: (carrier.vehicleCapacities || []).map((cap) => `${cap.vehicleType}: ${cap.capacityM3}`).join(' | '),
        NOTAS: carrier.notes || ''
      };

      if (!carrier.rates || carrier.rates.length === 0) {
        return [{ ...base, DESTINO: '', TIPO_VEHICULO: '', VALOR_FLETE: '' }];
      }

      return carrier.rates.map((rate) => ({
        ...base,
        DESTINO: rate.destination,
        TIPO_VEHICULO: rate.vehicleType as string,
        VALOR_FLETE: rate.value
      }));
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Transportadoras');
    XLSX.writeFile(workbook, `Transportadoras_${this.formatDate(new Date())}.xlsx`);
  }

  // ============================================================
  //  UTILIDADES DE FECHA
  // ============================================================

  private formatDate(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  /** "DD/MM/YYYY" (backend) -> "yyyy-MM-dd" (input date). */
  private backendDateToInput(value: string): string {
    const parts = value.split('/');
    if (parts.length !== 3) return '';
    const [day, month, year] = parts;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  /** "yyyy-MM-dd" (input date) -> "DD/MM/YYYY" (backend). */
  private inputDateToBackend(value: string): string {
    const parts = value.split('-');
    if (parts.length !== 3) return '';
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
}
