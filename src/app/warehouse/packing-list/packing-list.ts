// src/app/warehouse/packing-list/packing-list.ts
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import * as XLSX from 'xlsx';

import { DashboardServices } from '../../services/dashboard-services';
import { AuthService } from '../../services/auth-services';
import { PackingListActorRef, PackingListCrossValidateResponse, PackingListRecord } from '../../interfaces/assembly.interface';

interface PackingHourGroup {
  hour: string;
  items: PackingListRecord[];
  total: number;
  checked: number;
  pending: number;
  /** Nombres únicos de quienes verificaron al menos un item de este grupo. */
  validators: string[];
}

/** Consolidado de una referencia (productCode) dentro del grupo de horas seleccionado, para que
 * el operario compare el conteo físico contra lo realmente escaneado. */
interface PackingReferenceSummary {
  productCode: string;
  productName: string;
  total: number;
  checked: number;
  pending: number;
}

type PackingStatusFilter = 'all' | 'checked' | 'pending';

@Component({
  selector: 'app-packing-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './packing-list.html',
  styleUrl: './packing-list.scss'
})
export class PackingList implements OnInit {
  private readonly dashboardService = inject(DashboardServices);
  private readonly authService = inject(AuthService);
  private readonly toastr = inject(ToastrService);

  // ============================================================
  //  FILTRO POR RANGO DE FECHAS (por defecto: hoy)
  // ============================================================

  public dateIni: string = this.formatDate(new Date());
  public dateEnd: string = this.formatDate(new Date());
  public isLoading = false;

  private allRecords: PackingListRecord[] = [];
  public hourGroups: PackingHourGroup[] = [];

  // ============================================================
  //  GRUPO DE HORAS SELECCIONADO Y SU DETALLE
  // ============================================================

  public selectedGroup: PackingHourGroup | null = null;
  public referenceSummaries: PackingReferenceSummary[] = [];
  public referenceFilter: string | null = null;

  public searchTerm = '';
  public statusFilter: PackingStatusFilter = 'all';
  public onlyErrors = false;
  public onlyDuplicated = false;
  public filteredItems: PackingListRecord[] = [];

  /** ids en proceso de guardado, para bloquear su checkbox mientras responde el backend */
  public savingIds = new Set<string>();

  get totalRecords(): number {
    return this.allRecords.length;
  }

  get totalChecked(): number {
    return this.allRecords.filter((record) => record.packingList?.checked).length;
  }

  get totalPending(): number {
    return this.totalRecords - this.totalChecked;
  }

  ngOnInit(): void {
    this.loadPackingList();
  }

  public onDateRangeChange(): void {
    this.loadPackingList();
  }

  public loadPackingList(): void {
    if (!this.dateIni || !this.dateEnd) return;

    this.isLoading = true;
    this.dashboardService.getPackingList(this.dateIni, this.dateEnd).subscribe({
      next: (response) => {
        this.allRecords = response.ok ? response.msg : [];
        this.hourGroups = this.buildHourGroups(this.allRecords);

        // Si el grupo seleccionado sigue existiendo tras recargar, refrescamos su detalle;
        // si desapareció (cambio de rango de fechas), volvemos al listado de grupos.
        if (this.selectedGroup) {
          const stillExists = this.hourGroups.find((group) => group.hour === this.selectedGroup!.hour);
          this.selectGroup(stillExists || null);
        }
      },
      error: (err) => {
        this.allRecords = [];
        this.hourGroups = [];
        this.selectedGroup = null;
        this.toastr.error(err.message || 'No se pudo consultar el packing list.');
        this.isLoading = false;
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }

  private buildHourGroups(records: PackingListRecord[]): PackingHourGroup[] {
    const groupsByHour = new Map<string, PackingListRecord[]>();

    for (const record of records) {
      const hour = record.hour || 'Sin hora';
      const items = groupsByHour.get(hour) || [];
      items.push(record);
      groupsByHour.set(hour, items);
    }

    return Array.from(groupsByHour.entries())
      .map(([hour, items]) => ({
        hour,
        items,
        total: items.length,
        checked: items.filter((item) => item.packingList?.checked).length,
        pending: items.filter((item) => !item.packingList?.checked).length,
        validators: this.computeValidators(items)
      }))
      .sort((a, b) => this.compareHours(a.hour, b.hour));
  }

  /** Nombres únicos de quienes verificaron (checkedBy) al menos un item del grupo. */
  private computeValidators(items: PackingListRecord[]): string[] {
    const names = items
      .filter((item) => item.packingList?.checked)
      .map((item) => item.packingList?.checkedBy?.name?.trim())
      .filter((name): name is string => !!name);

    return Array.from(new Set(names));
  }

  /** Etiqueta corta para mostrar en la card (máx. 2 nombres, luego "+N"); el título completo va en el `title` del elemento. */
  public validatorsLabel(group: PackingHourGroup): string {
    if (group.validators.length <= 2) return group.validators.join(', ');
    return `${group.validators.slice(0, 2).join(', ')} +${group.validators.length - 2}`;
  }

  /** Ordena por el primer número que aparezca en la hora (ej. "07:00" antes de "14:00"); si no hay número, cae a orden alfabético. */
  private compareHours(a: string, b: string): number {
    const numA = parseInt(a, 10);
    const numB = parseInt(b, 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.localeCompare(b);
  }

  // ============================================================
  //  SELECCIÓN DE GRUPO, FILTROS Y CONSOLIDADO POR REFERENCIA
  // ============================================================

  public selectGroup(group: PackingHourGroup | null): void {
    this.selectedGroup = group;
    this.searchTerm = '';
    this.statusFilter = 'all';
    this.onlyErrors = false;
    this.onlyDuplicated = false;
    this.referenceFilter = null;
    this.referenceSummaries = group ? this.buildReferenceSummaries(group.items) : [];
    this.applyFilter();
  }

  public backToGroups(): void {
    this.selectGroup(null);
  }

  /** Consolida el grupo de horas por referencia (productCode), para comparar el conteo físico
   * del operario contra el total realmente escaneado y detectar diferencias. */
  private buildReferenceSummaries(items: PackingListRecord[]): PackingReferenceSummary[] {
    const byReference = new Map<string, PackingReferenceSummary>();

    for (const item of items) {
      const key = item.productCode || 'SIN-CODIGO';
      const summary = byReference.get(key) || { productCode: key, productName: item.productName, total: 0, checked: 0, pending: 0 };
      summary.total++;
      if (item.packingList?.checked) summary.checked++;
      else summary.pending++;
      byReference.set(key, summary);
    }

    return Array.from(byReference.values()).sort((a, b) => b.total - a.total);
  }

  /** Clic en una fila del consolidado: filtra la tabla de detalle a esa referencia (clic de nuevo la quita). */
  public filterByReference(summary: PackingReferenceSummary): void {
    this.referenceFilter = this.referenceFilter === summary.productCode ? null : summary.productCode;
    this.applyFilter();
  }

  public clearReferenceFilter(): void {
    this.referenceFilter = null;
    this.applyFilter();
  }

  public setStatusFilter(status: PackingStatusFilter): void {
    this.statusFilter = status;
    this.applyFilter();
  }

  private normalizeSearchText(value: string): string {
    return value.normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').toLowerCase().trim();
  }

  public applyFilter(): void {
    if (!this.selectedGroup) {
      this.filteredItems = [];
      return;
    }

    const tokens = this.normalizeSearchText(this.searchTerm).split(/\s+/).filter(Boolean);

    this.filteredItems = this.selectedGroup.items.filter((item) => {
      if (this.referenceFilter && item.productCode !== this.referenceFilter) return false;
      if (this.statusFilter === 'checked' && !item.packingList?.checked) return false;
      if (this.statusFilter === 'pending' && item.packingList?.checked) return false;
      if (this.onlyErrors && !item.errorMark) return false;
      if (this.onlyDuplicated && !item.isDuplicated) return false;

      if (tokens.length === 0) return true;
      const haystack = this.normalizeSearchText(
        [item.barcode, item.productCode, item.productName, item.consecutiveProduct].filter(Boolean).join(' ')
      );
      return tokens.every((token) => haystack.includes(token));
    });
  }

  // ============================================================
  //  VALIDACIÓN CRUZADA (check/uncheck por item)
  // ============================================================

  private buildCheckedBy(): PackingListActorRef {
    const user = this.authService.userData();
    return {
      uid: user?.uid || '',
      userApp: user?.userApp || '',
      name: user?.full_name || ''
    };
  }

  public isSaving(item: PackingListRecord): boolean {
    return this.savingIds.has(item._id);
  }

  public toggleCheck(item: PackingListRecord): void {
    if (this.isSaving(item)) return;

    const nextChecked = !item.packingList?.checked;
    this.savingIds.add(item._id);

    this.dashboardService.checkPackingListItem({ id: item._id, checked: nextChecked, checkedBy: this.buildCheckedBy() }).subscribe({
      next: (response) => {
        if (response.ok && response.data) {
          item.packingList = response.data.packingList;
        } else {
          this.toastr.error(response.msg || 'No se pudo actualizar la verificación del item.');
        }
      },
      error: (err) => {
        this.toastr.error(err.message || 'Error al actualizar la verificación del item.');
      },
      complete: () => {
        this.savingIds.delete(item._id);
        if (this.selectedGroup) {
          const groupItems = this.selectedGroup.items;
          this.selectedGroup.checked = groupItems.filter((groupItem) => groupItem.packingList?.checked).length;
          this.selectedGroup.pending = this.selectedGroup.total - this.selectedGroup.checked;
          this.selectedGroup.validators = this.computeValidators(groupItems);
          this.referenceSummaries = this.buildReferenceSummaries(groupItems);
        }
      }
    });
  }

  // ============================================================
  //  CARGA DE ARCHIVO PLANO (.sal/.txt) PARA VALIDACIÓN CRUZADA AUTOMÁTICA
  // ============================================================

  public isUploadingFile = false;
  public crossValidateResult: PackingListCrossValidateResponse | null = null;
  public showUnmatchedList = false;

  public onValidationFileSelected(fileList: FileList | null): void {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];

    this.isUploadingFile = true;
    this.crossValidateResult = null;
    this.showUnmatchedList = false;

    this.dashboardService.crossValidatePackingList(file).subscribe({
      next: (response) => {
        this.crossValidateResult = response;
        if (response.ok) {
          this.toastr.success(response.msg || 'Archivo validado correctamente.');
          this.loadPackingList();
        } else {
          this.toastr.error(response.msg || 'No se pudo validar el archivo.');
        }
      },
      error: (err) => {
        this.toastr.error(err.message || 'Error al procesar el archivo de validación.');
      },
      complete: () => {
        this.isUploadingFile = false;
      }
    });
  }

  public dismissCrossValidateResult(): void {
    this.crossValidateResult = null;
  }

  public toggleUnmatchedList(): void {
    this.showUnmatchedList = !this.showUnmatchedList;
  }

  /** Ubica un serial/barcode sin coincidencia dentro de los grupos de horas ya cargados y lo deja
   * listo en el buscador, para que el operario confirme si realmente falta por escanear. */
  public locateBarcode(barcode: string): void {
    const record = this.allRecords.find((item) => item.barcode === barcode);
    if (!record) {
      this.toastr.warning(`El serial ${barcode} no se encuentra en el picking del rango de fechas seleccionado.`);
      return;
    }

    const group = this.hourGroups.find((hourGroup) => hourGroup.hour === record.hour);
    if (!group) return;

    this.selectGroup(group);
    this.searchTerm = barcode;
    this.applyFilter();
  }

  // ============================================================
  //  EXPORTACIÓN A EXCEL
  // ============================================================

  /** Exporta a Excel el detalle filtrado del grupo de horas abierto; si no hay grupo
   * seleccionado, exporta el total de registros entregados por el backend para el rango de fechas. */
  public exportToExcel(): void {
    const source = this.selectedGroup ? this.filteredItems : this.allRecords;

    if (source.length === 0) {
      this.toastr.warning('No hay datos para exportar.');
      return;
    }

    const dataToExport = source.map((item) => ({
      Hora: item.hour,
      Fecha: item.date,
      'Código de Barras': item.barcode,
      'Código de Producto': item.productCode,
      Producto: item.productName,
      Consecutivo: item.consecutiveProduct,
      Verificado: item.packingList?.checked ? 'SI' : 'NO',
      'Verificado Por': item.packingList?.checkedBy?.name || '',
      'Verificado En': item.packingList?.checkedAt || '',
      Novedad: item.errorMark || '',
      Duplicado: item.isDuplicated ? 'SI' : 'NO'
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Packing List');

    const suffix = this.selectedGroup ? `_Grupo_${this.selectedGroup.hour.replace(/:/g, '-')}` : '';
    const fileName = `PackingList_${this.dateIni}_al_${this.dateEnd}${suffix}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  }

  // ============================================================
  //  UTILIDADES DE FECHA
  // ============================================================

  private formatDate(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }
}
