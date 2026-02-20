// app/client-home/dashboard/dashboard.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

// 1. Definimos la interfaz para asegurar profesionalismo en el manejo de datos
interface OrderTracking {
  storePurchaseOrder: string;
  clientName: string;
  city: string;
  deliveryStatus: string;
  fileReceptionDate: string;
  observations: any[];
  daysInSystem?: number; // Campo calculado
  isOverdue?: boolean;   // Campo calculado
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class Dashboard implements OnInit {
  
  // Métricas para los KPI Cards
  public totalActive: number = 1284;
  public overdueCount: number = 12;
  public nearDueCount: number = 45;

  // 2. Definimos la propiedad mockData que causaba el error
  public mockData: OrderTracking[] = [];

  public startDate: string = '';
  public endDate: string = '';

  constructor() {}

  ngOnInit(): void {
    this.setDefaultDates();
    this.loadMockInformation(); // Cargamos los datos de tu colección
  }

  /**
   * Carga y procesa la información basada en tu JSON de producción
   */
  loadMockInformation(): void {
    const rawData = [
      {
        storePurchaseOrder: "OC-00052431",
        clientName: "LAURA CUELLAR AREVALO",
        city: "BOGOTÁ D.C.",
        deliveryStatus: "ENTREGADO",
        fileReceptionDate: "2026-02-18",
        observations: [ { note: "Cambio de dirección solicitado" } ]
      },
      {
        storePurchaseOrder: "OC-00052432",
        clientName: "MAYRA LIZETH MAMANCHE",
        city: "SUESCA",
        deliveryStatus: "NO PROGRAMADO",
        fileReceptionDate: "2026-02-10", // Pedido antiguo para disparar alerta
        observations: []
      },
      {
        storePurchaseOrder: "OC-00052433",
        clientName: "TATIANA OSORIO CASTRO",
        city: "BOGOTÁ D.C.",
        deliveryStatus: "PENDIENTE_ENTREGA",
        fileReceptionDate: "2026-02-17",
        observations: []
      }
    ];

    // 3. Procesamos la data para calcular KPIs en tiempo real (Business Intelligence)
    this.mockData = rawData.map(order => {
      const days = this.calculateDaysInSystem(order.fileReceptionDate);
      return {
        ...order,
        daysInSystem: days,
        isOverdue: days > 2 // Si tiene más de 2 días, es un incumplimiento de SLA
      };
    });
  }

  /**
   * Calcula la diferencia de días entre la recepción y hoy
   */
  private calculateDaysInSystem(receptionDate: string): number {
    const received = new Date(receptionDate);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - received.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  setDefaultDates(): void {
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(today.getDate() - 7);
    this.endDate = today.toISOString().split('T')[0];
    this.startDate = lastWeek.toISOString().split('T')[0];
  }

  onDateChange(): void {
    console.log("Filtrando datos gerenciales...", this.startDate, this.endDate);
  }
}