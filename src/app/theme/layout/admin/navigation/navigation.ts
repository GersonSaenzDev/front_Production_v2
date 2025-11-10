export interface NavigationItem {
  id: string;
  title: string;
  type: 'item' | 'collapse' | 'group';
  translate?: string;
  icon?: string;
  hidden?: boolean;
  url?: string;
  classes?: string;
  external?: boolean;
  target?: boolean;
  breadcrumbs?: boolean;
  children?: NavigationItem[];
  role?: string[];
  isMainParent?: boolean;
}

export const NavigationItems: NavigationItem[] = [
  {
    id: 'dashboard-group',
    title: 'Panel de Control',
    type: 'group',
    icon: 'ti ti-building-factory-2',
    children: [
      {
        id: 'dashboard-default',
        title: 'Dashboard',
        type: 'item',
        classes: 'nav-item',
        url: '/production',
        icon: 'ti ti-building-factory',
        breadcrumbs: false
      }
    ]
  },
  {
    id: 'produccion-group',
    title: 'Producción',
    type: 'group',
    icon: 'icon-navigation',
    children: [
      {
        id: 'ensamble-collapse',
        title: 'Ensamble',
        type: 'collapse',
        icon: 'ti ti-brand-codesandbox',
        classes: 'nav-item',
        isMainParent: true,
        children: [
          {
            id: 'novedades-produccion-item',
            title: 'Novedades Producción',
            type: 'item',
            url: 'production/productionNews',
            breadcrumbs: true
          },
          {
            id: 'novedades-produccion-item',
            title: 'Visualizar Novedades',
            type: 'item',
            url: 'production/viewNews',
            breadcrumbs: true
          }
        ]
      },
      {
        id: 'bodega-collapse',
        title: 'Bodega',
        type: 'collapse',
        icon: 'ti ti-building-warehouse',
        classes: 'nav-item',
        isMainParent: true,
        children: [
          {
            id: 'registro-novedades-item',
            title: 'Registro Novedades',
            type: 'item',
            url: 'production/wineryNews',
            breadcrumbs: false
          },
          {
            id: 'ver-novedades-item',
            title: 'Ver Novedades',
            type: 'item',
            url: 'inventories/checkNews',
            breadcrumbs: false
          },
          {
            id: 'dashboard-inventarios-item',
            title: 'Dashboard Inventarios',
            type: 'item',
            url: 'inventories/dash',
            breadcrumbs: false
          }
          ,
          {
            id: 'dashboard-inventarios-item',
            title: 'Inventario Bodega',
            type: 'item',
            url: 'inventories/enterInventory',
            breadcrumbs: false
          }
        ]
      },
      {
        id: 'etiquetas-collapse',
        title: 'Generar Etiquetas',
        type: 'collapse',
        icon: 'ti ti-vocabulary',
        classes: 'nav-item',
        isMainParent: true,
        children: [
          {
            id: 'impresion-etiquetas-item',
            title: 'Control Impresion',
            type: 'item',
            url: 'printing/dash',
            breadcrumbs: false
          },
          {
            id: 'impresion-etiquetas-item',
            title: 'Parametros Etiquetas',
            type: 'item',
            url: 'printing/barcodeParameters',
            breadcrumbs: false
          },
          {
            id: 'impresion-etiquetas-item',
            title: 'Impresion Etiquetas',
            type: 'item',
            url: 'printing/barcodePrinting',
            breadcrumbs: false
          },
          {
            id: 'leer-etiquetas-item',
            title: 'Procesos',
            type: 'item',
            url: 'printing/readBarcode',
            breadcrumbs: false
          }
        ]
      }
    ]
  }
];