import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Dashboard } from './assembly/dashboard/dashboard';

const routes: Routes = [
  {
    path: '',
    component: Dashboard,
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./assembly/dashboard/dashboard').then((c) => c.Dashboard)
      },
    ]
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ProductionRoutingModule { }
