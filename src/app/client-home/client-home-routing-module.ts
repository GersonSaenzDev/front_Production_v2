import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { OrderControl } from './order-control/order-control';

const routes: Routes = [
  {
      path: '',
      component: OrderControl,
      children: [
        {
          path: 'orderControl',
          loadComponent: () => import('./order-control/order-control').then((c) => c.OrderControl)
        },
      ]
    },
    {
      path: 'processedOrders',
      loadComponent: () => import('./processed-orders/processed-orders').then((c) => c.ProcessedOrders)
    },
    {
      path: 'dash',
      loadComponent: () => import('./dashboard/dashboard').then((c) => c.Dashboard)
    },
    {
      path: 'productionOrders',
      loadComponent: () => import('./production-orders/production-orders').then((c) => c.ProductionOrders)
    },
    {
      path: 'shippingManagement',
      loadComponent: () => import('./shipping-management/shipping-management').then((c) => c.ShippingManagement)
    },
    // {
    //   // Path completo: /production/productionNews
    //   path: 'configInventories',
    //   loadComponent: () => import('./configure-inventories/configure-inventories').then((c) => c.ConfigureInventories)
    // },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ClientHomeRoutingModule { }
