// app/production/assembly/apexchart/bar-chart/bar-chart.component.ts

import { Component, ViewChild, Input, OnChanges, SimpleChanges } from '@angular/core'; // 👈 Importar Input, OnChanges, SimpleChanges
import { NgApexchartsModule, ChartComponent, ApexOptions } from 'ng-apexcharts';
import { ChartData } from '../../../../interfaces/assembly.interface'; // 💡 Importar la interfaz ChartData

// 💡 IMPORTANTE: Asegúrate de que esta ruta a tu interfaz sea correcta
// import { ChartData } from 'src/app/interfaces/assembly.interface'; 

@Component({
  selector: 'app-bar-chart',
  imports: [NgApexchartsModule],
  templateUrl: './bar-chart.component.html',
  styleUrl: './bar-chart.component.scss'
})
export class BarChartComponent implements OnChanges { // 👈 Implementar OnChanges
  
  // public props
  @ViewChild('chart') chart!: ChartComponent;
  chartOptions!: Partial<ApexOptions>;

  // 🎯 PASO 1: Declarar el Input para recibir los datos del dashboard
  @Input() chartData: ChartData = { categories: [], produced: [], valid: [] };

  // Constructor
  constructor() {
    // Inicializar con datos vacíos o por defecto. La data real se cargará en ngOnChanges.
    this.chartOptions = this.getBaseChartOptions(this.chartData);
  }
  
  // 🎯 PASO 2: Implementar ngOnChanges para reaccionar a la nueva data
  ngOnChanges(changes: SimpleChanges): void {
    // Solo actualizamos si la propiedad 'chartData' ha cambiado y tiene contenido
    if (changes['chartData'] && this.chartData && this.chartData.categories.length > 0) {
      this.chartOptions = this.getUpdatedChartOptions(this.chartData);
    }
  }

  // -----------------------------------------------------------
  // MÉTODOS DE CONFIGURACIÓN DEL GRÁFICO
  // -----------------------------------------------------------

  /**
   * Genera las opciones del gráfico usando los datos de entrada (producidos y válidos).
   * @param data Objeto ChartData con arrays de categorías, producidos y válidos.
   * @returns Opciones parciales de ApexCharts.
   */
  private getUpdatedChartOptions(data: ChartData): Partial<ApexOptions> {
      // Serie "Programados": cantidad planeada del día. Los productos que NO están en la
      // planeación se pintan en ROJO (#dc2626) con valor 0; el resto en morado (#673ab7).
      const plannedValues = data.planned ?? data.valid;
      const PLANNED_COLOR = '#0d47a1';
      const MISSING_COLOR = '#dc2626';
      const plannedSeries = (plannedValues ?? []).map((value, i) => ({
          x: data.categories[i],
          y: value,
          fillColor: data.plannedMissing?.[i] ? MISSING_COLOR : PLANNED_COLOR
      }));

      return {
          series: [
              {
                  name: 'Producidos', // Etiqueta para el total producido (incluye error)
                  data: data.categories.map((category, i) => ({ x: category, y: data.produced[i] }))
              },
              {
                  name: 'Programados', // Cantidad planeada del día (rojo si no hay planeación)
                  data: plannedSeries
              }
          ],
          dataLabels: {
              enabled: false
          },
          chart: {
              type: 'bar',
              height: 480,
              // Barras agrupadas (lado a lado), no apiladas: permite comparar de un vistazo
              // lo Producido vs lo Programado por producto.
              stacked: false,
              toolbar: {
                  show: true
              },
              background: 'transparent'
          },
          // Colores ajustados para 2 series (Producidos y Programados)
          colors: ['#2196f3', '#0d47a1'],
          responsive: [
              {
                  breakpoint: 480,
                  options: {
                      legend: {
                          position: 'bottom',
                          offsetX: -10,
                          offsetY: 0
                      }
                  }
              }
          ],
          plotOptions: {
              bar: {
                  horizontal: false,
                  columnWidth: '50%'
              }
          },
          xaxis: {
              type: 'category',
              // 🎯 Usar las categorías (nombres de productos) del backend
              categories: data.categories
          },
          tooltip: {
              theme: 'light',
              y: {
                  formatter: (value: number, opts?: { seriesIndex: number; dataPointIndex: number }): string => {
                      // Serie "Programados" (índice 1): si el producto no está en la planeación,
                      // mostramos "Sin planeación" en lugar del 0.
                      if (opts?.seriesIndex === 1 && data.plannedMissing?.[opts.dataPointIndex]) {
                          return 'Sin planeación';
                      }
                      return new Intl.NumberFormat('es').format(value ?? 0);
                  }
              }
          }
      };
  }

  // Usamos el método anterior para inicializar las opciones.
  private getBaseChartOptions(data: ChartData): Partial<ApexOptions> {
    return this.getUpdatedChartOptions(data);
  }
}