import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'app-processed-orders',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './processed-orders.html',
  styleUrl: './processed-orders.scss'
})
export class ProcessedOrders {

  /** * @description Rango de fechas dinámico (Día Actual)
   * Usamos toISOString().split('T')[0] para obtener "2026-02-14"
   */
  todayStr = new Date().toISOString().split('T')[0];
  dateRange = { start: this.todayStr, end: this.todayStr };

}
