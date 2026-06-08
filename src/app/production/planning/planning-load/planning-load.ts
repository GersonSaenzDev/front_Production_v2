// app/production/planning/planning-load/planning-load.ts
import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { finalize } from 'rxjs';
import {
  MonthlyPlanningPayload,
  MonthlyPlanningResponse,
  WeeklyPlanningPayload,
  WeeklyPlanningResponse
} from '../../../interfaces/planning.interface';
import { PlanningService } from '../../../services/planning.service';

type PlanningTab = 'monthly' | 'weekly';

/** Resumen del último cargue exitoso, para mostrar el feedback al usuario. */
interface PlanningResultSummary {
  type: PlanningTab;
  message: string;
  metrics: { label: string; value: number }[];
}

@Component({
  selector: 'app-planning-load',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './planning-load.html',
  styleUrls: ['./planning-load.scss']
})
export class PlanningLoad implements OnInit {
  private fb = inject(FormBuilder);
  private planningService = inject(PlanningService);
  private toastr = inject(ToastrService);

  /** Pestaña activa: programa mensual o ajuste semanal. */
  activeTab: PlanningTab = 'monthly';

  /** Archivos seleccionados por cada formulario (no viven en el FormControl). */
  monthlyFile: File | null = null;
  weeklyFile: File | null = null;

  isSubmittingMonthly = false;
  isSubmittingWeekly = false;

  /** Resumen del último cargue para el panel de resultado. */
  lastResult: PlanningResultSummary | null = null;

  monthlyForm!: FormGroup;
  weeklyForm!: FormGroup;

  readonly months = [
    { value: 1, name: 'ENERO' },
    { value: 2, name: 'FEBRERO' },
    { value: 3, name: 'MARZO' },
    { value: 4, name: 'ABRIL' },
    { value: 5, name: 'MAYO' },
    { value: 6, name: 'JUNIO' },
    { value: 7, name: 'JULIO' },
    { value: 8, name: 'AGOSTO' },
    { value: 9, name: 'SEPTIEMBRE' },
    { value: 10, name: 'OCTUBRE' },
    { value: 11, name: 'NOVIEMBRE' },
    { value: 12, name: 'DICIEMBRE' }
  ];

  /** Extensiones de Excel aceptadas por el input de archivo. */
  readonly acceptedFiles = '.xlsx,.xls';

  ngOnInit(): void {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    this.monthlyForm = this.fb.group({
      planningMonth: [currentMonth, Validators.required],
      planningYear: [currentYear, [Validators.required, Validators.min(2020)]],
      planningLabel: [this.buildLabel(currentMonth, currentYear), Validators.required]
    });

    this.weeklyForm = this.fb.group({
      planningMonth: [currentMonth, Validators.required],
      planningYear: [currentYear, [Validators.required, Validators.min(2020)]],
      weekStart: ['', Validators.required],
      weekEnd: ['', Validators.required],
      observation: [''],
      planningLabel: [this.buildLabel(currentMonth, currentYear), Validators.required]
    });

    // Mantiene la etiqueta sincronizada con mes/año en ambos formularios.
    this.bindLabelSync(this.monthlyForm);
    this.bindLabelSync(this.weeklyForm);
  }

  /** Construye una etiqueta tipo "JUNIO 2026" a partir de mes/año. */
  private buildLabel(month: number, year: number | string): string {
    const found = this.months.find((m) => m.value === Number(month));
    return found ? `${found.name} ${year}` : '';
  }

  /** Recalcula `planningLabel` cuando cambian mes o año. */
  private bindLabelSync(form: FormGroup): void {
    ['planningMonth', 'planningYear'].forEach((control) => {
      form.get(control)?.valueChanges.subscribe(() => {
        const label = this.buildLabel(form.get('planningMonth')?.value, form.get('planningYear')?.value);
        form.get('planningLabel')?.setValue(label, { emitEvent: false });
      });
    });
  }

  setTab(tab: PlanningTab): void {
    this.activeTab = tab;
  }

  // =======================
  //  MANEJO DE ARCHIVOS
  // =======================
  onFileSelected(event: Event, tab: PlanningTab): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.assignFile(file, tab);
  }

  onFileDropped(event: DragEvent, tab: PlanningTab): void {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer?.files?.[0] ?? null;
    this.assignFile(file, tab);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  private assignFile(file: File | null, tab: PlanningTab): void {
    if (file && !this.isExcel(file)) {
      this.toastr.warning('Solo se permiten archivos de Excel (.xlsx, .xls).', 'Archivo no válido');
      return;
    }
    if (tab === 'monthly') {
      this.monthlyFile = file;
    } else {
      this.weeklyFile = file;
    }
  }

  clearFile(tab: PlanningTab): void {
    if (tab === 'monthly') {
      this.monthlyFile = null;
    } else {
      this.weeklyFile = null;
    }
  }

  private isExcel(file: File): boolean {
    return /\.(xlsx|xls)$/i.test(file.name);
  }

  /** Formatea el tamaño del archivo para mostrarlo legible. */
  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  // =======================
  //  ENVÍO MENSUAL
  // =======================
  onSubmitMonthly(): void {
    if (this.monthlyForm.invalid) {
      this.monthlyForm.markAllAsTouched();
      this.toastr.warning('Complete los campos obligatorios.', 'Datos incompletos');
      return;
    }
    if (!this.monthlyFile) {
      this.toastr.warning('Seleccione el archivo del programa mensual.', 'Archivo requerido');
      return;
    }

    const raw = this.monthlyForm.value;
    const payload: MonthlyPlanningPayload = {
      planningFile: this.monthlyFile,
      planningMonth: String(raw.planningMonth),
      planningYear: String(raw.planningYear),
      planningLabel: raw.planningLabel
    };

    this.isSubmittingMonthly = true;
    this.planningService
      .uploadMonthlyPlanning(payload)
      .pipe(finalize(() => (this.isSubmittingMonthly = false)))
      .subscribe({
        next: (res: MonthlyPlanningResponse) => {
          this.toastr.success(res.msg, 'Planeación mensual cargada');
          this.lastResult = {
            type: 'monthly',
            message: res.msg,
            metrics: [
              { label: 'Creadas', value: res.upsertedCount },
              { label: 'Actualizadas', value: res.modifiedCount },
              { label: 'Total registros', value: res.totalRecords }
            ]
          };
          this.clearFile('monthly');
        },
        error: (err: Error) => this.toastr.error(err.message, 'Error al cargar')
      });
  }

  // =======================
  //  ENVÍO SEMANAL
  // =======================
  onSubmitWeekly(): void {
    if (this.weeklyForm.invalid) {
      this.weeklyForm.markAllAsTouched();
      this.toastr.warning('Complete los campos obligatorios.', 'Datos incompletos');
      return;
    }
    if (!this.weeklyFile) {
      this.toastr.warning('Seleccione el archivo del ajuste semanal.', 'Archivo requerido');
      return;
    }

    const raw = this.weeklyForm.value;
    const payload: WeeklyPlanningPayload = {
      planningFile: this.weeklyFile,
      planningMonth: String(raw.planningMonth),
      planningYear: String(raw.planningYear),
      weekStart: raw.weekStart,
      weekEnd: raw.weekEnd,
      observation: raw.observation || '',
      planningLabel: raw.planningLabel
    };

    this.isSubmittingWeekly = true;
    this.planningService
      .uploadWeeklyPlanning(payload)
      .pipe(finalize(() => (this.isSubmittingWeekly = false)))
      .subscribe({
        next: (res: WeeklyPlanningResponse) => {
          this.toastr.success(res.msg, 'Ajuste semanal aplicado');
          this.lastResult = {
            type: 'weekly',
            message: res.msg,
            metrics: [
              { label: 'Días ajustados', value: res.adjustedDays },
              { label: 'Días agregados', value: res.addedDays },
              { label: 'Planes creados', value: res.createdPlans },
              { label: 'Sin cambios', value: res.unchangedDays },
              { label: 'Total registros', value: res.totalRecords },
              { label: 'Fuera de rango', value: res.skippedOutOfRange }
            ]
          };
          this.clearFile('weekly');
        },
        error: (err: Error) => this.toastr.error(err.message, 'Error al cargar')
      });
  }

  /** Helper para marcar inputs inválidos ya tocados. */
  isInvalid(form: FormGroup, field: string): boolean {
    const control = form.get(field);
    return !!control && control.invalid && (control.dirty || control.touched);
  }
}
