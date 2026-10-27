// src/app/warehouse/warranty-returns/warranty-returns.ts
//
// Devoluciones / Garantías: reingreso a bodega de seriales que ya salieron (despachados por OC o
// con salida manual), propios o de Importaciones / Externos. Módulo aparte: no reabre el ingreso
// original ni la OC. Bodega recibe (cliente, documento, motivo, estado físico) y el
// administrativo de Bodega cierra con la resolución. Todo queda en la auditoría.
import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnInit, ViewChild, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { finalize } from 'rxjs';

import { ExternalProductsService } from '../../services/external-products.service';
import {
  ExternalAccess,
  WARRANTY_RETURN_CONDITION_LABELS,
  WARRANTY_RETURN_RESOLUTION_LABELS,
  WARRANTY_RETURN_TYPE_LABELS,
  WarrantyReturn,
  WarrantyReturnCondition,
  WarrantyReturnListRequest,
  WarrantyReturnRequest,
  WarrantyReturnResolution,
  WarrantyReturnType
} from '../../interfaces/external-products.interface';
import { parseGs1Barcode } from '../../shared/utils/gs1-barcode.util';

const PAGE_SIZE = 50;

const emptyForm = (): Omit<WarrantyReturnRequest, 'barcode'> => ({
  type: 'WARRANTY',
  customer: '',
  document: '',
  reason: '',
  condition: 'TO_REVIEW',
  observation: ''
});

@Component({
  selector: 'app-warranty-returns',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './warranty-returns.html',
  styleUrl: './warranty-returns.scss'
})
export class WarrantyReturns implements OnInit {
  private readonly externalService = inject(ExternalProductsService);
  private readonly toastr = inject(ToastrService);

  @ViewChild('scanInput') private scanInput?: ElementRef<HTMLInputElement>;

  readonly typeLabels = WARRANTY_RETURN_TYPE_LABELS;
  readonly conditionLabels = WARRANTY_RETURN_CONDITION_LABELS;
  readonly resolutionLabels = WARRANTY_RETURN_RESOLUTION_LABELS;
  readonly types = Object.keys(WARRANTY_RETURN_TYPE_LABELS) as WarrantyReturnType[];
  readonly conditions = Object.keys(WARRANTY_RETURN_CONDITION_LABELS) as WarrantyReturnCondition[];
  readonly resolutions = Object.keys(WARRANTY_RETURN_RESOLUTION_LABELS) as WarrantyReturnResolution[];

  readonly access = signal<ExternalAccess>({ isWarehouseAdmin: false, canManualExit: false });

  // Recepción
  form = emptyForm();
  barcode = '';
  readonly barcodeError = signal('');
  readonly receiving = signal(false);
  readonly lastReceived = signal<{ ret: WarrantyReturn; warnings: string[] } | null>(null);

  // Listado
  filters: WarrantyReturnListRequest = { status: 'RECEIVED', type: '', from: '', to: '', search: '' };
  readonly rows = signal<WarrantyReturn[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(false);
  readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));

  // Cierre
  readonly closeTarget = signal<WarrantyReturn | null>(null);
  readonly closing = signal(false);
  closeResolution: WarrantyReturnResolution = 'RESTOCK';
  closeObservation = '';

  ngOnInit(): void {
    this.externalService.getAccess().subscribe({
      next: (res) => this.access.set(res.data),
      error: () => this.access.set({ isWarehouseAdmin: false, canManualExit: false })
    });
    this.load(1);
    setTimeout(() => this.scanInput?.nativeElement.focus(), 0);
  }

  // ============================================================
  //  RECEPCIÓN
  // ============================================================
  /** Con la pistola: Enter valida el código y pasa al siguiente campo (no envía el formulario). */
  onScanEnter(): void {
    const parsed = parseGs1Barcode(this.barcode);
    if (!parsed.ok) {
      this.barcodeError.set(parsed.msg);
      return;
    }
    this.barcodeError.set('');
    this.barcode = parsed.data.barcode;
    setTimeout(() => document.getElementById('retCustomer')?.focus(), 0);
  }

  receive(): void {
    const parsed = parseGs1Barcode(this.barcode);
    if (!parsed.ok) {
      this.barcodeError.set(parsed.msg);
      return;
    }
    const f = this.form;
    const missing =
      f.customer.trim().length < 3
        ? 'Indique el cliente que devuelve.'
        : f.document.trim().length < 2
          ? 'El documento soporte es obligatorio.'
          : f.reason.trim().length < 5
            ? 'Describa el motivo (mínimo 5 caracteres).'
            : '';
    if (missing) {
      this.toastr.warning(missing, 'Devolución');
      return;
    }

    this.receiving.set(true);
    this.externalService
      .receiveReturn({
        barcode: this.barcode,
        type: f.type,
        customer: f.customer.trim(),
        document: f.document.trim(),
        reason: f.reason.trim(),
        condition: f.condition,
        observation: f.observation?.trim()
      })
      .pipe(finalize(() => this.receiving.set(false)))
      .subscribe({
        next: (res) => {
          this.lastReceived.set({ ret: res.data.return, warnings: res.data.warnings });
          this.toastr.success(res.msg || 'Devolución registrada.', 'Devolución');
          // Se conservan cliente, documento y tipo: suelen llegar varias unidades del mismo soporte
          this.barcode = '';
          this.form = { ...this.form, observation: '' };
          this.load(1);
          setTimeout(() => this.scanInput?.nativeElement.focus(), 0);
        },
        error: (err: Error) => this.toastr.error(err.message, 'Devolución')
      });
  }

  resetForm(): void {
    this.form = emptyForm();
    this.barcode = '';
    this.barcodeError.set('');
    this.lastReceived.set(null);
    setTimeout(() => this.scanInput?.nativeElement.focus(), 0);
  }

  // ============================================================
  //  LISTADO
  // ============================================================
  load(page: number): void {
    this.loading.set(true);
    this.page.set(page);
    const f = this.filters;
    this.externalService
      .listReturns({
        status: f.status || undefined,
        type: f.type || undefined,
        from: f.from || undefined,
        to: f.to || undefined,
        search: f.search?.trim() || undefined,
        page,
        limit: PAGE_SIZE
      })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (res) => {
          this.rows.set(res.data);
          this.total.set(res.total || 0);
        },
        error: (err: Error) => this.toastr.error(err.message, 'Devoluciones')
      });
  }

  // ============================================================
  //  CIERRE (administrativo)
  // ============================================================
  openClose(r: WarrantyReturn): void {
    this.closeResolution = r.condition === 'DAMAGED' ? 'SCRAPPED' : 'RESTOCK';
    this.closeObservation = '';
    this.closeTarget.set(r);
  }

  confirmClose(): void {
    const target = this.closeTarget();
    if (!target) return;
    if (this.closeObservation.trim().length < 5) {
      this.toastr.warning('Describa la resolución (mínimo 5 caracteres).', 'Cerrar devolución');
      return;
    }
    this.closing.set(true);
    this.externalService
      .closeReturn({ returnId: target._id, resolution: this.closeResolution, observation: this.closeObservation.trim() })
      .pipe(finalize(() => this.closing.set(false)))
      .subscribe({
        next: () => {
          this.toastr.success('Devolución cerrada.', 'Cerrar devolución');
          this.closeTarget.set(null);
          this.load(this.page());
        },
        error: (err: Error) => this.toastr.error(err.message, 'Cerrar devolución')
      });
  }

  originLabel(origin: WarrantyReturn['origin']): string {
    return origin === 'OWN' ? 'Propio' : origin === 'EXTERNAL' ? 'Externo' : 'Desconocido';
  }
}
