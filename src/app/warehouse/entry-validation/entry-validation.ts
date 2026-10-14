// src/app/warehouse/entry-validation/entry-validation.ts
import { CommonModule } from '@angular/common';
import { Component, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import * as XLSX from 'xlsx';

import { DashboardServices } from '../../services/dashboard-services';
import {
  WarehouseEntryMissingUnit,
  WarehouseEntryMonthSummary,
  WarehouseEntryValidationResponse
} from '../../interfaces/assembly.interface';

/** Fila del "Listado de Series Por Producto" del ERP (una por serial y movimiento). */
interface ErpSerialRow {
  date: string;
  productCode: string;
  productAlt: string;
  productName: string;
  serial: string;
  nit: string;
  thirdParty: string;
  voucher: string;
  document: string;
  noveltyDate: string;
  noveltyHour: string;
}

/**
 * Estado del serial (AAMM#####) frente al mes de ingreso en el ERP:
 * ok = mismo mes · lag = serial de un mes anterior (desfase) · el resto son posibles errores.
 */
type SerialStatus = 'ok' | 'lag' | 'future' | 'invalidMonth' | 'invalidYear' | 'invalidFormat';

/** Unidad única del archivo (producto + serial), con su primer movimiento como ingreso. */
interface ErpSerialEntry {
  key: string;
  productCode: string;
  productAlt: string;
  productName: string;
  serial: string;
  entryDate: string;
  entryMonth: string;
  serialYear: string;
  serialMonth: string;
  serialConsecutive: string;
  serialPeriod: string;
  serialStatus: SerialStatus;
  serialIssue: string;
  isError: boolean;
  voucher: string;
  document: string;
  thirdParty: string;
  rows: number;
  /** Mes/fecha en que entró al sistema (LoadBarcode). null = no existe; '' = sin validar. */
  systemMonth: string | null;
  systemDate: string | null;
  haystack: string;
}

interface MissingUnitView extends WarehouseEntryMissingUnit {
  month: string;
  haystack: string;
}

/** Consolidado por referencia de la lista activa. */
interface ReferenceSummary {
  key: string;
  reference: string;
  productCode: string;
  productName: string;
  total: number;
}

/** Fila del indicador mensual: archivo (mes de ingreso ERP) vs sistema (mes de LoadBarcode). */
interface MonthIndicator {
  month: string;
  fileUnits: number;
  fileReferences: number;
  systemUnits: number;
  systemReferences: number;
  difference: number;
  foundInFile: number;
  missingCount: number;
  crossMonthCount: number;
  lagCount: number;
  errorCount: number;
  notInSystemCount: number;
}

type EntryValidationTab = 'missing' | 'errors' | 'lag' | 'notInSystem' | 'file';

/** Encabezados del Excel del ERP → campo. Se buscan normalizados (sin tildes, minúsculas). */
const ERP_COLUMNS: Record<string, keyof ErpSerialRow> = {
  fecha: 'date',
  producto: 'productCode',
  'producto alt': 'productAlt',
  nombre: 'productName',
  'no. serial': 'serial',
  'nit tercero': 'nit',
  'nombre tercero': 'thirdParty',
  comprobante: 'voucher',
  documento: 'document',
  'fecha nov': 'noveltyDate',
  'hora nov': 'noveltyHour'
};

const SERIAL_STATUS_LABELS: Record<SerialStatus, string> = {
  ok: 'Correcto',
  lag: 'Desfase de mes',
  future: 'Mes posterior al ingreso',
  invalidMonth: 'Mes inexistente',
  invalidYear: 'Año fuera de rango',
  invalidFormat: 'Formato inválido'
};

/** La pestaña "Archivo ERP" puede traer cientos de miles de unidades: se pinta solo este tope. */
const FILE_RENDER_LIMIT = 2000;

const normalizeText = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const lastDayOfMonth = (month: string): string => {
  const [year, mm] = month.split('-').map(Number);
  return `${month}-${String(new Date(year, mm, 0).getDate()).padStart(2, '0')}`;
};

@Component({
  selector: 'app-entry-validation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './entry-validation.html',
  styleUrl: './entry-validation.scss'
})
export class EntryValidation implements OnDestroy {
  private readonly dashboardService = inject(DashboardServices);
  private readonly toastr = inject(ToastrService);

  public readonly statusLabels = SERIAL_STATUS_LABELS;
  public readonly fileRenderLimit = FILE_RENDER_LIMIT;

  // ============================================================
  //  ARCHIVO DEL ERP
  // ============================================================

  public fileName = '';
  public isReadingFile = false;
  public fileRowsCount = 0;
  /** Unidades únicas (producto + serial) del archivo. */
  public entries: ErpSerialEntry[] = [];
  /** Meses de ingreso (columna Fecha) presentes en el archivo. */
  public fileMonths: string[] = [];
  public fileMaxDate = '';

  public dateIni = '';
  public dateEnd = '';
  /** Filtro de mes para la vista ('' = todos los meses del archivo). */
  public selectedMonth = '';

  // ============================================================
  //  RESULTADO DE LA VALIDACIÓN
  // ============================================================

  public isValidating = false;
  public result: WarehouseEntryValidationResponse['data'] | null = null;
  private missingUnits: MissingUnitView[] = [];
  public monthIndicators: MonthIndicator[] = [];

  public activeTab: EntryValidationTab = 'missing';
  public searchTerm = '';
  public referenceFilter: string | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  // Listas por pestaña (mes + búsqueda), y la de la pestaña activa con filtro de referencia.
  public missingBySearch: MissingUnitView[] = [];
  public errorsBySearch: ErpSerialEntry[] = [];
  public lagBySearch: ErpSerialEntry[] = [];
  public notInSystemBySearch: ErpSerialEntry[] = [];
  public entriesBySearch: ErpSerialEntry[] = [];

  public filteredMissing: MissingUnitView[] = [];
  public filteredEntries: ErpSerialEntry[] = [];
  public referenceSummaries: ReferenceSummary[] = [];

  get monthIndicator(): MonthIndicator | null {
    if (!this.monthIndicators.length) return null;
    if (this.selectedMonth) return this.monthIndicators.find((m) => m.month === this.selectedMonth) || null;
    return this.totalIndicator;
  }

  /** Totales de todos los meses (las referencias se cuentan únicas, no sumadas). */
  get totalIndicator(): MonthIndicator {
    const sum = (field: keyof MonthIndicator) => this.monthIndicators.reduce((acc, m) => acc + Number(m[field]), 0);
    return {
      month: 'Total',
      fileUnits: sum('fileUnits'),
      fileReferences: new Set(this.entries.map((e) => e.productCode)).size,
      systemUnits: sum('systemUnits'),
      systemReferences: this.result?.totals.references ?? 0,
      difference: sum('difference'),
      foundInFile: sum('foundInFile'),
      missingCount: sum('missingCount'),
      crossMonthCount: sum('crossMonthCount'),
      lagCount: sum('lagCount'),
      errorCount: sum('errorCount'),
      notInSystemCount: sum('notInSystemCount')
    };
  }

  get downloadableSerials(): string[] {
    return [...new Set(this.filteredMissing.map((unit) => (unit.consecutiveProduct || '').trim()).filter(Boolean))];
  }

  get visibleEntries(): ErpSerialEntry[] {
    return this.activeTab === 'file' ? this.filteredEntries.slice(0, FILE_RENDER_LIMIT) : this.filteredEntries;
  }

  ngOnDestroy(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  // ============================================================
  //  LECTURA DEL EXCEL
  // ============================================================

  public onFileSelected(files: FileList | null): void {
    const file = files?.[0];
    if (!file) return;

    this.isReadingFile = true;
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const rows = this.parseErpWorkbook(reader.result as ArrayBuffer);

        if (!rows.length) {
          this.toastr.warning(
            'No se encontró la columna "No. Serial" con datos. Verifica que sea el Listado de Series Por Producto del ERP.',
            'Archivo sin seriales'
          );
          return;
        }

        this.fileName = file.name;
        this.fileRowsCount = rows.length;
        this.entries = this.buildEntries(rows);
        this.fileMonths = [...new Set(this.entries.map((e) => e.entryMonth))].sort();
        this.fileMaxDate = rows.reduce((max, row) => (row.date > max ? row.date : max), '');
        this.selectedMonth = '';
        this.result = null;
        this.missingUnits = [];
        this.resetRangeToFile();

        const errors = this.entries.filter((e) => e.isError).length;
        this.toastr.success(
          `${rows.length.toLocaleString()} filas · ${this.entries.length.toLocaleString()} unidades · ${this.fileMonths.length} mes(es)` +
            (errors ? ` · ${errors.toLocaleString()} seriales con error` : ''),
          'Archivo cargado'
        );
        this.validate();
      } catch (error) {
        console.error('EntryValidation: error leyendo el Excel', error);
        this.toastr.error('No se pudo leer el archivo. Debe ser el Excel (.xlsx/.xls) del ERP.', 'Error');
      } finally {
        this.isReadingFile = false;
      }
    };

    reader.onerror = () => {
      this.isReadingFile = false;
      this.toastr.error('No se pudo leer el archivo.', 'Error');
    };

    reader.readAsArrayBuffer(file);
  }

  /** Busca en cualquier hoja la fila de encabezados (la que tiene "No. Serial") y lee desde ahí. */
  private parseErpWorkbook(buffer: ArrayBuffer): ErpSerialRow[] {
    const workbook = XLSX.read(buffer, { type: 'array' });

    for (const sheetName of workbook.SheetNames) {
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true });
      const headerIndex = matrix.findIndex((row) => row.some((cell) => normalizeText(cell) === 'no. serial'));
      if (headerIndex < 0) continue;

      const columns = new Map<number, keyof ErpSerialRow>();
      matrix[headerIndex].forEach((cell, index) => {
        const field = ERP_COLUMNS[normalizeText(cell)];
        if (field && ![...columns.values()].includes(field)) columns.set(index, field);
      });

      const rows: ErpSerialRow[] = [];
      for (const raw of matrix.slice(headerIndex + 1)) {
        const row = {} as ErpSerialRow;
        columns.forEach((field, index) => {
          const value = raw[index];
          row[field] = field === 'date' || field === 'noveltyDate' ? this.toIsoDate(value) : String(value ?? '').trim();
        });

        // Las filas de encabezado por producto (Fecha vacía, sin serial) no son unidades.
        if (!row.serial || !row.date) continue;
        rows.push(row);
      }
      return rows;
    }

    return [];
  }

  /**
   * Agrupa por producto + serial (el mismo serial existe en productos distintos). El primer
   * movimiento (fecha menor) es el ingreso; los demás (factura, traslado) solo suman filas.
   */
  private buildEntries(rows: ErpSerialRow[]): ErpSerialEntry[] {
    const byKey = new Map<string, { first: ErpSerialRow; rows: number }>();

    for (const row of rows) {
      const key = `${row.productCode.substring(0, 5)}|${row.serial}`;
      const current = byKey.get(key);
      if (!current) byKey.set(key, { first: row, rows: 1 });
      else {
        current.rows++;
        if (row.date < current.first.date) current.first = row;
      }
    }

    return [...byKey.entries()].map(([key, { first, rows: count }]) => {
      const entryMonth = first.date.slice(0, 7);
      const decoded = this.decodeSerial(first.serial, entryMonth);
      const entry: ErpSerialEntry = {
        key,
        productCode: first.productCode,
        productAlt: first.productAlt,
        productName: first.productName,
        serial: first.serial,
        entryDate: first.date,
        entryMonth,
        ...decoded,
        voucher: first.voucher,
        document: first.document,
        thirdParty: first.thirdParty,
        rows: count,
        systemMonth: '',
        systemDate: '',
        haystack: ''
      };
      entry.haystack = this.entryHaystack(entry);
      return entry;
    });
  }

  /**
   * Serial AAMM##### (ej. 251200001 = año 25, mes 12, consecutivo 00001) frente al mes de
   * ingreso en el ERP. Mes 00 o > 12, año fuera de [ingreso - 1, ingreso] o un serial de un mes
   * posterior al ingreso son posibles errores; un mes anterior es desfase (ingresó tarde).
   */
  private decodeSerial(serial: string, entryMonth: string) {
    const base = { serialYear: '', serialMonth: '', serialConsecutive: '', serialPeriod: '' };

    const match = serial.match(/^(\d{2})(\d{2})(\d{5})$/);
    if (!match) {
      return { ...base, serialStatus: 'invalidFormat' as SerialStatus, serialIssue: 'Se esperan 9 dígitos AAMM#####', isError: true };
    }

    const [, yy, mm, consecutive] = match;
    const decoded = { serialYear: `20${yy}`, serialMonth: mm, serialConsecutive: consecutive, serialPeriod: '' };
    const month = Number(mm);
    const year = 2000 + Number(yy);
    const entryYear = Number(entryMonth.slice(0, 4));

    if (month < 1 || month > 12) {
      return { ...decoded, serialStatus: 'invalidMonth' as SerialStatus, serialIssue: `El mes ${mm} no existe`, isError: true };
    }
    decoded.serialPeriod = `${year}-${mm}`;

    if (year > entryYear || year < entryYear - 1) {
      return {
        ...decoded,
        serialStatus: 'invalidYear' as SerialStatus,
        serialIssue: `Año ${year} no corresponde a un ingreso de ${entryMonth}`,
        isError: true
      };
    }
    if (decoded.serialPeriod > entryMonth) {
      return {
        ...decoded,
        serialStatus: 'future' as SerialStatus,
        serialIssue: `Serial de ${decoded.serialPeriod}, ingresado antes (${entryMonth})`,
        isError: true
      };
    }
    if (decoded.serialPeriod < entryMonth) {
      return {
        ...decoded,
        serialStatus: 'lag' as SerialStatus,
        serialIssue: `Serial de ${decoded.serialPeriod}, ingresado en ${entryMonth}`,
        isError: false
      };
    }
    return { ...decoded, serialStatus: 'ok' as SerialStatus, serialIssue: '', isError: false };
  }

  private entryHaystack(entry: ErpSerialEntry): string {
    return normalizeText(
      [
        entry.entryDate,
        entry.productCode,
        entry.productAlt,
        entry.productName,
        entry.serial,
        entry.serialPeriod,
        SERIAL_STATUS_LABELS[entry.serialStatus],
        entry.serialIssue,
        entry.thirdParty,
        entry.voucher,
        entry.document,
        entry.systemDate
      ].join(' ')
    );
  }

  /** Fecha del Excel (serial numérico, Date o texto MM/DD/YYYY | YYYY-MM-DD) → YYYY-MM-DD. */
  private toIsoDate(value: unknown): string {
    if (value === null || value === undefined || value === '') return '';

    if (typeof value === 'number') {
      const parsed = XLSX.SSF.parse_date_code(value);
      return parsed ? `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}` : '';
    }

    if (value instanceof Date) return this.formatDate(value);

    const text = String(value).trim();
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

    const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;

    return '';
  }

  /**
   * Rango por defecto: del día 1 del primer mes al último día que trae el archivo (corte del
   * reporte del ERP), para no mostrar como faltante lo producido después de generar el listado.
   */
  public resetRangeToFile(): void {
    this.dateIni = this.fileMonths.length ? `${this.fileMonths[0]}-01` : '';
    const lastMonth = this.fileMonths[this.fileMonths.length - 1];
    this.dateEnd = lastMonth
      ? this.fileMaxDate && this.fileMaxDate < lastDayOfMonth(lastMonth)
        ? this.fileMaxDate
        : lastDayOfMonth(lastMonth)
      : '';
  }

  // ============================================================
  //  VALIDACIÓN CONTRA LoadBarcode
  // ============================================================

  public validate(): void {
    if (!this.entries.length) return;

    if (!this.dateIni || !this.dateEnd || this.dateIni > this.dateEnd) {
      this.toastr.warning('Revisa el rango de fechas.', 'Rango inválido');
      return;
    }

    this.isValidating = true;

    this.dashboardService
      .validateWarehouseEntry({
        dateIni: this.dateIni,
        dateEnd: this.dateEnd,
        items: this.entries.map((entry) => [entry.key, entry.entryMonth] as [string, string])
      })
      .subscribe({
        next: (response) => {
          this.isValidating = false;
          this.result = response.data || null;
          this.applyValidationResult();
          if (this.result?.lookupSkipped) {
            this.toastr.info(
              'Demasiados seriales del archivo fuera del rango: no se buscó su fecha en el sistema. Ajusta el rango.',
              'Búsqueda parcial'
            );
          }
        },
        error: (error: Error) => {
          this.isValidating = false;
          this.toastr.error(error.message || 'No se pudo validar el archivo.', 'Error');
        }
      });
  }

  /** Marca en cada unidad del archivo cuándo entró al sistema y arma los indicadores por mes. */
  private applyValidationResult(): void {
    const data = this.result;
    if (!data) return;

    const crossMonth = new Map(data.crossMonth.map((unit) => [unit.key, unit]));
    const outOfRange = new Map(data.notInRange.map((item) => [item.key, item]));

    for (const entry of this.entries) {
      const cross = crossMonth.get(entry.key);
      const outside = outOfRange.get(entry.key);

      if (cross) {
        entry.systemMonth = cross.systemMonth;
        entry.systemDate = cross.date;
      } else if (outside) {
        // Búsqueda omitida: no se sabe si existe (queda '' = sin validar).
        entry.systemDate = outside.systemDate ?? (data.lookupSkipped ? '' : null);
        entry.systemMonth = outside.systemDate ? outside.systemDate.slice(0, 7) : entry.systemDate;
      } else {
        entry.systemMonth = entry.entryMonth;
        entry.systemDate = '';
      }
      entry.haystack = this.entryHaystack(entry);
    }

    this.missingUnits = data.missing.map((unit) => ({
      ...unit,
      month: String(unit.date || '').slice(0, 7),
      haystack: normalizeText(
        [
          unit.consecutiveProduct,
          unit.barcode,
          unit.productCode,
          unit.productName,
          unit.reference,
          unit.EAN,
          unit.date,
          unit.hour,
          unit.originalFile,
          unit.packingList?.summum?.document
        ].join(' ')
      )
    }));

    this.monthIndicators = this.buildMonthIndicators(data.months);
    this.referenceFilter = null;
    this.applyFilters();
  }

  private buildMonthIndicators(systemMonths: WarehouseEntryMonthSummary[]): MonthIndicator[] {
    const months = [...new Set([...this.fileMonths, ...systemMonths.map((m) => m.month)])].sort();

    return months.map((month) => {
      const system = systemMonths.find((m) => m.month === month);
      const fileEntries = this.entries.filter((e) => e.entryMonth === month);
      const fileUnits = fileEntries.length;
      return {
        month,
        fileUnits,
        fileReferences: new Set(fileEntries.map((e) => e.productCode)).size,
        systemUnits: system?.systemUnits ?? 0,
        systemReferences: system?.references ?? 0,
        difference: fileUnits - (system?.systemUnits ?? 0),
        foundInFile: system?.foundInFile ?? 0,
        missingCount: system?.missingCount ?? 0,
        crossMonthCount: system?.crossMonthCount ?? 0,
        lagCount: fileEntries.filter((e) => this.isLag(e)).length,
        errorCount: fileEntries.filter((e) => e.isError).length,
        notInSystemCount: fileEntries.filter((e) => e.systemDate === null).length
      };
    });
  }

  /** Desfase: el serial es de un mes anterior al ingreso, o el sistema lo tiene en otro mes. */
  public isLag(entry: ErpSerialEntry): boolean {
    return entry.serialStatus === 'lag' || (!!entry.systemMonth && entry.systemMonth !== entry.entryMonth);
  }

  public selectMonth(month: string): void {
    this.selectedMonth = this.selectedMonth === month ? '' : month;
    this.referenceFilter = null;
    this.applyFilters();
  }

  public setTab(tab: EntryValidationTab): void {
    this.activeTab = tab;
    this.referenceFilter = null;
    this.applyFilters();
  }

  // ============================================================
  //  BÚSQUEDA INTELIGENTE (todas las palabras, en cualquier campo, sin tildes)
  // ============================================================

  public onSearchChange(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.applyFilters(), 250);
  }

  public applyFilters(): void {
    const terms = normalizeText(this.searchTerm).split(/\s+/).filter(Boolean);
    const matches = (haystack: string) => terms.every((term) => haystack.includes(term));
    const month = this.selectedMonth;

    this.missingBySearch = this.missingUnits.filter(
      (unit) => (!month || unit.month === month) && (!terms.length || matches(unit.haystack))
    );
    this.entriesBySearch = this.entries.filter((e) => (!month || e.entryMonth === month) && (!terms.length || matches(e.haystack)));
    this.errorsBySearch = this.entriesBySearch.filter((e) => e.isError);
    this.lagBySearch = this.entriesBySearch.filter((e) => this.isLag(e));
    this.notInSystemBySearch = this.entriesBySearch.filter((e) => e.systemDate === null);

    if (this.activeTab === 'missing') {
      this.referenceSummaries = this.buildReferenceSummaries(this.missingBySearch.map((unit) => this.unitReference(unit)));
      this.filteredMissing = this.referenceFilter
        ? this.missingBySearch.filter((unit) => this.unitReference(unit).key === this.referenceFilter)
        : this.missingBySearch;
      this.filteredEntries = [];
      return;
    }

    const list = this.entriesForTab(this.activeTab);
    this.referenceSummaries = this.buildReferenceSummaries(list.map((e) => this.entryReference(e)));
    this.filteredEntries = this.referenceFilter ? list.filter((e) => this.entryReference(e).key === this.referenceFilter) : list;
    this.filteredMissing = [];
  }

  private entriesForTab(tab: EntryValidationTab): ErpSerialEntry[] {
    if (tab === 'errors') return this.errorsBySearch;
    if (tab === 'lag') return this.lagBySearch;
    if (tab === 'notInSystem') return this.notInSystemBySearch;
    return this.entriesBySearch;
  }

  public clearSearch(): void {
    this.searchTerm = '';
    this.referenceFilter = null;
    this.applyFilters();
  }

  public toggleReferenceFilter(key: string): void {
    this.referenceFilter = this.referenceFilter === key ? null : key;
    this.applyFilters();
  }

  private unitReference(unit: WarehouseEntryMissingUnit): Omit<ReferenceSummary, 'total'> {
    const productCode = (unit.productCode || '').substring(0, 5);
    return {
      key: unit.reference || productCode || 'SIN REFERENCIA',
      reference: unit.reference || '',
      productCode,
      productName: unit.productName || ''
    };
  }

  private entryReference(entry: ErpSerialEntry): Omit<ReferenceSummary, 'total'> {
    return {
      key: entry.productAlt || entry.productCode,
      reference: entry.productAlt,
      productCode: entry.productCode,
      productName: entry.productName
    };
  }

  private buildReferenceSummaries(references: Omit<ReferenceSummary, 'total'>[]): ReferenceSummary[] {
    const byReference = new Map<string, ReferenceSummary>();

    for (const reference of references) {
      const summary = byReference.get(reference.key) || { ...reference, total: 0 };
      summary.total++;
      byReference.set(reference.key, summary);
    }

    return [...byReference.values()].sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
  }

  // ============================================================
  //  DESCARGAS
  // ============================================================

  /** Plano para el ERP: solo los seriales, uno por línea (respeta mes, búsqueda y referencia). */
  public downloadSerials(): void {
    const serials = this.downloadableSerials;
    if (!serials.length) {
      this.toastr.info('No hay seriales para descargar.', 'Sin datos');
      return;
    }

    const blob = new Blob([serials.join('\r\n') + '\r\n'], { type: 'text/plain;charset=utf-8' });
    this.saveBlob(blob, `seriales_no_ingresados_${this.rangeLabel()}.txt`);
  }

  /**
   * Análisis completo en Excel (respeta mes y búsqueda): resumen mensual, no ingresados,
   * seriales con error, desfase de mes y no existentes en el sistema, una hoja por tema.
   */
  public downloadAnalysis(): void {
    if (!this.entries.length) return;

    const workbook = XLSX.utils.book_new();
    const indicators = this.selectedMonth
      ? this.monthIndicators.filter((m) => m.month === this.selectedMonth)
      : [...this.monthIndicators, this.totalIndicator];

    const append = (name: string, rows: object[]) => {
      const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Resultado: 'Sin registros' }]);
      XLSX.utils.book_append_sheet(workbook, sheet, name);
    };

    append(
      'Resumen mensual',
      indicators.map((m) => ({
        Mes: m.month,
        'Archivo ERP': m.fileUnits,
        Sistema: m.systemUnits,
        Diferencia: m.difference,
        'En ERP': m.foundInFile,
        'No ingresados': m.missingCount,
        'Ingreso en otro mes': m.crossMonthCount,
        'Desfase serial': m.lagCount,
        'Seriales con error': m.errorCount,
        'No existen en sistema': m.notInSystemCount,
        'Referencias archivo': m.fileReferences,
        'Referencias sistema': m.systemReferences
      }))
    );

    append(
      'No ingresados',
      this.missingBySearch.map((unit) => ({
        Serial: unit.consecutiveProduct,
        Barcode: unit.barcode,
        Codigo: unit.productCode,
        Referencia: unit.reference || '',
        Producto: unit.productName || '',
        EAN: unit.EAN || '',
        'Mes sistema': unit.month,
        Fecha: unit.date,
        Hora: unit.hour,
        'Vale Summum': unit.packingList?.summum?.document || '',
        'Archivo origen': unit.originalFile || ''
      }))
    );

    append(
      'Seriales con error',
      this.errorsBySearch.map((e) => this.entryExportRow(e))
    );
    append(
      'Desfase de mes',
      this.lagBySearch.map((e) => this.entryExportRow(e))
    );
    append(
      'No existen en sistema',
      this.notInSystemBySearch.map((e) => this.entryExportRow(e))
    );

    XLSX.writeFile(workbook, `validacion_ingreso_bodega_${this.selectedMonth || this.rangeLabel()}.xlsx`);
  }

  private entryExportRow(entry: ErpSerialEntry) {
    return {
      Producto: entry.productCode,
      'Producto Alt': entry.productAlt,
      Nombre: entry.productName,
      Serial: entry.serial,
      'Año serial': entry.serialYear,
      'Mes serial': entry.serialMonth,
      Consecutivo: entry.serialConsecutive,
      'Fecha ingreso ERP': entry.entryDate,
      'Mes ingreso ERP': entry.entryMonth,
      'Fecha sistema': entry.systemDate === null ? 'NO EXISTE' : entry.systemDate || '',
      'Mes sistema': entry.systemMonth === null ? 'NO EXISTE' : entry.systemMonth || '',
      Estado: SERIAL_STATUS_LABELS[entry.serialStatus],
      Observacion: entry.serialIssue,
      Comprobante: entry.voucher,
      Documento: entry.document,
      Tercero: entry.thirdParty,
      'Filas en archivo': entry.rows
    };
  }

  private rangeLabel(): string {
    return `${this.result?.dateIni || this.dateIni}_a_${this.result?.dateEnd || this.dateEnd}`;
  }

  private saveBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  private formatDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  public trackById = (_: number, unit: WarehouseEntryMissingUnit) => unit._id;
  public trackByEntry = (_: number, entry: ErpSerialEntry) => entry.key;
  public trackByKey = (_: number, item: { key?: string; month?: string }) => item.key || item.month;
}
