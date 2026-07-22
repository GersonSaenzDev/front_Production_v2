// app/engineering/structure-managements/shared/work-config-editor/work-config-editor.ts
import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CapacityAnalysisPayload,
  WarehouseStaffMap,
  WorkSchedule,
  WorkScheduleShift
} from '../../../../interfaces/product-structure.interface';
import {
  DEFAULT_STAFF_AREA,
  DEFAULT_WAREHOUSE_STAFF_MAP,
  DEFAULT_WORK_SCHEDULES,
  WarehouseStaffRow,
  rowsToWarehouseStaffMap,
  warehouseStaffMapToRows
} from '../work-config.defaults';

/** Modelo editable de una jornada de trabajo (separa `warehouses`/`default` en un solo campo de UI). */
interface ScheduleUiModel {
  name: string;
  isDefaultSchedule: boolean;
  warehousesText: string;
  breakMinutes: number | null;
  daysPerWeek: number;
  shifts: WorkScheduleShift[];
}

/** Configuración completa que arma el editor, lista para enviar en el payload. */
type WorkConfig = Pick<CapacityAnalysisPayload, 'workSchedules' | 'staffArea' | 'warehouseStaffMap'>;

@Component({
  selector: 'app-work-config-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './work-config-editor.html',
  styleUrl: './work-config-editor.scss'
})
export class WorkConfigEditor implements OnInit {
  schedules: ScheduleUiModel[] = [];
  staffArea = DEFAULT_STAFF_AREA;
  staffRows: WarehouseStaffRow[] = [];

  ngOnInit(): void {
    this.schedules = DEFAULT_WORK_SCHEDULES.map((s) => this.toUiModel(s));
    this.staffRows = warehouseStaffMapToRows(DEFAULT_WAREHOUSE_STAFF_MAP);
  }

  private toUiModel(schedule: WorkSchedule): ScheduleUiModel {
    return {
      name: schedule.name,
      isDefaultSchedule: !!schedule.default,
      warehousesText: (schedule.warehouses || []).join(', '),
      breakMinutes: schedule.breakMinutes ?? null,
      daysPerWeek: schedule.daysPerWeek,
      shifts: schedule.shifts.map((sh) => ({ ...sh }))
    };
  }

  // =======================
  //  JORNADAS
  // =======================
  addSchedule(): void {
    this.schedules.push({
      name: '',
      isDefaultSchedule: false,
      warehousesText: '',
      breakMinutes: null,
      daysPerWeek: 5,
      shifts: [{ start: '07:00', end: '16:00' }]
    });
  }

  removeSchedule(index: number): void {
    this.schedules.splice(index, 1);
  }

  addShift(schedule: ScheduleUiModel): void {
    schedule.shifts.push({ start: '', end: '' });
  }

  removeShift(schedule: ScheduleUiModel, index: number): void {
    schedule.shifts.splice(index, 1);
  }

  // =======================
  //  MAPEO BODEGA → DEPARTAMENTO
  // =======================
  addStaffRow(): void {
    this.staffRows.push({ warehouseCode: '', departments: '' });
  }

  removeStaffRow(index: number): void {
    this.staffRows.splice(index, 1);
  }

  // =======================
  //  LECTURA DE CONFIGURACIÓN (usado por el padre vía @ViewChild)
  // =======================
  getConfig(): WorkConfig {
    return {
      workSchedules: this.schedules.map((s) => this.toWorkSchedule(s)),
      staffArea: this.staffArea.trim() || DEFAULT_STAFF_AREA,
      warehouseStaffMap: rowsToWarehouseStaffMap(this.staffRows) as WarehouseStaffMap
    };
  }

  private toWorkSchedule(schedule: ScheduleUiModel): WorkSchedule {
    const workSchedule: WorkSchedule = {
      name: schedule.name.trim(),
      shifts: schedule.shifts.filter((s) => s.start && s.end),
      daysPerWeek: schedule.daysPerWeek
    };
    if (schedule.breakMinutes) {
      workSchedule.breakMinutes = schedule.breakMinutes;
    }
    if (schedule.isDefaultSchedule) {
      workSchedule.default = true;
    } else {
      workSchedule.warehouses = schedule.warehousesText
        .split(',')
        .map((w) => w.trim().toUpperCase())
        .filter(Boolean);
    }
    return workSchedule;
  }
}
