// src/app/app-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminComponent } from './theme/layout/admin/admin.component';


const routes: Routes = [
  // Rutas con Layout de Administrador
  {
    path: '',
    component: AdminComponent,
    children: [
      {
        path: '',
        redirectTo: '/production',
        pathMatch: 'full'
      },
      {
        path: 'production',
        loadChildren: () => import('./production/production-module').then((m) => m.ProductionModule)
      },
      {
        path: 'inventories',
        loadChildren: () => import('./warehouse/warehouse-module').then((m) => m.WarehouseModule)
      },
      {
        path: 'printing',
        loadChildren: () => import('./barcode-printing/barcode-printing-module').then((m) => m.BarcodePrintingModule)
      },
      {
        path: 'clientHome',
        loadChildren: () => import('./client-home/client-home-module').then((m) => m.ClientHomeModule)
      },
    ]
  },
  
  // Ruta de Autenticación (Fuera del AdminComponent)
  {
    path: 'auth',
    loadChildren: () => import('./auth/auth-module').then((m) => m.AuthModule)
  },

  // Redirección por defecto si la ruta no existe
  {
    path: '**',
    redirectTo: 'auth/login'
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}