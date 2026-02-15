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
