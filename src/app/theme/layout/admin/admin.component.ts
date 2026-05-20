// Angular import
import { AfterViewInit, Component, inject, HostListener, OnDestroy } from '@angular/core';
import { CommonModule, Location, LocationStrategy } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { ChangeDetectorRef } from '@angular/core';

// Project import
import { BerryConfig } from '../../../app-config';

import { ConfigurationComponent } from './configuration/configuration.component';
import { NavBarComponent } from './nav-bar/nav-bar.component';
import { NavigationComponent } from './navigation/navigation.component';
import { BreadcrumbComponent } from '../../shared/components/breadcrumbs/breadcrumbs.component';
import { AuthService } from 'src/app/services/auth-services';

@Component({
  selector: 'app-admin',
  imports: [CommonModule, NavigationComponent, NavBarComponent, ConfigurationComponent, RouterModule, BreadcrumbComponent],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss'
})
export class AdminComponent implements AfterViewInit, OnDestroy {
  private location = inject(Location);
  private locationStrategy = inject(LocationStrategy);
  cdr = inject(ChangeDetectorRef);
  private authService = inject(AuthService);
  private router = inject(Router);

  // public props
  currentLayout!: string;
  navCollapsed = true;
  navCollapsedMob = false;
  windowWidth!: number;

  private inactivityTimer: any;
  private readonly INACTIVITY_LIMIT_MS = 35 * 60 * 1000; // 35 minutos

  // Constructor
  constructor() {
    this.resetInactivityTimer();
  }

  // life cycle hook

  ngAfterViewInit() {
    let current_url = this.location.path();
    const baseHref = this.locationStrategy.getBaseHref();
    if (baseHref) {
      current_url = baseHref + this.location.path();
    }

    if (current_url === baseHref + '/layout/theme-compact' || current_url === baseHref + '/layout/box') {
      BerryConfig.isCollapse_menu = true;
    }

    this.windowWidth = window.innerWidth;
    this.navCollapsed = this.windowWidth >= 1025 ? BerryConfig.isCollapse_menu : false;
    this.cdr.detectChanges();
  }

  ngOnDestroy() {
    this.clearInactivityTimer();
  }

  // Inactivity timeout logic
  @HostListener('window:mousemove')
  @HostListener('window:keydown')
  @HostListener('window:click')
  @HostListener('window:scroll')
  @HostListener('window:touchstart')
  resetInactivityTimer() {
    this.clearInactivityTimer();
    // Solo iniciamos el timer si estamos en el navegador
    if (typeof window !== 'undefined') {
      this.inactivityTimer = setTimeout(() => {
        this.logoutDueToInactivity();
      }, this.INACTIVITY_LIMIT_MS);
    }
  }

  private clearInactivityTimer() {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }
  }

  private logoutDueToInactivity() {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }

  // private method
  private isThemeLayout(layout: string) {
    this.currentLayout = layout;
  }

  // public method
  navMobClick() {
    if (this.navCollapsedMob && !document.querySelector('app-navigation.coded-navbar')?.classList.contains('mob-open')) {
      this.navCollapsedMob = !this.navCollapsedMob;
      setTimeout(() => {
        this.navCollapsedMob = !this.navCollapsedMob;
      }, 100);
    } else {
      this.navCollapsedMob = !this.navCollapsedMob;
    }
    if (document.querySelector('app-navigation.pc-sidebar')?.classList.contains('navbar-collapsed')) {
      document.querySelector('app-navigation.pc-sidebar')?.classList.remove('navbar-collapsed');
    }
  }

  handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.closeMenu();
    }
  }

  closeMenu() {
    if (document.querySelector('app-navigation.pc-sidebar')?.classList.contains('mob-open')) {
      document.querySelector('app-navigation.pc-sidebar')?.classList.remove('mob-open');
    }
  }
}
