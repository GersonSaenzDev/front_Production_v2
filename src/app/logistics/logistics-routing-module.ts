import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  // Almacén
  {
    path: 'almacen/logisticsNews',
    loadComponent: () =>
      import('./almacen/logistics-news/logistics-news').then(c => c.AlmacenLogisticsNews)
  },
  {
    path: 'almacen/viewNews',
    loadComponent: () =>
      import('./almacen/view-news/view-news').then(c => c.AlmacenViewNews)
  },
  // Rutas legacy (placeholders)
  {
    path: 'logisticsNews',
    loadComponent: () => import('./logistics-news/logistics-news').then(c => c.LogisticsNews)
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
export class LogisticsRoutingModule {}
