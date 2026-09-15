import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { maintenanceWarehouseGuard } from '../guards/maintenance-warehouse.guard';

const routes: Routes = [
  {
    path: 'maintenanceNews',
    loadComponent: () => import('./maintenance-news/maintenance-news').then(c => c.MaintenanceNews)
  },
  {
    path: 'viewNews',
    loadComponent: () => import('./view-news/view-news').then(c => c.ViewNews)
  },
  {
    path: 'maintenanceWarehouse',
    // Acceso restringido: solo la lista puntual de usuarios autorizados (ver menu-access.service.ts).
    canActivate: [maintenanceWarehouseGuard],
    loadComponent: () => import('./maintenance-warehouse/maintenance-warehouse').then(c => c.MaintenanceWarehouse)
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class MaintenanceRoutingModule { }
