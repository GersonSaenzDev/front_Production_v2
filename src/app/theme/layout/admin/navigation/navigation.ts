// app/theme/layout/admin/navigation/navigation.ts
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
        id: 'prensas-collapse',
        title: 'Prensas',
        type: 'collapse',
        icon: 'ti ti-layout-bottombar', // Un icono más acorde a prensas
        classes: 'nav-item',
        isMainParent: true,
        children: [
          {
            id: 'novedades-prensas-item',
            title: 'Novedades Prensas',
            type: 'item',
            url: 'production/presses/pressesNews',
            breadcrumbs: true
          },
          {
            id: 'visualizar-prensas-item',
            title: 'Visualizar Novedades',
            type: 'item',
            url: 'production/presses/viewNews',
            breadcrumbs: true
          }
        ]
      },
      {
        id: 'vidrios-collapse',
        title: 'Vidrios',
        type: 'collapse',
        icon: 'ti ti-maximize',
        classes: 'nav-item',
        isMainParent: true,
        children: [
          {
            id: 'novedades-vidrios-item',
            title: 'Novedades Vidrios',
            type: 'item',
            url: 'production/glass/glassNews',
            breadcrumbs: true
          },
          {
            id: 'visualizar-vidrios-item',
            title: 'Visualizar Novedades',
            type: 'item',
            url: 'production/glass/viewNews',
            breadcrumbs: true
          }
        ]
      },
      {
        id: 'recubrimientos-collapse',
        title: 'Recubrimientos',
        type: 'collapse',
        icon: 'ti ti-color-swatch',
        classes: 'nav-item',
        isMainParent: true,
        children: [
          {
            id: 'novedades-recubrimientos-item',
            title: 'Novedades Recubrimientos',
            type: 'item',
            url: 'production/covering/coveringNews',
            breadcrumbs: true
          },
          {
            id: 'visualizar-recubrimientos-item',
            title: 'Visualizar Novedades',
            type: 'item',
            url: 'production/covering/viewNews',
            breadcrumbs: true
          }
        ]
      },
      {
        id: 'satelites-collapse',
        title: 'Satélites',
        type: 'collapse',
        icon: 'ti ti-satellite',
        classes: 'nav-item',
        isMainParent: true,
        children: [
          {
            id: 'novedades-satelites-item',
            title: 'Novedades Satélites',
            type: 'item',
            url: 'production/satellites/satellitesNews',
            breadcrumbs: true
          },
          {
            id: 'visualizar-satelites-item',
            title: 'Visualizar Novedades',
            type: 'item',
            url: 'production/satellites/viewNews',
            breadcrumbs: true
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
  },
  {
    id: 'oxyplast-group',
    title: 'Oxyplast',
    type: 'group',
    icon: 'ti ti-spray',
    children: [
      {
        id: 'oxyplast-collapse',
        title: 'Oxyplast',
        type: 'collapse',
        icon: 'ti ti-spray',
        classes: 'nav-item',
        isMainParent: true,
        children: [
          {
            id: 'novedades-oxyplast-item',
            title: 'Novedades Oxyplast',
            type: 'item',
            url: 'production/oxyplast/oxyplastNews',
            breadcrumbs: true
          },
          {
            id: 'visualizar-oxyplast-item',
            title: 'Visualizar Novedades',
            type: 'item',
            url: 'production/oxyplast/viewNews',
            breadcrumbs: true
          }
        ]
      }
    ]
  },
  {
    id: 'compras-group',
    title: 'Compras',
    type: 'group',
    icon: 'ti ti-shopping-cart',
    children: [
      {
        id: 'compras-collapse',
        title: 'Compras',
        type: 'collapse',
        icon: 'ti ti-shopping-cart',
        classes: 'nav-item',
        isMainParent: true,
        children: [
          {
            id: 'novedades-compras-item',
            title: 'Novedades Compras',
            type: 'item',
            url: 'production/purchases/purchasesNews',
            breadcrumbs: true
          },
          {
            id: 'visualizar-compras-item',
            title: 'Visualizar Novedades',
            type: 'item',
            url: 'production/purchases/viewNews',
            breadcrumbs: true
          }
        ]
      }
    ]
  },
  {
    id: 'ambiental-group',
    title: 'Gestión Ambiental',
    type: 'group',
    icon: 'ti ti-leaf',
    children: [
      {
        id: 'ambiental-collapse',
        title: 'Gestión Ambiental',
        type: 'collapse',
        icon: 'ti ti-leaf',
        classes: 'nav-item',
        isMainParent: true,
        children: [
          {
            id: 'novedades-ambiental-item',
            title: 'Novedades Ambiental',
            type: 'item',
            url: 'production/environmental/environmentalNews',
            breadcrumbs: true
          },
          {
            id: 'visualizar-ambiental-item',
            title: 'Visualizar Novedades',
            type: 'item',
            url: 'production/environmental/viewNews',
            breadcrumbs: true
          }
        ]
      }
    ]
  },
  {
    id: 'laboratorio-group',
    title: 'Laboratorio',
    type: 'group',
    icon: 'ti ti-flask',
    children: [
      {
        id: 'laboratorio-collapse',
        title: 'Laboratorio',
        type: 'collapse',
        icon: 'ti ti-flask',
        classes: 'nav-item',
        isMainParent: true,
        children: [
          {
            id: 'novedades-laboratorio-item',
            title: 'Novedades Laboratorio',
            type: 'item',
            url: 'production/laboratory/laboratoryNews',
            breadcrumbs: true
          },
          {
            id: 'visualizar-laboratorio-item',
            title: 'Visualizar Novedades',
            type: 'item',
            url: 'production/laboratory/viewNews',
            breadcrumbs: true
          }
        ]
      }
    ]
  },
  {
    id: 'logistica-group',
    title: 'Logística',
    type: 'group',
    icon: 'ti ti-truck',
    children: [
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
        id: 'clientHome-collapse',
        title: 'Casa Cliente',
        type: 'collapse',
        icon: 'ti ti-home-2',
        classes: 'nav-item',
        isMainParent: true,
        children: [
          {
            id: 'control-casa-cliente-item',
            title: 'Control Casa Cliente',
            type: 'item',
            url: 'clientHome/dash',
            breadcrumbs: false
          },
          {
            id: 'control-pedidos-item',
            title: 'Control Pedidos',
            type: 'item',
            url: 'clientHome/orderControl',
            breadcrumbs: false
          },
          {
            id: 'pedidos-procesados-item',
            title: 'Pedidos Procesados',
            type: 'item',
            url: 'clientHome/processedOrders',
            breadcrumbs: false
          },
          {
            id: 'control-envios-item',
            title: 'Control de Envios',
            type: 'item',
            url: 'clientHome/shippingManagement',
            breadcrumbs: false
          }
        ]
      },
      {
        id: 'almacen-collapse',
        title: 'Almacén',
        type: 'collapse',
        icon: 'ti ti-box',
        classes: 'nav-item',
        isMainParent: true,
        children: [
          {
            id: 'almacen-novedades-item',
            title: 'Novedades Almacén',
            type: 'item',
            url: 'logistics/almacen/logisticsNews',
            breadcrumbs: true
          },
          {
            id: 'almacen-view-news-item',
            title: 'Visualizar Novedades',
            type: 'item',
            url: 'logistics/almacen/viewNews',
            breadcrumbs: true
          }
        ]
      }
    ]
  },
  {
    id: 'mantenimiento-group',
    title: 'Mantenimiento',
    type: 'group',
    icon: 'ti ti-settings',
    children: [
      {
        id: 'mantenimiento-collapse',
        title: 'Mantenimiento',
        type: 'collapse',
        icon: 'ti ti-settings-cog',
        classes: 'nav-item',
        isMainParent: true,
        children: [
          {
            id: 'mantenimiento-novedades',
            title: 'Novedades Mantenimiento',
            type: 'item',
            url: 'maintenance/maintenanceNews',
            breadcrumbs: true
          },
          {
            id: 'mantenimiento-view-news',
            title: 'Visualizar Novedades',
            type: 'item',
            url: 'maintenance/viewNews',
            breadcrumbs: true
          }
        ]
      }
    ]
  },
  {
    id: 'mecanizado-group',
    title: 'Mecanizado',
    type: 'group',
    icon: 'ti ti-tool',
    children: [
      {
        id: 'mecanizado-collapse',
        title: 'Mecanizado',
        type: 'collapse',
        icon: 'ti ti-tool',
        classes: 'nav-item',
        isMainParent: true,
        children: [
          {
            id: 'mecanizado-novedades-item',
            title: 'Novedades Mecanizado',
            type: 'item',
            url: 'machining/machiningNews',
            breadcrumbs: true
          },
          {
            id: 'mecanizado-view-news-item',
            title: 'Visualizar Novedades',
            type: 'item',
            url: 'machining/viewNews',
            breadcrumbs: true
          }
        ]
      }
    ]
  },
  {
    id: 'ingenieria-group',
    title: 'Ingeniería',
    type: 'group',
    icon: 'ti ti-cpu',
    children: [
      {
        id: 'ingenieria-producto-collapse',
        title: 'Ingeniería de Producto',
        type: 'collapse',
        icon: 'ti ti-box-seam',
        classes: 'nav-item',
        isMainParent: true,
        children: [
          {
            id: 'ingenieria-producto-novedades',
            title: 'Novedades Ingeniería de Producto',
            type: 'item',
            url: 'engineering/product/engineeringNews',
            breadcrumbs: true
          },
          {
            id: 'ingenieria-producto-view',
            title: 'Visualizar Novedades',
            type: 'item',
            url: 'engineering/product/viewNews',
            breadcrumbs: true
          }
        ]
      },
      {
        id: 'ingenieria-industrial-collapse',
        title: 'Ingeniería Industrial',
        type: 'collapse',
        icon: 'ti ti-building-factory-2',
        classes: 'nav-item',
        isMainParent: true,
        children: [
          {
            id: 'ingenieria-industrial-novedades',
            title: 'Novedades Ingeniería Industrial',
            type: 'item',
            url: 'engineering/industrial/engineeringNews',
            breadcrumbs: true
          },
          {
            id: 'ingenieria-industrial-view',
            title: 'Visualizar Novedades',
            type: 'item',
            url: 'engineering/industrial/viewNews',
            breadcrumbs: true
          }
        ]
      }
    ]
  },
  {
    id: 'recursos-humanos-group',
    title: 'Recursos Humanos',
    type: 'group',
    icon: 'ti ti-users',
    children: [
      {
        id: 'rrhh-collapse',
        title: 'Recursos Humanos',
        type: 'collapse',
        icon: 'ti ti-user-cog',
        classes: 'nav-item',
        isMainParent: true,
        children: [
          {
            id: 'rrhh-novedades',
            title: 'Novedades RRHH',
            type: 'item',
            url: 'human-resources/human-resourcesNews',
            breadcrumbs: true
          },
          {
            id: 'rrhh-view-news',
            title: 'Visualizar Novedades',
            type: 'item',
            url: 'human-resources/viewNews',
            breadcrumbs: true
          }
        ]
      }
    ]
  },
  {
    id: 'calidad-group',
    title: 'Calidad',
    type: 'group',
    icon: 'ti ti-shield-check',
    children: [
      {
        id: 'calidad-collapse',
        title: 'Calidad',
        type: 'collapse',
        icon: 'ti ti-shield-check',
        classes: 'nav-item',
        isMainParent: true,
        children: [
          {
            id: 'calidad-novedades',
            title: 'Novedades Calidad',
            type: 'item',
            url: 'quality/qualityNews',
            breadcrumbs: true
          },
          {
            id: 'calidad-view-news',
            title: 'Visualizar Novedades',
            type: 'item',
            url: 'quality/viewNews',
            breadcrumbs: true
          }
        ]
      }
    ]
  },
  {
    id: 'sst-group',
    title: 'SST',
    type: 'group',
    icon: 'ti ti-heart-rate-monitor',
    children: [
      {
        id: 'sst-collapse',
        title: 'SST',
        type: 'collapse',
        icon: 'ti ti-heart-rate-monitor',
        classes: 'nav-item',
        isMainParent: true,
        children: [
          {
            id: 'sst-novedades',
            title: 'Novedades SST',
            type: 'item',
            url: 'health-safety/health-safetyNews',
            breadcrumbs: true
          },
          {
            id: 'sst-view-news',
            title: 'Visualizar Novedades',
            type: 'item',
            url: 'health-safety/viewNews',
            breadcrumbs: true
          }
        ]
      }
    ]
  }
];