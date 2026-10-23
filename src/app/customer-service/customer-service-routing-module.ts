// src/app/customer-service/customer-service-routing-module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: 'customerServiceNews',
    loadComponent: () => import('./customer-service-news/customer-service-news').then((c) => c.CustomerServiceNews)
  },
  {
    path: 'viewNews',
    loadComponent: () => import('./view-news/view-news').then((c) => c.ViewNews)
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CustomerServiceRoutingModule {}
