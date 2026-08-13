// app/engineering/structure-managements/shared/gantt-chart/gantt-chart.ts
import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { NgApexchartsModule, ApexOptions } from 'ng-apexcharts';
import { CapacityWarehouseLoad, GanttSummary, AlmacenDeliveryEntry, GanttAssemblyWarehouseRef } from '../../../../interfaces/product-structure.interface';

/** Color por estado del Gantt (ver GanttInfo.status en product-structure.interface.ts). */
const STATUS_COLOR: Record<string, string> = {
  terminal: '#0d47a1',
  scheduled: '#2196f3',
  blocked: '#dc2626',
  noStaff: '#f59e0b',
  cyclic: '#6b7280'
};

const STATUS_LABEL: Record<string, string> = {
  terminal: 'Terminal',
  scheduled: 'Programada',
  blocked: 'Bloqueada',
  noStaff: 'Sin personal',
  cyclic: 'Ciclo en el flujo'
};

/** "DD/MM/YYYY HH:mm" (formato del backend) -> timestamp (hora local del navegador). */
const parseBackendDate = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)).getTime();
};

@Component({
  selector: 'app-gantt-chart',
  standalone: true,
  imports: [CommonModule, NgApexchartsModule],
  templateUrl: './gantt-chart.html',
  styleUrl: './gantt-chart.scss'
})
export class GanttChart implements OnChanges {
  @Input() byWarehouse: CapacityWarehouseLoad[] = [];
  @Input() ganttSummary: GanttSummary | null = null;
  @Input() almacenDeliverySchedule: AlmacenDeliveryEntry[] = [];

  chartOptions: Partial<ApexOptions> = {};
  chartHasData = false;
  statusLabel = STATUS_LABEL;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['byWarehouse']) {
      this.chartOptions = this.buildChartOptions();
    }
  }

  /** Filas con status resuelto (mustStartBy/mustFinishBy calculados) — las únicas que se pueden dibujar como barra. */
  get plottableRows(): CapacityWarehouseLoad[] {
    return this.byWarehouse.filter((w) => w.gantt?.mustStartBy && w.gantt?.mustFinishBy);
  }

  /** Todas las filas con info de Gantt, ordenadas por inicio (las sin fecha van al final) — para la tabla de detalle. */
  get sortedRows(): CapacityWarehouseLoad[] {
    return [...this.byWarehouse]
      .filter((w) => !!w.gantt)
      .sort((a, b) => {
        const ta = parseBackendDate(a.gantt?.mustStartBy) ?? Number.POSITIVE_INFINITY;
        const tb = parseBackendDate(b.gantt?.mustStartBy) ?? Number.POSITIVE_INFINITY;
        return ta - tb;
      });
  }

  statusColor(status: string | undefined): string {
    return STATUS_COLOR[status || ''] || '#9ca3af';
  }

  warehouseNames(refs: GanttAssemblyWarehouseRef[]): string {
    return (refs || []).map((r) => r.warehouseName).join(', ');
  }

  private buildChartOptions(): Partial<ApexOptions> {
    const rows = this.plottableRows;
    this.chartHasData = rows.length > 0;
    if (!this.chartHasData) return {};

    const data = rows
      .map((w) => ({
        x: `${w.warehouseName} (${w.warehouseCode})`,
        y: [parseBackendDate(w.gantt!.mustStartBy) as number, parseBackendDate(w.gantt!.mustFinishBy) as number],
        fillColor: this.statusColor(w.gantt?.status)
      }))
      // El backward pass procesa sumideros primero; para leerlo como Gantt (arriba = primero
      // en iniciar) se muestra ordenado por inicio ascendente.
      .sort((a, b) => a.y[0] - b.y[0]);

    return {
      series: [{ data }],
      chart: { type: 'rangeBar', height: Math.max(rows.length * 38, 160), toolbar: { show: true }, background: 'transparent' },
      plotOptions: { bar: { horizontal: true, distributed: true, barHeight: '55%' } },
      dataLabels: { enabled: false },
      xaxis: { type: 'datetime' },
      tooltip: {
        theme: 'light',
        custom: ({ seriesIndex, dataPointIndex, w }: { seriesIndex: number; dataPointIndex: number; w: { config: { series: { data: { x: string; y: number[] }[] }[] } } }) => {
          const point = w.config.series[seriesIndex].data[dataPointIndex];
          const start = new Date(point.y[0]).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
          const end = new Date(point.y[1]).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
          return `<div class="p-2"><strong>${point.x}</strong><br>Inicio: ${start}<br>Fin: ${end}</div>`;
        }
      },
      legend: { show: false }
    };
  }
}
