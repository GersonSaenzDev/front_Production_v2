// Angular import
import { Component, OnInit, output, inject } from '@angular/core';
import { Location } from '@angular/common';
import { RouterModule } from '@angular/router';

//theme version
import { environment } from 'src/environments/environment';

// project import
import { NavigationItem, NavigationItems } from '../navigation';
import { MenuAccessService, AppModule } from '../../../../../services/menu-access.service';

import { NavCollapseComponent } from './nav-collapse/nav-collapse.component';
import { NavGroupComponent } from './nav-group/nav-group.component';
import { NavItemComponent } from './nav-item/nav-item.component';

// NgScrollbarModule
import { SharedModule } from '../../../../shared/shared.module';

@Component({
  selector: 'app-nav-content',
  imports: [RouterModule, NavCollapseComponent, NavGroupComponent, NavItemComponent, SharedModule],
  templateUrl: './nav-content.component.html',
  styleUrl: './nav-content.component.scss'
})
export class NavContentComponent implements OnInit {
  private location = inject(Location);
  private menuAccessService = inject(MenuAccessService);

  // public props
  NavCollapsedMob = output();
  SubmenuCollapse = output();

  // version
  title = 'Demo application for version numbering';
  currentApplicationVersion = environment.appVersion;

  navigations!: NavigationItem[];
  windowWidth: number;

  // Constructor
  constructor() {
    this.windowWidth = window.innerWidth;
  }

  // Life cycle events
  ngOnInit() {
    // Filtrar los menús según los accesos del usuario
    this.navigations = this.filterNavItems(JSON.parse(JSON.stringify(NavigationItems)));

    if (this.windowWidth < 1025) {
      setTimeout(() => {
        (document.querySelector('.coded-navbar') as HTMLDivElement)?.classList.add('menupos-static');
      }, 500);
    }
  }

  /**
   * Filtra recursivamente los items de navegación asegurándose
   * de que el usuario tenga acceso a las rutas y a los sub-menús específicos.
   */
  private filterNavItems(items: NavigationItem[]): NavigationItem[] {
    return items.filter(item => {
      // 1. Validar acceso a nivel de item visual (para collapses y sub-áreas)
      if (!this.menuAccessService.hasAccessToNavItem(item)) {
        return false;
      }

      // Si el item tiene hijos, los filtramos recursivamente
      if (item.children && item.children.length > 0) {
        item.children = this.filterNavItems(item.children);
        // Mantenemos este grupo/collapse si le quedó al menos un hijo
        return item.children.length > 0;
      }

      // Si es un item final con URL, verificamos el acceso por módulo
      if (item.url) {
        const urlParts = item.url.split('/');
        const moduleName = urlParts[0] as AppModule;

        // Validamos contra los módulos principales
        if (['production', 'inventories', 'printing', 'clientHome'].includes(moduleName)) {
          return this.menuAccessService.hasAccessTo(moduleName);
        }
        return true; // Permitimos por defecto si es otra URL
      }

      // Si no es un item ruteable (por ej. un label sin hijos), por defecto se oculta
      // a menos que tenga una configuración especial. Si entra aquí, usualmente es un grupo vacío.
      return false;
    });
  }

  fireOutClick() {
    let current_url = this.location.path();
    // eslint-disable-next-line
    // @ts-ignore
    if (this.location['_baseHref']) {
      // eslint-disable-next-line
      // @ts-ignore
      current_url = this.location['_baseHref'] + this.location.path();
    }
    const link = "a.nav-link[ href='" + current_url + "' ]";
    const ele = document.querySelector(link);
    if (ele !== null && ele !== undefined) {
      const parent = ele.parentElement;
      const up_parent = parent?.parentElement?.parentElement;
      const last_parent = up_parent?.parentElement;
      if (parent?.classList.contains('coded-hasmenu')) {
        parent.classList.add('coded-trigger');
        parent.classList.add('active');
      } else if (up_parent?.classList.contains('coded-hasmenu')) {
        up_parent.classList.add('coded-trigger');
        up_parent.classList.add('active');
      } else if (last_parent?.classList.contains('coded-hasmenu')) {
        last_parent.classList.add('coded-trigger');
        last_parent.classList.add('active');
      }
    }
  }
}
