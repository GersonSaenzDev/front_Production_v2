// app/auth/login/login.ts
import { ChangeDetectorRef, Component, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { 
  ReactiveFormsModule, 
  FormBuilder, 
  Validators 
} from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class LoginComponent {
  // --- Inyección de Dependencias ---
  private fb = inject(FormBuilder);
  private cd = inject(ChangeDetectorRef);

  // --- Signals de Estado ---
  submitted = signal(false);
  error = signal('');

  // --- Configuración del Formulario ---
  // Inicializamos directamente usando la propiedad 'fb' ya inyectada
  loginForm = this.fb.group({
    email: ['info@coddedtheme.com', [Validators.required, Validators.email]],
    password: ['123456', [Validators.required, Validators.minLength(8)]]
  });

  // Getter para validaciones en el HTML
  get f() { return this.loginForm.controls; }

  onSubmit() {
    this.submitted.set(true);
    this.error.set('');

    if (this.loginForm.invalid) {
      this.error.set('Por favor, revisa los campos marcados.');
      return;
    }

    const credentials = this.loginForm.value;
    console.log('Login intentado con:', credentials);
    
    // Forzamos la detección de cambios si es necesario (ej. tras una respuesta asíncrona)
    this.cd.detectChanges();
  }
}