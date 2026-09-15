import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { maintenanceWarehouseGuard } from '../guards/maintenance-warehouse.guard';
import { maintenanceJefeOnlyGuard } from '../guards/maintenance-jefe-only.guard';

const routes: Routes = [
  {
    path: 'maintenanceNews',
    // Exclusivo del Jefe: un técnico solo debe entrar a "Cargue de Novedad".
    canActivate: [maintenanceJefeOnlyGuard],
    loadComponent: () => import('./maintenance-news/maintenance-news').then(c => c.MaintenanceNews)
  },
  {
    path: 'viewNews',
    // Exclusivo del Jefe: un técnico solo debe entrar a "Cargue de Novedad".
    canActivate: [maintenanceJefeOnlyGuard],
    loadComponent: () => import('./view-news/view-news').then(c => c.ViewNews)
  },
  {
    path: 'newsUpload',
    // Abierto a toda el área MANTENIMIENTO (Jefe y técnicos): cada quien ve/carga lo suyo.
    loadComponent: () => import('./news-upload/news-upload').then(c => c.NewsUpload)
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
