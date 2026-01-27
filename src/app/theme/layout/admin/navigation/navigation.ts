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
    icon: 'ti ti-layout-dashboard', // Icono de tablero principal
    children: [
      {
        id: 'dashboard-default',
        title: 'Dashboard',
        type: 'item',
        classes: 'nav-item',
        url: '/production',
        icon: 'ti ti-chart-bar',
        breadcrumbs: false
      }
    ]
  },
  {
    id: 'planeacion-group', // Cambiado para ser único
    title: 'Planeación',
    type: 'group',
    icon: 'ti ti-calendar-stats', // Icono de planificación
    children: [
      {
        id: 'cargue-collapse',
        title: 'Cargue',
        type: 'collapse',
        icon: 'ti ti-truck-loading', // Icono de carga/logística
        classes: 'nav-item',
        isMainParent: true,
        children: [
          {
            id: 'planeacion-produccion-item',
            title: 'Planeacion Producción',
            type: 'item',
            url: 'production/productionNews',
            breadcrumbs: true
          }
        ]
      },
      {
        id: 'dashboard-planeacion-collapse',
        title: 'Dashboard Planeación',
        type: 'collapse',
        icon: 'ti ti-presentation-analytics', // Icono de análisis
        classes: 'nav-item',
        isMainParent: true,
        children: [
          {
            id: 'alistamiento-pedidos-planeacion',
            title: 'Alistamiento Pedidos',
            type: 'item',
            url: 'inventories/orderPreparation',
            breadcrumbs: false
          }
        ]
      }
    ]
  },
  {
    id: 'produccion-group',
    title: 'Producción',
    type: 'group',
    icon: 'ti ti-settings-automation', // Icono de procesos industriales
    children: [
      {
        id: 'ensamble-collapse',
        title: 'Ensamble',
        type: 'collapse',
        icon: 'ti ti-tools', // Icono de herramientas/ensamble
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
            id: 'visualizar-novedades-item',
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
            id: 'alistamiento-pedidos-item',
            title: 'Alistamiento Pedidos',
            type: 'item',
            url: 'inventories/orderPreparation',
            breadcrumbs: false
          },
          {
            id: 'registro-novedades-bodega-item',
            title: 'Registro Novedades',
            type: 'item',
            url: 'production/wineryNews',
            breadcrumbs: false
          },
          {
            id: 'ver-novedades-bodega-item',
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
          },
          {
            id: 'inventario-bodega-item',
            title: 'Inventario Bodega',
            type: 'item',
            url: 'inventories/enterInventory',
            breadcrumbs: false
          },
          {
            id: 'informe-final-inventario-item',
            title: 'Informe Final Inventario',
            type: 'item',
            url: 'inventories/finalInventoryReport',
            breadcrumbs: false
          }
        ]
      },
      {
        id: 'etiquetas-collapse',
        title: 'Generar Etiquetas',
        type: 'collapse',
        icon: 'ti ti-barcode', // Icono específico de código de barras
        classes: 'nav-item',
        isMainParent: true,
        children: [
          {
            id: 'control-impresion-item',
            title: 'Control Impresion',
            type: 'item',
            url: 'printing/dash',
            breadcrumbs: false
          },
          {
            id: 'parametros-etiquetas-item',
            title: 'Parametros Etiquetas',
            type: 'item',
            url: 'printing/barcodeParameters',
            breadcrumbs: false
          },
          {
            id: 'impresion-etiquetas-real-item',
            title: 'Impresion Etiquetas',
            type: 'item',
            url: 'printing/barcodePrinting',
            breadcrumbs: false
          },
          {
            id: 'leer-etiquetas-procesos-item',
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