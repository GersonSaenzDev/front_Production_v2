import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { mechanicsJefeOnlyGuard } from '../guards/mechanics-jefe-only.guard';

const routes: Routes = [
  {
    path: 'machiningNews',
    loadComponent: () => import('./machining-news/machining-news').then((c) => c.MachiningNews)
  },
  {
    path: 'viewNews',
    loadComponent: () => import('./view-news/view-news').then((c) => c.ViewNews)
  },
  {
    path: 'mechanicsRequest',
    // Exclusivo del Jefe de Mecánica: crear la Solicitud Herramental (SME55003).
    canActivate: [mechanicsJefeOnlyGuard],
    loadComponent: () => import('./mechanics-request/mechanics-request').then((c) => c.MechanicsRequestForm)
  },
  {
    path: 'mechanicsManagement',
    // Exclusivo del Jefe: novedades entrantes, paradas, asignar, aceptación y cierre/reapertura.
    canActivate: [mechanicsJefeOnlyGuard],
    loadComponent: () => import('./mechanics-management/mechanics-management').then((c) => c.MechanicsManagement)
  },
  {
    path: 'mechanicsUpload',
    // Abierto a toda el área de Mecánica: cada mecánico registra su trabajo en lo asignado.
    loadComponent: () => import('./mechanics-upload/mechanics-upload').then((c) => c.MechanicsUpload)
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class MachiningRoutingModule {}
