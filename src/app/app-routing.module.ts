import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminComponent } from './theme/layout/admin/admin.component';

const routes: Routes = [
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
    ]
  },
  

  // Rutas con Layout de Invitado (GuestComponent)
  // {
  //   path: '',
  //   component: GuestComponent,
  //   children: [
  //     {
  //       path: 'login',
  //       // Esto asume que LoginComponent es un componente standalone o está correctamente exportado.
  //       loadComponent: () => import('./demo/pages/authentication/login/login.component').then((c) => c.LoginComponent)
  //     },
  //     {
  //       path: 'register',
  //       // Esto asume que RegisterComponent es un componente standalone o está correctamente exportado.
  //       loadComponent: () => import('./demo/pages/authentication/register/register.component').then((c) => c.RegisterComponent)
  //     }
  //   ]
  // }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}