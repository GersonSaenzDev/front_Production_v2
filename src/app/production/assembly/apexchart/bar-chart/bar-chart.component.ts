// app/production/assembly/apexchart/bar-chart/bar-chart.component.ts

import { Component, ViewChild, Input, OnChanges, SimpleChanges } from '@angular/core'; // 👈 Importar Input, OnChanges, SimpleChanges
import { NgApexchartsModule, ChartComponent, ApexOptions } from 'ng-apexcharts';

// 💡 IMPORTANTE: Asegúrate de que esta ruta a tu interfaz sea correcta
import { ChartData } from 'src/app/interfaces/assembly.interface'; 

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
      return {
          series: [
              {
                  name: 'Producidos', // Etiqueta para el total producido (incluye error)
                  data: data.produced 
              },
              {
                  name: 'Programados', // Etiqueta para el total válido
                  data: data.valid 
              }
              // Hemos reducido a 2 series para reflejar Producidos y Válidos
          ],
          dataLabels: {
              enabled: false
          },
          chart: {
              type: 'bar',
              height: 480,
              stacked: true,
              toolbar: {
                  show: true
              },
              background: 'transparent'
          },
          // Colores ajustados para 2 series (Producidos y Válidos)
          colors: ['#2196f3', '#673ab7'], 
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
              theme: 'light'
          }
      };
  }

  // Usamos el método anterior para inicializar las opciones.
  private getBaseChartOptions(data: ChartData): Partial<ApexOptions> {
    return this.getUpdatedChartOptions(data);
  }
}