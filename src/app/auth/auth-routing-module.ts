// app/auth/auth-routing-module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';// Importamos el componente
import { LoginComponent } from './login/login';

const routes: Routes = [
  {
    path: 'login', // La URL será /auth/login
    component: LoginComponent
  },
  {
    path: '', // Si entran a /auth sin nada más, redirigimos a login
    redirectTo: 'login',
    pathMatch: 'full'
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)], // Usamos forChild para módulos secundarios
  exports: [RouterModule]
})
export class AuthRoutingModule { }