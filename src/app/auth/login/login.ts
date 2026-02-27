// app/auth/login/login.ts
import { ChangeDetectorRef, Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router'; // Importamos Router
import { 
  ReactiveFormsModule, 
  FormBuilder, 
  Validators, 
  FormGroup
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from 'src/app/services/auth-services';
import { LoginRequest } from 'src/app/interfaces/auth.interface';
 // Importamos la interfaz

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class LoginComponent implements OnInit {
  // --- Inyección de Dependencias ---
  private authService = inject(AuthService);
  private fb = inject(FormBuilder);
  private router = inject(Router); // ✅ Corregido: Inyectamos el Router
  private cd = inject(ChangeDetectorRef);

  loginForm!: FormGroup;
  loading = false;

  // --- Signals de Estado ---
  // Usaremos estos para que el HTML reaccione automáticamente
  submitted = signal(false);
  error = signal('');

  ngOnInit(): void {
    this.loginForm = this.fb.group({
      username: ['', [Validators.required]],
      password: ['', [Validators.required]]
    });
  }

  // Getter para validaciones en el HTML
  get f() { return this.loginForm.controls; }

  onSubmit() {
    this.submitted.set(true); // Marcamos como enviado para mostrar errores visuales
    this.error.set(''); // Limpiamos errores previos

    if (this.loginForm.invalid) {
      return;
    }

    this.loading = true;

    // Creamos el objeto que espera el servicio profesional
    const credentials: LoginRequest = {
      user: this.loginForm.value.username,
      pass: this.loginForm.value.password
    };

    this.authService.login(credentials).subscribe({
      next: (res) => {
        // El servicio ya guardó el token en localStorage internamente
        if (res.ok) {
          this.router.navigate(['/production']);
        } else {
          this.loading = false;
          this.error.set('Credenciales incorrectas');
        }
      },
      error: (err) => {
        this.loading = false;
        console.error('❌ Error en el login:', err);
        this.error.set('Error en el inicio de sesión. Inténtalo de nuevo.');
      }
    });
    
    this.cd.detectChanges();
  }
}