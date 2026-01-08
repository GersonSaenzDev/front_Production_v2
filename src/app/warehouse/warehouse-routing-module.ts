import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DashInventories } from './dash-inventories/dash-inventories';

const routes: Routes = [
  {
    path: '',
    component: DashInventories,
    children: [
      {
        path: 'dash',
        loadComponent: () => import('./dash-inventories/dash-inventories').then((c) => c.DashInventories)
      },
    ]
  },
  {
    // Path completo: /production/productionNews
    path: 'checkNews',
    loadComponent: () => import('./check-news/check-news').then((c) => c.CheckNews)
  },
  {
    // Path completo: /production/productionNews
    path: 'configInventories',
    loadComponent: () => import('./configure-inventories/configure-inventories').then((c) => c.ConfigureInventories)
  },
  {
    // Path completo: /production/productionNews
    path: 'enterInventory',
    loadComponent: () => import('./reader-inventory/reader-inventory').then((c) => c.InventoryReader)
  },
  {
    // Path completo: /production/productionNews
    path: 'finalInventoryReport',
    loadComponent: () => import('./inventory-report/inventory-report').then((c) => c.InventoryReport)
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class WarehouseRoutingModule { }
