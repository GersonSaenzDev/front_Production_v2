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
  {
    // Path completo: /production/productionNews
    path: 'productionNews',
    loadComponent: () => import('./assembly/production-news/production-news').then((c) => c.ProductionNews)
  },
  {
    // Path completo: /production/wineryNews
    path: 'wineryNews',
    loadComponent: () => import('./assembly/winery-news/winery-news').then((c) => c.WineryNews)
  },
  {
    path: 'viewNews',
    loadComponent: () => import('./assembly/view-news/view-news').then((c) => c.ViewNews)
  },
  // Presses
  {
    path: 'presses/pressesNews',
    loadComponent: () => import('./presses/presses-news/presses-news').then((c) => c.PressesNews)
  },
  {
    path: 'presses/viewNews',
    loadComponent: () => import('./presses/view-news/view-news').then((c) => c.ViewNews)
  },
  // Covering
  {
    path: 'covering/coveringNews',
    loadComponent: () => import('./covering/covering-news/covering-news').then((c) => c.CoveringNews)
  },
  {
    path: 'covering/viewNews',
    loadComponent: () => import('./covering/view-news/view-news').then((c) => c.ViewNews)
  },
  // Satellites
  {
    path: 'satellites/satellitesNews',
    loadComponent: () => import('./satellites/satellites-news/satellites-news').then((c) => c.SatellitesNews)
  },
  {
    path: 'satellites/viewNews',
    loadComponent: () => import('./satellites/view-news/view-news').then((c) => c.ViewNews)
  },
  // Glass
  {
    path: 'glass/glassNews',
    loadComponent: () => import('./glass/glass-news/glass-news').then((c) => c.GlassNews)
  },
  {
    path: 'glass/viewNews',
    loadComponent: () => import('./glass/view-news/view-news').then((c) => c.ViewNews)
  },
  // Costs
  {
    path: 'costs/costsNews',
    loadComponent: () => import('./costs/costs-news/costs-news').then((c) => c.CostsNews)
  },
  {
    path: 'costs/viewNews',
    loadComponent: () => import('./costs/view-news/view-news').then((c) => c.ViewNews)
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ProductionRoutingModule { }
