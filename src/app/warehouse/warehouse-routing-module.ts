// src/app/warehouse/warehouse-routing-module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DashInventories } from './dash-inventories/dash-inventories';
import { warehouseAdminGuard } from '../guards/warehouse-admin.guard';

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
  {
    // Path completo: /production/productionNews
    path: 'orderPreparation',
    loadComponent: () => import('./order-preparation/order-preparation').then((c) => c.OrderPreparation)
  },
  {
    // Path completo: /inventories/packingList
    path: 'packingList',
    loadComponent: () => import('./packing-list/packing-list').then((c) => c.PackingList)
  },
  {
    // Path completo: /inventories/barcodeReader
    path: 'barcodeReader',
    loadComponent: () => import('./barcode-reader/barcode-reader').then((c) => c.BarcodeReader)
  },
  {
    // Path completo: /inventories/loadingOrders (solo administrativos de Bodega)
    path: 'loadingOrders',
    canActivate: [warehouseAdminGuard],
    loadComponent: () => import('./loading-orders/loading-orders').then((c) => c.LoadingOrders)
  },
  {
    // Path completo: /inventories/loadingOrderPicking (operario de prealistamiento)
    path: 'loadingOrderPicking',
    loadComponent: () => import('./loading-order-picking/loading-order-picking').then((c) => c.LoadingOrderPicking)
  },
  {
    // Path completo: /inventories/dockLoading (operario de cargue en muelle)
    path: 'dockLoading',
    loadComponent: () => import('./dock-loading/dock-loading').then((c) => c.DockLoading)
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class WarehouseRoutingModule { }
