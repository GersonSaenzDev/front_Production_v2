// Angular import
import { Component, output, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';

// project import
import { BerryConfig } from '../../../../app-config';

import { NavLeftComponent } from './nav-left/nav-left.component';
import { NavLogoComponent } from './nav-logo/nav-logo.component';
import { AuthService } from 'src/app/services/auth-services';

@Component({
  selector: 'app-nav-bar',
  imports: [NavLogoComponent, NavLeftComponent],
  templateUrl: './nav-bar.component.html',
  styleUrls: ['./nav-bar.component.scss']
})
export class NavBarComponent implements OnInit {
  // public props
  NavCollapse = output();
  NavCollapsedMob = output();
  navCollapsed: boolean;
  windowWidth: number;
  navCollapsedMob: boolean;

  public authService = inject(AuthService); // Cambiado a public para usarlo en el HTML
  private router = inject(Router);

  // Constructor
  constructor() {
    this.windowWidth = window.innerWidth;
    this.navCollapsed = this.windowWidth >= 1025 ? BerryConfig.isCollapse_menu : false;
    this.navCollapsedMob = false;
  }

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      // Llamamos al servicio para asegurarnos de que la información esté fresca
      this.authService.getUserMenuData().subscribe({
        error: (error) => console.error('Error fetching user data', error)
      });
    }
  }

  // public method
  navCollapse() {
    if (this.windowWidth >= 1025) {
      this.navCollapsed = !this.navCollapsed;
      this.NavCollapse.emit();
    }
  }

  navCollapseMob() {
    if (this.windowWidth < 1025) {
      this.NavCollapsedMob.emit();
    }
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}
