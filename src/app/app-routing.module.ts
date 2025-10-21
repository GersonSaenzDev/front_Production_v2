import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminComponent } from './theme/layout/admin/admin.component';
import { GuestComponent } from './theme/layout/guest/guest.component';

const routes: Routes = [
  // Rutas con Layout de Administración (AdminComponent)
  {
    path: '',
    component: AdminComponent,
    children: [
      {
        // Esta ruta cargará el MÓDULO de producción de forma perezosa.
        // El path 'production' será el prefijo para todas las rutas internas del módulo.
        path: 'production',
        // Usamos loadChildren y apuntamos a la clase ProductionModule.
        loadChildren: () => import('./production/production-module').then((m) => m.ProductionModule)
      },
      // Aquí se agregarían otras rutas de módulos perezosos del área de administración
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