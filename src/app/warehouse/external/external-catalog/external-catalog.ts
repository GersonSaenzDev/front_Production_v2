// src/app/warehouse/external/external-catalog/external-catalog.ts
//
// Importaciones / Externos > Catálogo. Productos por GTIN (13 o 14 dígitos) con su referencia,
// producto Summum (con el que la OC los pide), cliente, categoría y características.
// Se crean a mano o por Excel (administrativos de Bodega). Los GTIN leídos en el Ingreso que
// aún no están aquí se listan como "No identificados": al crearlos, sus unidades se completan.
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { finalize } from 'rxjs';
import * as XLSX from 'xlsx';

import { ExternalProductsService } from '../../../services/external-products.service';
import {
  ExternalAccess,
  ExternalApiResponse,
  ExternalImportResult,
  ExternalProduct,
  ExternalProductRequest,
  ExternalUnidentifiedGtin
} from '../../../interfaces/external-products.interface';
import { isValidGtin } from '../../../shared/utils/gs1-barcode.util';

const COMPANY_GTIN14_PREFIX = '07706060';
const TEMPLATE_HEADERS = [
  'GTIN',
  'REFERENCIA',
  'DESCRIPCION',
  'PRODUCTO SUMMUM',
  'CATEGORIA',
  'CLIENTE',
  'ORIGEN',
  'PROVEEDOR',
  'FABRICADO EN',
  'COLOR',
  'VOLTAJE',
  'ESPECIFICACIONES'
];

const emptyForm = (): ExternalProductRequest => ({
  gtin: '',
  reference: '',
  productName: '',
  summumProduct: '',
  category: '',
  client: '',
  origin: 'IMPORTACION',
  supplier: '',
  manufacturedIn: '',
  color: '',
  voltage: '',
  specs: '',
  active: true
});

@Component({
  selector: 'app-external-catalog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './external-catalog.html',
  styleUrl: './external-catalog.scss'
})
export class ExternalCatalog implements OnInit {
  private readonly externalService = inject(ExternalProductsService);
  private readonly toastr = inject(ToastrService);

  readonly access = signal<ExternalAccess>({ isWarehouseAdmin: false, canManualExit: false });
  readonly products = signal<ExternalProduct[]>([]);
  readonly unidentified = signal<ExternalUnidentifiedGtin[]>([]);
  readonly loading = signal(false);
  search = '';
  includeInactive = false;

  // Formulario
  readonly showForm = signal(false);
  readonly saving = signal(false);
  readonly editing = signal(false);
  form: ExternalProductRequest = emptyForm();

  // Excel
  readonly importing = signal(false);
  readonly importResult = signal<ExternalImportResult | null>(null);

  readonly categories = computed(() =>
    [
      ...new Set(
        this.products()
          .map((p) => p.category)
          .filter(Boolean)
      )
    ].sort()
  );
  readonly clients = computed(() =>
    [
      ...new Set(
        this.products()
          .map((p) => p.client)
          .filter(Boolean)
      )
    ].sort()
  );

  ngOnInit(): void {
    this.externalService.getAccess().subscribe({
      next: (res) => this.access.set(res.data),
      error: () => this.access.set({ isWarehouseAdmin: false, canManualExit: false })
    });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.externalService
      .listProducts(this.search.trim(), this.includeInactive)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (res) => {
          this.products.set(res.data.products);
          this.unidentified.set(res.data.unidentified);
        },
        error: (err: Error) => this.toastr.error(err.message, 'Catálogo externos')
      });
  }

  // ============================================================
  //  FORMULARIO
  // ============================================================
  openNew(gtin = ''): void {
    this.form = { ...emptyForm(), gtin };
    this.onGtinChange();
    this.editing.set(false);
    this.showForm.set(true);
  }

  openEdit(p: ExternalProduct): void {
    this.form = {
      gtin: p.gtin14,
      reference: p.reference,
      productName: p.productName,
      summumProduct: p.summumProduct,
      category: p.category,
      client: p.client,
      origin: p.origin,
      supplier: p.supplier,
      manufacturedIn: p.manufacturedIn,
      color: p.color,
      voltage: p.voltage,
      specs: p.specs,
      active: p.active
    };
    this.editing.set(true);
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
  }

  /** Sugiere el producto Summum desde el GTIN de la compañía (770 6060 XXXXX + verificador). */
  onGtinChange(): void {
    const digits = this.form.gtin.replace(/\D/g, '');
    if (!/^\d{13,14}$/.test(digits) || this.form.summumProduct) return;
    const gtin14 = digits.padStart(14, '0');
    if (gtin14.startsWith(COMPANY_GTIN14_PREFIX)) this.form.summumProduct = gtin14.substring(8, 13);
  }

  gtinWarning(): string {
    const digits = this.form.gtin.replace(/\D/g, '');
    if (!digits) return '';
    if (!/^\d{13,14}$/.test(digits)) return 'Debe tener 13 o 14 dígitos.';
    return isValidGtin(digits.padStart(14, '0'))
      ? ''
      : 'Dígito verificador inválido: revise el número (solo se acepta si la pistola ya leyó ese GTIN).';
  }

  save(): void {
    if (!this.form.reference.trim()) {
      this.toastr.warning('La referencia es obligatoria.', 'Catálogo');
      return;
    }
    this.saving.set(true);
    this.externalService
      .saveProduct({ ...this.form, gtin: this.form.gtin.replace(/\D/g, '') })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (res) => {
          const extra = res.data.unitsUpdated ? ` ${res.data.unitsUpdated} unidad(es) actualizadas.` : '';
          this.toastr.success(`${res.msg}${extra}`, 'Catálogo');
          this.showForm.set(false);
          this.load();
        },
        error: (err: Error) => this.toastr.error(err.message, 'Catálogo')
      });
  }

  // ============================================================
  //  EXCEL
  // ============================================================
  downloadTemplate(): void {
    const sample = [
      TEMPLATE_HEADERS,
      [
        '7706060029212',
        'CRIX60X',
        'Campana extractora o recirculadora',
        '02921',
        'CAMPANA',
        'ABBA',
        'IMPORTACION',
        'INDUSEL S.A.S',
        'RPC',
        'ACERO INOXIDABLE',
        '120V / 60Hz',
        ''
      ],
      [
        '7706060000495',
        'ST 200-2N QL',
        'Cocina de 2 puestos a gas',
        '',
        'ESTUFA',
        'CLIENTE',
        'MAQUILA',
        '',
        'COLOMBIA',
        'MOTEADO',
        '',
        'GN 20 mbar'
      ]
    ];
    const ws = XLSX.utils.aoa_to_sheet(sample);
    // GTIN como texto para que Excel no lo pase a notación científica
    for (let r = 1; r < sample.length; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
      if (cell) cell.t = 's';
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Catalogo');
    XLSX.writeFile(wb, 'plantilla_catalogo_externos.xlsx');
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!/\.xlsx?$/i.test(file.name)) {
      this.toastr.warning('Seleccione un archivo Excel (.xlsx).', 'Catálogo');
      return;
    }
    this.importing.set(true);
    this.importResult.set(null);
    this.externalService
      .importProducts(file)
      .pipe(finalize(() => this.importing.set(false)))
      .subscribe({
        next: (res) => {
          this.importResult.set(res.data);
          this.toastr.success(res.msg || 'Catálogo cargado.', 'Catálogo');
          this.load();
        },
        error: (err: unknown) => {
          const body = err instanceof HttpErrorResponse ? (err.error as ExternalApiResponse<ExternalImportResult> | null) : null;
          if (body?.data?.results) this.importResult.set(body.data);
          this.toastr.error(body?.msg || 'No se pudo cargar el archivo.', 'Catálogo');
        }
      });
  }

  importFailures(r: ExternalImportResult) {
    return r.results.filter((x) => !x.ok);
  }

  features(p: ExternalProduct): string {
    return [p.color, p.voltage, p.manufacturedIn].filter((v) => !!v).join(' · ');
  }

  importOk(r: ExternalImportResult): number {
    return r.results.filter((x) => x.ok).length;
  }
}
