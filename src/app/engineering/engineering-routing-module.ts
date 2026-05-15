import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  // Ingeniería de Producto
  {
    path: 'product/engineeringNews',
    loadComponent: () =>
      import('./product/engineering-news/engineering-news').then(c => c.ProductEngineeringNews)
  },
  {
    path: 'product/viewNews',
    loadComponent: () =>
      import('./product/view-news/view-news').then(c => c.ProductEngineeringViewNews)
  },
  // Ingeniería Industrial
  {
    path: 'industrial/engineeringNews',
    loadComponent: () =>
      import('./industrial/engineering-news/engineering-news').then(c => c.IndustrialEngineeringNews)
  },
  {
    path: 'industrial/viewNews',
    loadComponent: () =>
      import('./industrial/view-news/view-news').then(c => c.IndustrialEngineeringViewNews)
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class EngineeringRoutingModule {}
