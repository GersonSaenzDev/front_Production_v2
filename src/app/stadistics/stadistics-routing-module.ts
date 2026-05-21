import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    // Path completo: /stadistics
    path: '',
    loadComponent: () => import('./stadistics/stadistics').then((c) => c.Stadistics)
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class StadisticsRoutingModule {}
