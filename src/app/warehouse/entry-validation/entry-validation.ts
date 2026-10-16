// src/app/warehouse/entry-validation/entry-validation.ts
import { CommonModule } from '@angular/common';
import { Component, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import * as XLSX from 'xlsx';

import { DashboardServices } from '../../services/dashboard-services';
import {
  WarehouseEntryDaySummary,
  WarehouseEntryMissingUnit,
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
  /** Fecha en que entró al sistema (LoadBarcode). null = no existe; '' = sin validar. */
  systemDate: string | null;
  haystack: string;
}

interface MissingUnitView extends WarehouseEntryMissingUnit {
  day: string;
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

/** Fila del indicador diario: archivo (fecha de ingreso ERP) vs sistema (escaneado ese mismo día). */
interface DayIndicator {
  date: string;
  fileUnits: number;
  fileReferences: number;
  systemUnits: number;
  systemReferences: number;
  difference: number;
  foundInFile: number;
  missingCount: number;
  otherDayCount: number;
  notInSystemCount: number;
  errorCount: number;
  lagCount: number;
}

type EntryValidationTab = 'missing' | 'otherDay' | 'notInSystem' | 'errors' | 'lag' | 'file';

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

/** La pestaña "Archivo ERP" puede traer miles de unidades: se pinta solo este tope. */
const FILE_RENDER_LIMIT = 2000;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Archivo .sal de Producción para cargar en Summum (validado contra los .sal procesados), una línea
 * por unidad, 92 caracteres entre comillas + CRLF, sin espacio después de la comilla de cierre:
 *
 *   "2  161026.07   010770606003402521261002191                                  1  09011307:58"
 *
 *   Tipo de registro '2' · 2 esp · fecha lectura ddMMyy.HH · 3 esp · barcode 27 dígitos ·
 *   cantidad '1' alineada a la derecha en 35 · 2 esp · '090113' (fijo) + hora lectura HH:mm
 */
const SUMMUM_SAL_PREFIX = '090113';
const SUMMUM_SAL_LINE = /^"2 {2}\d{6}\.\d{2} {3}\d{27} {34}1 {2}090113\d{2}:\d{2}"$/;

const normalizeText = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Días entre dos fechas YYYY-MM-DD (b - a). */
const daysBetween = (a: string, b: string): number => Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);

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
  /**
   * Fechas de ingreso (columna Fecha) del archivo. Solo esas se validan, cada una contra lo
   * escaneado ese mismo día (ej. archivo de viernes + sábado: viernes vs viernes, sábado vs sábado).
   */
  public fileDates: string[] = [];
  /** Filtro de día para la vista ('' = todas las fechas del archivo). */
  public selectedDate = '';

  // ============================================================
  //  RESULTADO DE LA VALIDACIÓN
  // ============================================================

  public isValidating = false;
  public result: WarehouseEntryValidationResponse['data'] | null = null;
  private missingUnits: MissingUnitView[] = [];
  public dayIndicators: DayIndicator[] = [];

  public activeTab: EntryValidationTab = 'missing';
  public searchTerm = '';
  public referenceFilter: string | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  // Listas por pestaña (día + búsqueda), y la de la pestaña activa con filtro de referencia.
  public missingBySearch: MissingUnitView[] = [];
  public otherDayBySearch: ErpSerialEntry[] = [];
  public notInSystemBySearch: ErpSerialEntry[] = [];
  public errorsBySearch: ErpSerialEntry[] = [];
  public lagBySearch: ErpSerialEntry[] = [];
  public entriesBySearch: ErpSerialEntry[] = [];

  public filteredMissing: MissingUnitView[] = [];
  public filteredEntries: ErpSerialEntry[] = [];
  public referenceSummaries: ReferenceSummary[] = [];

  get dayIndicator(): DayIndicator | null {
    if (!this.dayIndicators.length) return null;
    if (this.selectedDate) return this.dayIndicators.find((d) => d.date === this.selectedDate) || null;
    return this.totalIndicator;
  }

  /** Totales de todas las fechas (las referencias se cuentan únicas, no sumadas). */
  get totalIndicator(): DayIndicator {
    const sum = (field: keyof DayIndicator) => this.dayIndicators.reduce((acc, d) => acc + Number(d[field]), 0);
    return {
      date: 'Total',
      fileUnits: sum('fileUnits'),
      fileReferences: new Set(this.entries.map((e) => e.productCode)).size,
      systemUnits: sum('systemUnits'),
      systemReferences: this.result?.totals.references ?? 0,
      difference: sum('difference'),
      foundInFile: sum('foundInFile'),
      missingCount: sum('missingCount'),
      otherDayCount: sum('otherDayCount'),
      notInSystemCount: sum('notInSystemCount'),
      errorCount: sum('errorCount'),
      lagCount: sum('lagCount')
    };
  }

  /** Unidades del plano para Summum: una por barcode de 27 dígitos (respeta día, búsqueda y referencia). */
  get downloadableUnits(): MissingUnitView[] {
    const seen = new Set<string>();
    return this.filteredMissing.filter((unit) => {
      const barcode = (unit.barcode || '').trim();
      if (seen.has(barcode)) return false;
      seen.add(barcode);
      return true;
    });
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
        this.fileDates = [...new Set(this.entries.map((e) => e.entryDate))].sort();
        this.selectedDate = '';
        this.result = null;
        this.missingUnits = [];
        this.dayIndicators = [];

        const errors = this.entries.filter((e) => e.isError).length;
        this.toastr.success(
          `${rows.length.toLocaleString()} filas · ${this.entries.length.toLocaleString()} unidades · ${this.fileDates.length} fecha(s)` +
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
        entry.systemDate,
        entry.systemDate === null ? 'no existe' : this.isOtherDay(entry) ? 'otro dia' : ''
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

  // ============================================================
  //  VALIDACIÓN CONTRA LoadBarcode (día por día, solo las fechas del archivo)
  // ============================================================

  public validate(): void {
    if (!this.entries.length) return;

    this.isValidating = true;

    this.dashboardService
      .validateWarehouseEntry({
        dates: this.fileDates,
        items: this.entries.map((entry) => [entry.key, entry.entryDate] as [string, string])
      })
      .subscribe({
        next: (response) => {
          this.isValidating = false;
          this.result = response.data || null;
          this.applyValidationResult();
          if (this.result?.lookupSkipped) {
            this.toastr.info(
              'Demasiados seriales del archivo sin escanear en sus fechas: no se buscó en qué otro día entraron al sistema.',
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

  /** Marca en cada unidad del archivo en qué fecha entró al sistema y arma los indicadores por día. */
  private applyValidationResult(): void {
    const data = this.result;
    if (!data) return;

    const crossDay = new Map(data.crossDay.map((unit) => [unit.key, unit]));
    const outOfRange = new Map(data.notInRange.map((item) => [item.key, item]));

    for (const entry of this.entries) {
      const cross = crossDay.get(entry.key);
      const outside = outOfRange.get(entry.key);

      if (cross) entry.systemDate = cross.systemDate;
      // Búsqueda omitida: no se sabe si existe (queda '' = sin validar).
      else if (outside) entry.systemDate = outside.systemDate ?? (data.lookupSkipped ? '' : null);
      else entry.systemDate = entry.entryDate;
      entry.haystack = this.entryHaystack(entry);
    }

    this.missingUnits = data.missing.map((unit) => ({
      ...unit,
      day: String(unit.date || ''),
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

    this.dayIndicators = this.buildDayIndicators(data.days);
    this.referenceFilter = null;
    this.applyFilters();
  }

  private buildDayIndicators(systemDays: WarehouseEntryDaySummary[]): DayIndicator[] {
    return this.fileDates.map((date) => {
      const system = systemDays.find((d) => d.date === date);
      const fileEntries = this.entries.filter((e) => e.entryDate === date);
      const fileUnits = fileEntries.length;
      return {
        date,
        fileUnits,
        fileReferences: new Set(fileEntries.map((e) => e.productCode)).size,
        systemUnits: system?.systemUnits ?? 0,
        systemReferences: system?.references ?? 0,
        difference: fileUnits - (system?.systemUnits ?? 0),
        foundInFile: system?.foundInFile ?? 0,
        missingCount: system?.missingCount ?? 0,
        otherDayCount: fileEntries.filter((e) => this.isOtherDay(e)).length,
        notInSystemCount: fileEntries.filter((e) => e.systemDate === null).length,
        errorCount: fileEntries.filter((e) => e.isError).length,
        lagCount: fileEntries.filter((e) => this.isLag(e)).length
      };
    });
  }

  /** En el archivo, pero el sistema lo escaneó otro día (informativo, no va al plano). */
  public isOtherDay(entry: ErpSerialEntry): boolean {
    return !!entry.systemDate && entry.systemDate !== entry.entryDate;
  }

  /** Días entre el ingreso al ERP y el escaneo (negativo = se escaneó antes del ingreso). */
  public dayGap(entry: ErpSerialEntry): number {
    return entry.systemDate ? daysBetween(entry.entryDate, entry.systemDate) : 0;
  }

  /** Desfase: el serial (AAMM) es de un mes anterior al de ingreso en el ERP. */
  public isLag(entry: ErpSerialEntry): boolean {
    return entry.serialStatus === 'lag';
  }

  public selectDate(date: string): void {
    this.selectedDate = this.selectedDate === date ? '' : date;
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
    const day = this.selectedDate;

    this.missingBySearch = this.missingUnits.filter((unit) => (!day || unit.day === day) && (!terms.length || matches(unit.haystack)));
    this.entriesBySearch = this.entries.filter((e) => (!day || e.entryDate === day) && (!terms.length || matches(e.haystack)));
    this.otherDayBySearch = this.entriesBySearch.filter((e) => this.isOtherDay(e));
    this.notInSystemBySearch = this.entriesBySearch.filter((e) => e.systemDate === null);
    this.errorsBySearch = this.entriesBySearch.filter((e) => e.isError);
    this.lagBySearch = this.entriesBySearch.filter((e) => this.isLag(e));

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
    if (tab === 'otherDay') return this.otherDayBySearch;
    if (tab === 'notInSystem') return this.notInSystemBySearch;
    if (tab === 'errors') return this.errorsBySearch;
    if (tab === 'lag') return this.lagBySearch;
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

  /**
   * Plano .sal para Summum con las unidades escaneadas en las fechas del archivo que NO están en él
   * (respeta día, búsqueda y referencia). Cada línea lleva el barcode de 27 dígitos y la fecha/hora
   * de su lectura; el nombre lleva el momento de generación. Si una sola línea no cumple la
   * estructura, el archivo NO se genera.
   */
  public downloadSummumSal(): void {
    const units = this.downloadableUnits;
    if (!units.length) {
      this.toastr.info('No hay unidades para generar el archivo.', 'Sin datos');
      return;
    }

    const errors: string[] = [];
    const lines = units.map((unit, i) => {
      const line = this.buildSummumSalLine(unit);
      if (!line) errors.push(`Línea ${i + 1} (${unit.barcode || unit.consecutiveProduct || 'sin barcode'})`);
      return line;
    });

    if (errors.length) {
      this.toastr.error(
        `${errors.length} unidad(es) sin barcode de 27 dígitos o sin fecha/hora válida: ${errors.slice(0, 3).join(', ')}` +
          (errors.length > 3 ? '...' : ''),
        'Archivo .sal NO generado',
        { timeOut: 10000 }
      );
      return;
    }

    const now = new Date();
    const stamp = `${this.formatDate(now).replace(/-/g, '')}_${[now.getHours(), now.getMinutes(), now.getSeconds()]
      .map((n) => String(n).padStart(2, '0'))
      .join('')}`;
    const blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/plain' });
    this.saveBlob(blob, `CargueBodega_${stamp}.sal`);
    this.toastr.success(`${lines.length.toLocaleString()} unidades.`, 'Archivo .sal generado');
  }

  /** Línea del .sal (null si el barcode no es de 27 dígitos o la fecha/hora de lectura no es válida). */
  private buildSummumSalLine(unit: WarehouseEntryMissingUnit): string | null {
    const barcode = (unit.barcode || '').trim();
    const date = String(unit.date || '').match(/^\d{2}(\d{2})-(\d{2})-(\d{2})$/);
    const hour = String(unit.hour || '').match(/^(\d{2}):(\d{2})/);
    if (!/^\d{27}$/.test(barcode) || !date || !hour) return null;

    const [, yy, mm, dd] = date;
    const [, hh, min] = hour;
    const line = `"2  ${dd}${mm}${yy}.${hh}   ${barcode}${'1'.padStart(35, ' ')}  ${SUMMUM_SAL_PREFIX}${hh}:${min}"`;
    return SUMMUM_SAL_LINE.test(line) ? line : null;
  }

  /**
   * Análisis completo en Excel (respeta día y búsqueda): resumen por día, no ingresados, escaneados
   * otro día, no existentes en el sistema, seriales con error y desfase, una hoja por tema.
   */
  public downloadAnalysis(): void {
    if (!this.entries.length) return;

    const workbook = XLSX.utils.book_new();
    const indicators = this.selectedDate
      ? this.dayIndicators.filter((d) => d.date === this.selectedDate)
      : [...this.dayIndicators, this.totalIndicator];

    const append = (name: string, rows: object[]) => {
      const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Resultado: 'Sin registros' }]);
      XLSX.utils.book_append_sheet(workbook, sheet, name);
    };

    append(
      'Resumen por dia',
      indicators.map((d) => ({
        Fecha: d.date,
        'Archivo ERP': d.fileUnits,
        Sistema: d.systemUnits,
        Diferencia: d.difference,
        'En archivo': d.foundInFile,
        'No ingresados': d.missingCount,
        'Escaneados otro dia': d.otherDayCount,
        'No existen en sistema': d.notInSystemCount,
        'Seriales con error': d.errorCount,
        'Desfase serial': d.lagCount,
        'Referencias archivo': d.fileReferences,
        'Referencias sistema': d.systemReferences
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
        Fecha: unit.date,
        Hora: unit.hour,
        'Vale Summum': unit.packingList?.summum?.document || '',
        'Archivo origen': unit.originalFile || ''
      }))
    );

    append(
      'Escaneados otro dia',
      this.otherDayBySearch.map((e) => this.entryExportRow(e))
    );
    append(
      'No existen en sistema',
      this.notInSystemBySearch.map((e) => this.entryExportRow(e))
    );
    append(
      'Seriales con error',
      this.errorsBySearch.map((e) => this.entryExportRow(e))
    );
    append(
      'Desfase serial',
      this.lagBySearch.map((e) => this.entryExportRow(e))
    );

    XLSX.writeFile(workbook, `validacion_ingreso_bodega_${this.selectedDate || this.datesLabel()}.xlsx`);
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
      'Fecha sistema': entry.systemDate === null ? 'NO EXISTE' : entry.systemDate || '',
      'Dias de diferencia': this.isOtherDay(entry) ? this.dayGap(entry) : '',
      Estado: SERIAL_STATUS_LABELS[entry.serialStatus],
      Observacion: entry.serialIssue,
      Comprobante: entry.voucher,
      Documento: entry.document,
      Tercero: entry.thirdParty,
      'Filas en archivo': entry.rows
    };
  }

  private datesLabel(): string {
    const dates = this.fileDates;
    return dates.length > 1 ? `${dates[0]}_a_${dates[dates.length - 1]}` : dates[0] || '';
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
  public trackByKey = (_: number, item: { key?: string; date?: string }) => item.key || item.date;
}
