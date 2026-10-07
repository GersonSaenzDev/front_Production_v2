// src/app/warehouse/entry-validation/entry-validation.ts
import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import * as XLSX from 'xlsx';

import { DashboardServices } from '../../services/dashboard-services';
import { WarehouseEntryMissingUnit, WarehouseEntryValidationResponse } from '../../interfaces/assembly.interface';

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
  haystack: string;
}

interface MissingUnitView extends WarehouseEntryMissingUnit {
  haystack: string;
}

/** Consolidado por referencia de las unidades que no están en el archivo. */
interface MissingReferenceSummary {
  key: string;
  reference: string;
  productCode: string;
  productName: string;
  total: number;
}

type EntryValidationTab = 'missing' | 'file';

/** Encabezados del Excel del ERP → campo. Se buscan normalizados (sin tildes, minúsculas). */
const ERP_COLUMNS: Record<string, keyof Omit<ErpSerialRow, 'haystack'>> = {
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

const normalizeText = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

@Component({
  selector: 'app-entry-validation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './entry-validation.html',
  styleUrl: './entry-validation.scss'
})
export class EntryValidation {
  private readonly dashboardService = inject(DashboardServices);
  private readonly toastr = inject(ToastrService);

  // ============================================================
  //  ARCHIVO DEL ERP
  // ============================================================

  public fileName = '';
  public isReadingFile = false;
  public fileRows: ErpSerialRow[] = [];
  /** Seriales únicos del archivo (un serial aparece una vez por movimiento: traslado, factura...). */
  private fileSerials: string[] = [];

  /** Meses presentes en la columna Fecha, con su cantidad de filas. */
  public monthOptions: { month: string; rows: number; maxDate: string }[] = [];
  public selectedMonth = '';
  public dateIni = '';
  public dateEnd = '';

  // ============================================================
  //  RESULTADO DE LA VALIDACIÓN
  // ============================================================

  public isValidating = false;
  public result: WarehouseEntryValidationResponse['data'] | null = null;
  private missingUnits: MissingUnitView[] = [];

  public activeTab: EntryValidationTab = 'missing';
  public searchTerm = '';
  public referenceFilter: string | null = null;

  public filteredMissing: MissingUnitView[] = [];
  public filteredFileRows: ErpSerialRow[] = [];
  public referenceSummaries: MissingReferenceSummary[] = [];

  get monthStart(): string {
    return this.selectedMonth ? `${this.selectedMonth}-01` : '';
  }

  get monthEnd(): string {
    if (!this.selectedMonth) return '';
    const [year, month] = this.selectedMonth.split('-').map(Number);
    return `${this.selectedMonth}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
  }

  get selectedMonthInfo() {
    return this.monthOptions.find((option) => option.month === this.selectedMonth) || null;
  }

  get downloadableSerials(): string[] {
    return [...new Set(this.filteredMissing.map((unit) => (unit.consecutiveProduct || '').trim()).filter(Boolean))];
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
        this.fileRows = rows;
        this.fileSerials = [...new Set(rows.map((row) => row.serial))];
        this.buildMonthOptions();
        this.toastr.success(
          `${rows.length.toLocaleString()} filas · ${this.fileSerials.length.toLocaleString()} seriales únicos`,
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

      const columns = new Map<number, keyof Omit<ErpSerialRow, 'haystack'>>();
      matrix[headerIndex].forEach((cell, index) => {
        const field = ERP_COLUMNS[normalizeText(cell)];
        if (field && ![...columns.values()].includes(field)) columns.set(index, field);
      });

      const rows: ErpSerialRow[] = [];
      for (const raw of matrix.slice(headerIndex + 1)) {
        const row = { haystack: '' } as ErpSerialRow;
        columns.forEach((field, index) => {
          const value = raw[index];
          row[field] = field === 'date' || field === 'noveltyDate' ? this.toIsoDate(value) : String(value ?? '').trim();
        });

        // Las filas de encabezado por producto (Fecha vacía, sin serial) no son unidades.
        if (!row.serial || !row.date) continue;

        row.haystack = normalizeText(
          [
            row.date,
            row.productCode,
            row.productAlt,
            row.productName,
            row.serial,
            row.nit,
            row.thirdParty,
            row.voucher,
            row.document,
            row.noveltyHour
          ].join(' ')
        );
        rows.push(row);
      }
      return rows;
    }

    return [];
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

  private buildMonthOptions(): void {
    const byMonth = new Map<string, { rows: number; maxDate: string }>();

    for (const row of this.fileRows) {
      const month = row.date.slice(0, 7);
      const entry = byMonth.get(month) || { rows: 0, maxDate: '' };
      entry.rows++;
      if (row.date > entry.maxDate) entry.maxDate = row.date;
      byMonth.set(month, entry);
    }

    this.monthOptions = [...byMonth.entries()].map(([month, entry]) => ({ month, ...entry })).sort((a, b) => b.rows - a.rows);

    this.selectedMonth = this.monthOptions[0]?.month || '';
    this.resetRangeToFile();
  }

  /**
   * Rango por defecto: del día 1 al último día que trae el archivo (corte del reporte del ERP),
   * para no mostrar como faltante lo producido después de que se generó el listado.
   */
  public resetRangeToFile(): void {
    this.dateIni = this.monthStart;
    const maxDate = this.selectedMonthInfo?.maxDate || '';
    this.dateEnd = maxDate && maxDate < this.monthEnd ? maxDate : this.monthEnd;
  }

  public onMonthChange(): void {
    this.resetRangeToFile();
    this.validate();
  }

  // ============================================================
  //  VALIDACIÓN CONTRA LoadBarcode
  // ============================================================

  public validate(): void {
    if (!this.selectedMonth || !this.fileSerials.length) return;

    if (this.dateIni < this.monthStart || this.dateEnd > this.monthEnd || this.dateIni > this.dateEnd) {
      this.toastr.warning(`El rango debe estar dentro de ${this.selectedMonth}.`, 'Rango inválido');
      return;
    }

    this.isValidating = true;

    this.dashboardService
      .validateWarehouseEntry({ month: this.selectedMonth, dateIni: this.dateIni, dateEnd: this.dateEnd, serials: this.fileSerials })
      .subscribe({
        next: (response) => {
          this.isValidating = false;
          this.result = response.data || null;
          this.missingUnits = (response.data?.missing || []).map((unit) => ({
            ...unit,
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
          this.referenceFilter = null;
          this.applyFilters();
        },
        error: (error: Error) => {
          this.isValidating = false;
          this.toastr.error(error.message || 'No se pudo validar el archivo.', 'Error');
        }
      });
  }

  // ============================================================
  //  BÚSQUEDA INTELIGENTE (todas las palabras, en cualquier campo, sin tildes)
  // ============================================================

  public applyFilters(): void {
    const terms = normalizeText(this.searchTerm).split(/\s+/).filter(Boolean);
    const matches = (haystack: string) => terms.every((term) => haystack.includes(term));

    const bySearch = terms.length ? this.missingUnits.filter((unit) => matches(unit.haystack)) : this.missingUnits;
    this.referenceSummaries = this.buildReferenceSummaries(bySearch);
    this.filteredMissing = this.referenceFilter ? bySearch.filter((unit) => this.referenceKey(unit) === this.referenceFilter) : bySearch;

    this.filteredFileRows = terms.length ? this.fileRows.filter((row) => matches(row.haystack)) : this.fileRows;
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

  private referenceKey(unit: WarehouseEntryMissingUnit): string {
    return unit.reference || unit.productCode || 'SIN REFERENCIA';
  }

  private buildReferenceSummaries(units: WarehouseEntryMissingUnit[]): MissingReferenceSummary[] {
    const byReference = new Map<string, MissingReferenceSummary>();

    for (const unit of units) {
      const key = this.referenceKey(unit);
      const summary = byReference.get(key) || {
        key,
        reference: unit.reference || '',
        productCode: unit.productCode || '',
        productName: unit.productName || '',
        total: 0
      };
      summary.total++;
      byReference.set(key, summary);
    }

    return [...byReference.values()].sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
  }

  // ============================================================
  //  DESCARGAS
  // ============================================================

  /** Plano para el ERP: solo los seriales, uno por línea (respeta búsqueda y filtro de referencia). */
  public downloadSerials(): void {
    const serials = this.downloadableSerials;
    if (!serials.length) {
      this.toastr.info('No hay seriales para descargar.', 'Sin datos');
      return;
    }

    const blob = new Blob([serials.join('\r\n') + '\r\n'], { type: 'text/plain;charset=utf-8' });
    this.saveBlob(blob, `seriales_no_ingresados_${this.result?.dateIni}_a_${this.result?.dateEnd}.txt`);
  }

  /** Detalle en Excel de las unidades faltantes (para revisión, no para el ERP). */
  public downloadDetail(): void {
    if (!this.filteredMissing.length) return;

    const sheet = XLSX.utils.json_to_sheet(
      this.filteredMissing.map((unit) => ({
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
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'No ingresados');
    XLSX.writeFile(workbook, `detalle_no_ingresados_${this.result?.dateIni}_a_${this.result?.dateEnd}.xlsx`);
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
  public trackByKey = (_: number, summary: MissingReferenceSummary) => summary.key;
}
