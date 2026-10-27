// src/app/warehouse/external/external-exit/external-exit.ts
//
// Importaciones / Externos > Salida manual (daño, devolución a proveedor, ajuste). Única y
// exclusivamente el Eje de Bodega (backend: EXTERNAL_EXIT_USERS, por defecto LYLEON; la ruta
// la protege externalExitGuard). La salida natural es la OC (prealistamiento -> muelle -> .sal).
//
// Se leen los seriales con la pistola a una lista, se diligencia el soporte y se confirma: el
// backend valida cada serial por separado y devuelve el resultado de cada uno.
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { finalize } from 'rxjs';

import { ExternalProductsService } from '../../../services/external-products.service';
import {
  EXTERNAL_EXIT_TYPE_LABELS,
  ExternalApiResponse,
  ExternalExitType,
  ExternalManualExitResult
} from '../../../interfaces/external-products.interface';
import { parseGs1Barcode } from '../../../shared/utils/gs1-barcode.util';

const MAX_BATCH = 200;

interface ExitItem {
  raw: string;
  barcode: string;
}

@Component({
  selector: 'app-external-exit',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './external-exit.html',
  styleUrl: './external-exit.scss'
})
export class ExternalExit implements OnInit {
  private readonly externalService = inject(ExternalProductsService);
  private readonly toastr = inject(ToastrService);

  @ViewChild('scanInput') private scanInput?: ElementRef<HTMLInputElement>;

  readonly exitTypeLabels = EXTERNAL_EXIT_TYPE_LABELS;
  readonly exitTypes = Object.keys(EXTERNAL_EXIT_TYPE_LABELS) as ExternalExitType[];

  readonly items = signal<ExitItem[]>([]);
  readonly submitting = signal(false);
  readonly result = signal<ExternalManualExitResult | null>(null);
  readonly showConfirm = signal(false);

  exitType: ExternalExitType = 'DAMAGE';
  document = '';
  observation = '';

  ngOnInit(): void {
    this.focusScan();
  }

  onScanSubmit(): void {
    const input = this.scanInput?.nativeElement;
    const raw = (input?.value || '').trim();
    if (input) input.value = '';
    if (!raw) return;

    const parsed = parseGs1Barcode(raw);
    if (!parsed.ok) {
      this.toastr.warning(parsed.msg, 'Código no válido');
      return;
    }
    if (this.items().some((i) => i.barcode === parsed.data.barcode)) {
      this.toastr.info('Ese serial ya está en la lista.', 'Repetido');
      return;
    }
    if (this.items().length >= MAX_BATCH) {
      this.toastr.warning(`Máximo ${MAX_BATCH} seriales por salida.`, 'Salida manual');
      return;
    }
    this.result.set(null);
    this.items.update((list) => [{ raw: raw.slice(0, 120), barcode: parsed.data.barcode }, ...list]);
  }

  remove(barcode: string): void {
    this.items.update((list) => list.filter((i) => i.barcode !== barcode));
    this.focusScan();
  }

  openConfirm(): void {
    if (!this.items().length) {
      this.toastr.warning('Lea al menos un serial.', 'Salida manual');
      return;
    }
    if (this.document.trim().length < 2) {
      this.toastr.warning('El documento soporte es obligatorio.', 'Salida manual');
      return;
    }
    if (this.observation.trim().length < 5) {
      this.toastr.warning('Describa el motivo (mínimo 5 caracteres).', 'Salida manual');
      return;
    }
    this.showConfirm.set(true);
  }

  confirm(): void {
    this.submitting.set(true);
    this.externalService
      .manualExit({
        barcodes: this.items().map((i) => i.raw),
        exitType: this.exitType,
        document: this.document.trim(),
        observation: this.observation.trim()
      })
      .pipe(
        finalize(() => {
          this.submitting.set(false);
          this.showConfirm.set(false);
        })
      )
      .subscribe({
        next: (res) => this.applyResult(res),
        error: (err: unknown) => {
          const body = err instanceof HttpErrorResponse ? (err.error as ExternalApiResponse<ExternalManualExitResult> | null) : null;
          if (body?.data?.results) {
            this.applyResult(body);
            return;
          }
          this.toastr.error(body?.msg || 'No se pudo registrar la salida.', 'Salida manual');
        }
      });
  }

  /** Quedan en la lista solo los seriales que NO salieron, para corregir y reintentar. */
  private applyResult(res: ExternalApiResponse<ExternalManualExitResult>): void {
    const data = res.data;
    this.result.set(data);
    const failed = new Set(data.results.filter((r) => !r.ok).map((r) => r.barcode));
    this.items.update((list) => list.filter((i) => failed.has(i.barcode)));
    if (data.done) this.toastr.success(res.msg || 'Salida registrada.', 'Salida manual');
    if (data.failed) this.toastr.warning(`${data.failed} serial(es) no tuvieron salida. Revise el detalle.`, 'Salida manual');
    if (!data.failed) {
      this.document = '';
      this.observation = '';
    }
    this.focusScan();
  }

  focusScan(): void {
    setTimeout(() => this.scanInput?.nativeElement.focus(), 0);
  }
}
