// src/app/warehouse/packing-list/packing-list.ts
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import * as XLSX from 'xlsx';

import { DashboardServices } from '../../services/dashboard-services';
import { AuthService } from '../../services/auth-services';
import {
  PackingListActorRef,
  PackingListCrossValidateResponse,
  PackingListRecord,
  SummumReconcileResponse,
  SummumReconcileStatus
} from '../../interfaces/assembly.interface';

interface PackingHourGroup {
  hour: string;
  items: PackingListRecord[];
  total: number;
  checked: number;
  pending: number;
  /** Unidades conciliadas por cantidad contra algún vale Summum (independiente de `checked`). */
  summumReconciled: number;
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

const SUMMUM_STATUS_LABELS: Record<SummumReconcileStatus, string> = {
  MATCH: 'Cuadra',
  MISSING_IN_SUMMUM: 'Faltan en Summum',
  EXCESS_IN_SUMMUM: 'Sobran en Summum',
  NOT_IN_SUMMUM: 'No cargada a Summum',
  NOT_SCANNED: 'No escaneada'
};

const SUMMUM_STATUS_CLASSES: Record<SummumReconcileStatus, string> = {
  MATCH: 'status-closed',
  MISSING_IN_SUMMUM: 'status-claim-full',
  EXCESS_IN_SUMMUM: 'status-pending',
  NOT_IN_SUMMUM: 'status-claim-full',
  NOT_SCANNED: 'status-partial'
};

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
  /** Solo unidades que ningún vale Summum ha conciliado (ubica rápido los faltantes). */
  public onlyNotReconciled = false;
  public filteredItems: PackingListRecord[] = [];

  // ============================================================
  //  BÚSQUEDA GLOBAL (sobre TODOS los grupos de horas del rango)
  // ============================================================

  /** Texto del buscador de la vista de grupos: cruza todos los grupos sin abrirlos uno a uno. */
  public globalSearchTerm = '';
  public globalResults: PackingListRecord[] = [];

  /** ids en proceso de guardado, para bloquear su checkbox mientras responde el backend */
  public savingIds = new Set<string>();

  get totalRecords(): number {
    return this.allRecords.length;
  }

  get totalChecked(): number {
    return this.allRecords.filter((record) => this.isVerified(record)).length;
  }

  // ============================================================
  //  ESTADO "VERIFICADO" (check manual O conciliada por vale Summum)
  // ============================================================

  /** Una unidad cuenta como verificada si tiene check manual o fue conciliada por un vale Summum. */
  public isVerified(item: PackingListRecord): boolean {
    return !!item.packingList?.checked || !!item.packingList?.summum?.reconciled;
  }

  /** Responsable a mostrar: quien hizo el check manual; si no hay, quien aplicó el vale Summum. */
  public verifiedByName(item: PackingListRecord): string {
    if (item.packingList?.checked && item.packingList.checkedBy?.name) return item.packingList.checkedBy.name;
    if (item.packingList?.summum?.reconciled) return item.packingList.summum.reconciledBy?.name || '';
    return '';
  }

  /** Fecha/hora a mostrar, con la misma prioridad que `verifiedByName`. */
  public verifiedAt(item: PackingListRecord): string {
    if (item.packingList?.checked && item.packingList.checkedAt) return item.packingList.checkedAt;
    if (item.packingList?.summum?.reconciled) return item.packingList.summum.reconciledAt || '';
    return '';
  }

  get totalPending(): number {
    return this.totalRecords - this.totalChecked;
  }

  /** `true` cuando el buscador global de la vista de grupos tiene texto. */
  get isGlobalSearching(): boolean {
    return this.globalSearchTerm.trim().length > 0;
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

        // Si hay una búsqueda global activa, la re-ejecutamos contra los registros recién cargados.
        if (this.isGlobalSearching) this.applyGlobalSearch();
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
      .map(([hour, items]) =>
        this.recalcGroup({ hour, items, total: items.length, checked: 0, pending: 0, summumReconciled: 0, validators: [] })
      )
      .sort((a, b) => this.compareHours(a.hour, b.hour));
  }

  /** Recalcula contadores y validadores de un grupo a partir de sus items. */
  private recalcGroup(group: PackingHourGroup): PackingHourGroup {
    group.checked = group.items.filter((item) => this.isVerified(item)).length;
    group.pending = group.total - group.checked;
    group.summumReconciled = group.items.filter((item) => item.packingList?.summum?.reconciled).length;
    group.validators = this.computeValidators(group.items);
    return group;
  }

  /** Nombres únicos de quienes verificaron al menos un item del grupo (check manual o vale Summum). */
  private computeValidators(items: PackingListRecord[]): string[] {
    const names: string[] = [];
    for (const item of items) {
      if (item.packingList?.checked && item.packingList.checkedBy?.name) names.push(item.packingList.checkedBy.name.trim());
      if (item.packingList?.summum?.reconciled && item.packingList.summum.reconciledBy?.name) {
        names.push(item.packingList.summum.reconciledBy.name.trim());
      }
    }
    return Array.from(new Set(names.filter(Boolean)));
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
    this.onlyNotReconciled = false;
    this.referenceFilter = null;
    // La vista previa del vale es propia del grupo: al cambiar de grupo se descarta.
    if (this.summumPreview?.group?.hour !== group?.hour) this.clearSummumPreview();
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
      if (this.isVerified(item)) summary.checked++;
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
      if (this.statusFilter === 'checked' && !this.isVerified(item)) return false;
      if (this.statusFilter === 'pending' && this.isVerified(item)) return false;
      if (this.onlyErrors && !item.errorMark) return false;
      if (this.onlyDuplicated && !item.isDuplicated) return false;
      if (this.onlyNotReconciled && (item.isDuplicated || item.packingList?.summum?.reconciled)) return false;

      if (tokens.length === 0) return true;
      return tokens.every((token) => this.buildSearchHaystack(item).includes(token));
    });
  }

  /** Texto normalizado donde se busca cada token: barcode, referencia, código, EAN, nombre y consecutivo. */
  private buildSearchHaystack(item: PackingListRecord): string {
    return this.normalizeSearchText(
      [item.barcode, item.reference, item.productCode, item.EAN, item.productName, item.consecutiveProduct].filter(Boolean).join(' ')
    );
  }

  /** Búsqueda inteligente sobre TODOS los grupos de horas del rango (barcode, referencia,
   * código de producto, EAN, nombre o consecutivo), sin necesidad de abrir cada grupo. */
  public applyGlobalSearch(): void {
    const tokens = this.normalizeSearchText(this.globalSearchTerm).split(/\s+/).filter(Boolean);

    if (tokens.length === 0) {
      this.globalResults = [];
      return;
    }

    this.globalResults = this.allRecords.filter((item) => {
      const haystack = this.buildSearchHaystack(item);
      return tokens.every((token) => haystack.includes(token));
    });
  }

  public clearGlobalSearch(): void {
    this.globalSearchTerm = '';
    this.globalResults = [];
  }

  /** Desde un resultado global, abre su grupo de horas con el barcode ya cargado en el buscador del detalle. */
  public openGroupFromResult(item: PackingListRecord): void {
    const group = this.hourGroups.find((hourGroup) => hourGroup.hour === (item.hour || 'Sin hora'));
    if (!group) return;

    this.selectGroup(group);
    this.searchTerm = item.barcode;
    this.applyFilter();
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

    // Una unidad conciliada por vale Summum solo se desmarca con motivo (queda auditado).
    if (item.packingList?.summum?.reconciled) {
      this.openRevokeDialog(item);
      return;
    }

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
        // `complete` no se ejecuta tras un error: liberamos el checkbox aquí.
        this.savingIds.delete(item._id);
        this.refreshAfterToggle(item);
      },
      complete: () => {
        this.savingIds.delete(item._id);
        this.refreshAfterToggle(item);
      }
    });
  }

  /** Tras un check/uncheck, recalcula los contadores del grupo abierto (vista detalle) y de la
   * card del grupo al que pertenece el item (vista de grupos / resultados de búsqueda global). */
  private refreshAfterToggle(item: PackingListRecord): void {
    if (this.selectedGroup) {
      this.recalcGroup(this.selectedGroup);
      this.referenceSummaries = this.buildReferenceSummaries(this.selectedGroup.items);
    }

    const card = this.hourGroups.find((group) => group.hour === (item.hour || 'Sin hora'));
    if (card && card !== this.selectedGroup) this.recalcGroup(card);
  }

  // ============================================================
  //  DESMARCAR UNA UNIDAD CONCILIADA POR SUMMUM (motivo obligatorio, auditado)
  // ============================================================

  public revokeTarget: PackingListRecord | null = null;
  public revokeReason = '';
  public isRevoking = false;

  get canConfirmRevoke(): boolean {
    return this.revokeReason.trim().length >= 5 && !this.isRevoking;
  }

  private openRevokeDialog(item: PackingListRecord): void {
    this.revokeTarget = item;
    this.revokeReason = '';
  }

  public cancelRevoke(): void {
    if (this.isRevoking) return;
    this.revokeTarget = null;
    this.revokeReason = '';
  }

  public confirmRevoke(): void {
    const item = this.revokeTarget;
    if (!item || !this.canConfirmRevoke) return;

    this.isRevoking = true;
    this.savingIds.add(item._id);

    this.dashboardService.revokePackingListVerification({ id: item._id, observation: this.revokeReason.trim() }).subscribe({
      next: (response) => {
        if (response.ok && response.data) {
          item.packingList = response.data.packingList;
          this.toastr.success(response.msg || 'Unidad desmarcada.');
          this.revokeTarget = null;
          this.revokeReason = '';
        } else {
          this.toastr.error(response.msg || 'No se pudo desmarcar la unidad.');
        }
      },
      error: (err) => {
        this.toastr.error(err.message || 'Error al desmarcar la unidad.');
        this.isRevoking = false;
        this.savingIds.delete(item._id);
      },
      complete: () => {
        this.isRevoking = false;
        this.savingIds.delete(item._id);
        this.refreshAfterToggle(item);
      }
    });
  }

  // ============================================================
  //  CARGA DE ARCHIVO PLANO (.sal/.txt) PARA VALIDACIÓN CRUZADA AUTOMÁTICA
  // ============================================================

  public isUploadingFile = false;
  public crossValidateResult: PackingListCrossValidateResponse | null = null;
  public showUnmatchedList = false;

  // ============================================================
  //  LIMPIEZA MANUAL DE DUPLICADOS (LoadBarcode, día actual)
  // ============================================================

  public isCleaningDuplicates = false;

  /** Botón manual de bodega: marca como duplicados los códigos de barras repetidos del día
   * actual (isDuplicated: true). No borra ningún registro — se conservan para trazabilidad,
   * solo dejan de contar como unidad producida en los reportes. El mismo proceso corre
   * automático todos los días a las 04:00 am sobre el día anterior. */
  public cleanDuplicateBarcodes(): void {
    if (this.isCleaningDuplicates) return;

    this.isCleaningDuplicates = true;
    this.dashboardService.cleanDuplicateBarcodes().subscribe({
      next: (response) => {
        if (response.ok) {
          this.toastr.success(response.msg || 'Duplicados marcados correctamente.');
          if ((response.totalMarcados || 0) > 0) this.loadPackingList();
        } else {
          this.toastr.error(response.msg || 'No se pudo marcar los duplicados.');
        }
      },
      error: (err) => {
        this.toastr.error(err.message || 'Error al marcar los duplicados.');
      },
      complete: () => {
        this.isCleaningDuplicates = false;
      }
    });
  }

  /** Un vale de traslado Summum trae "Documento" y operaciones "POR TRASLADO", nunca seriales. */
  private isSummumValeContent(content: string): boolean {
    return /Documento\.*:\s*\d+/.test(content) && /(ENTRADA|SALIDA) POR TRASLADO/.test(content);
  }

  public onValidationFileSelected(fileList: FileList | null): void {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];

    // Si llega un vale Summum por este botón (flujo de seriales .sal), lo redirigimos a la
    // conciliación por cantidad del grupo abierto, o indicamos dónde cargarlo.
    file
      .text()
      .then((content) => {
        if (!this.isSummumValeContent(content)) {
          this.uploadSerialValidationFile(file);
          return;
        }
        if (this.selectedGroup) {
          this.startSummumPreview(file);
          return;
        }
        this.toastr.info(
          'Este archivo es un vale de traslado Summum. Abre el grupo de horas al que corresponde y usa "Cargar Vale Summum".',
          'Vale Summum detectado',
          { timeOut: 8000 }
        );
      })
      .catch(() => this.uploadSerialValidationFile(file));
  }

  private uploadSerialValidationFile(file: File): void {
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
        // `complete` no se ejecuta tras un error: sin esto el botón quedaba en "Validando..."
        this.isUploadingFile = false;
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
  //  CONCILIACIÓN POR CANTIDAD CONTRA EL VALE SUMMUM (por grupo de horas)
  // ============================================================

  /** Vale seleccionado: se conserva para aplicarlo tras la vista previa sin volver a pedirlo. */
  private summumFile: File | null = null;
  public summumPreview: SummumReconcileResponse | null = null;
  public isReconcilingSummum = false;

  /** `true` cuando la conciliación mostrada ya quedó aplicada (respuesta con dryRun: false). */
  get isSummumApplied(): boolean {
    return !!this.summumPreview && this.summumPreview.dryRun === false;
  }

  /** Un grupo se identifica por hora; si el rango trae esa misma hora en varios días, no se puede conciliar. */
  private resolveGroupDate(group: PackingHourGroup): string | null {
    const dates = Array.from(new Set(group.items.map((item) => item.date)));
    return dates.length === 1 ? dates[0] : null;
  }

  /** Paso 1: vista previa (dryRun). No escribe nada en el backend. */
  public onSummumValeSelected(fileList: FileList | null): void {
    if (!fileList || fileList.length === 0) return;
    this.startSummumPreview(fileList[0]);
  }

  private startSummumPreview(file: File): void {
    if (!this.selectedGroup) return;

    const date = this.resolveGroupDate(this.selectedGroup);
    if (!date) {
      this.toastr.error('El grupo mezcla varias fechas; filtra el rango a un solo día para conciliar el vale.');
      return;
    }

    this.summumFile = file;
    this.summumPreview = null;
    this.requestSummumReconcile(date, this.selectedGroup.hour, true);
  }

  /** Paso 2: aplica la conciliación mostrada en la vista previa. */
  public applySummumVale(): void {
    const group = this.summumPreview?.group;
    if (!group || !this.summumFile || this.isReconcilingSummum) return;
    this.requestSummumReconcile(group.date, group.hour, false);
  }

  private requestSummumReconcile(date: string, hour: string, dryRun: boolean): void {
    if (!this.summumFile) return;

    this.isReconcilingSummum = true;
    this.dashboardService.reconcileSummumVale(this.summumFile, date, hour, dryRun).subscribe({
      next: (response) => {
        if (!response.ok) {
          this.toastr.error(response.msg || 'No se pudo conciliar el vale Summum.');
          return;
        }

        this.summumPreview = response;
        if (!dryRun) {
          this.toastr.success(response.msg || 'Vale Summum aplicado correctamente.');
          this.summumFile = null;
          this.loadPackingList();
        }
      },
      error: (err) => {
        this.toastr.error(err.message || 'Error al conciliar el vale Summum.');
        this.isReconcilingSummum = false;
      },
      complete: () => {
        this.isReconcilingSummum = false;
      }
    });
  }

  public clearSummumPreview(): void {
    this.summumPreview = null;
    this.summumFile = null;
  }

  public summumStatusLabel(status: SummumReconcileStatus): string {
    return SUMMUM_STATUS_LABELS[status] || status;
  }

  public summumStatusClass(status: SummumReconcileStatus): string {
    return SUMMUM_STATUS_CLASSES[status] || '';
  }

  /** Exporta a Excel la tabla de conciliación del vale (vista previa o aplicada). */
  public exportSummumReconciliation(): void {
    const preview = this.summumPreview;
    if (!preview?.rows?.length || !preview.vale || !preview.group) return;

    const dataToExport = preview.rows.map((row) => ({
      'Código Summum': row.code,
      'Códigos Picking': row.productCodes.join(', '),
      Referencia: row.reference,
      Producto: row.productName,
      Picking: row.picking,
      'Conciliado Otros Vales': row.previouslyReconciled,
      Summum: row.summum,
      Diferencia: row.difference,
      Estado: this.summumStatusLabel(row.status)
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Conciliación Summum');

    const hour = preview.group.hour.replace(/:/g, '-');
    XLSX.writeFile(workbook, `ConciliacionSummum_Vale${preview.vale.document}_${preview.group.date}_${hour}.xlsx`);
  }

  // ============================================================
  //  EXPORTACIÓN A EXCEL
  // ============================================================

  /** Exporta a Excel el detalle filtrado del grupo de horas abierto; si hay una búsqueda global
   * activa, exporta sus resultados; si no, el total de registros del rango de fechas. */
  public exportToExcel(): void {
    const source = this.selectedGroup ? this.filteredItems : this.isGlobalSearching ? this.globalResults : this.allRecords;

    if (source.length === 0) {
      this.toastr.warning('No hay datos para exportar.');
      return;
    }

    const dataToExport = source.map((item) => ({
      Hora: item.hour,
      Fecha: item.date,
      'Código de Barras': item.barcode,
      Referencia: item.reference || '',
      EAN: item.EAN || '',
      'Código de Producto': item.productCode,
      Producto: item.productName,
      Consecutivo: item.consecutiveProduct,
      Verificado: this.isVerified(item) ? 'SI' : 'NO',
      'Verificado Por': this.verifiedByName(item),
      'Verificado En': this.verifiedAt(item),
      'Conciliado Summum': item.packingList?.summum?.reconciled ? 'SI' : 'NO',
      'Vale Summum': item.packingList?.summum?.document || '',
      Novedad: item.errorMark || '',
      Duplicado: item.isDuplicated ? 'SI' : 'NO'
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Packing List');

    const suffix = this.selectedGroup ? `_Grupo_${this.selectedGroup.hour.replace(/:/g, '-')}` : this.isGlobalSearching ? '_Busqueda' : '';
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
