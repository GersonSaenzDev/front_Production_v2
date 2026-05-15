import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: 'machiningNews',
    loadComponent: () => import('./machining-news/machining-news').then(c => c.MachiningNews)
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
export class MachiningRoutingModule { }
