import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: 'maintenanceNews',
    loadComponent: () => import('./maintenance-news/maintenance-news').then(c => c.MaintenanceNews)
  },
  {
    path: 'viewNews',
    loadComponent: () => import('./view-news/view-news').then(c => c.ViewNews)
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class MaintenanceRoutingModule { }
