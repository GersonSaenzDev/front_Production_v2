// src/app/app-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminComponent } from './theme/layout/admin/admin.component';
import { authGuard } from './guards/auth.guard';
import { roleGuard } from './guards/role.guard';

const routes: Routes = [
  // Rutas con Layout de Administrador
  {
    path: '',
    component: AdminComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        redirectTo: '/production', // Podríamos dejarlo en la raíz y que un guard decida, pero production por ahora es el default general si tiene acceso.
        pathMatch: 'full'
      },
      {
        path: 'production',
        canActivate: [roleGuard],
        loadChildren: () => import('./production/production-module').then((m) => m.ProductionModule)
      },
      {
        path: 'inventories',
        canActivate: [roleGuard],
        loadChildren: () => import('./warehouse/warehouse-module').then((m) => m.WarehouseModule)
      },
      {
        path: 'printing',
        canActivate: [roleGuard],
        loadChildren: () => import('./barcode-printing/barcode-printing-module').then((m) => m.BarcodePrintingModule)
      },
      {
        path: 'clientHome',
        canActivate: [roleGuard],
        loadChildren: () => import('./client-home/client-home-module').then((m) => m.ClientHomeModule)
      },
      {
        path: 'quality',
        canActivate: [roleGuard],
        loadChildren: () => import('./quality/quality-module').then((m) => m.QualityModule)
      },
      {
        path: 'engineering',
        canActivate: [roleGuard],
        loadChildren: () => import('./engineering/engineering-module').then((m) => m.EngineeringModule)
      },
      {
        path: 'health-safety',
        canActivate: [roleGuard],
        loadChildren: () => import('./health-safety/health-safety-module').then((m) => m.HealthSafetyModule)
      },
      {
        path: 'human-resources',
        canActivate: [roleGuard],
        loadChildren: () => import('./human-resources/human-resources-module').then((m) => m.HumanResourcesModule)
      },
      {
        path: 'maintenance',
        canActivate: [roleGuard],
        loadChildren: () => import('./maintenance/maintenance-module').then((m) => m.MaintenanceModule)
      },
      {
        path: 'machining',
        canActivate: [roleGuard],
        loadChildren: () => import('./machining/machining-module').then((m) => m.MachiningModule)
      },
      {
        path: 'logistics',
        canActivate: [roleGuard],
        loadChildren: () => import('./logistics/logistics-module').then((m) => m.LogisticsModule)
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