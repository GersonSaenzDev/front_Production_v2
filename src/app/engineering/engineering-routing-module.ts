import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  // Ingeniería de Producto
  {
    path: 'product/engineeringNews',
    loadComponent: () =>
      import('./product/engineering-news/engineering-news').then(c => c.ProductEngineeringNews)
  },
  {
    path: 'product/viewNews',
    loadComponent: () =>
      import('./product/view-news/view-news').then(c => c.ProductEngineeringViewNews)
  },
  // Ingeniería Industrial
  {
    path: 'industrial/engineeringNews',
    loadComponent: () =>
      import('./industrial/engineering-news/engineering-news').then(c => c.IndustrialEngineeringNews)
  },
  {
    path: 'industrial/viewNews',
    loadComponent: () =>
      import('./industrial/view-news/view-news').then(c => c.IndustrialEngineeringViewNews)
  },
  // Gestión de Estructuras
  {
    path: 'structureManagements/load',
    loadComponent: () =>
      import('./structure-managements/structure-load/structure-load').then(c => c.StructureLoad)
  },
  {
    path: 'structureManagements/viewByReference',
    loadComponent: () =>
      import('./structure-managements/view-by-reference/view-by-reference').then(c => c.ViewByReference)
  },
  {
    path: 'structureManagements/materialMaster',
    loadComponent: () =>
      import('./structure-managements/material-master/material-master').then(c => c.MaterialMaster)
  },
  // Planificación y Capacidad
  {
    path: 'structureManagements/requirementsCalculation',
    loadComponent: () =>
      import('./structure-managements/requirements-calculation/requirements-calculation').then(c => c.RequirementsCalculation)
  },
  {
    path: 'structureManagements/referenceAnalysis',
    loadComponent: () =>
      import('./structure-managements/reference-analysis/reference-analysis').then(c => c.ReferenceAnalysis)
  },
  {
    path: 'structureManagements/capacityAnalysis',
    loadComponent: () =>
      import('./structure-managements/capacity-analysis/capacity-analysis').then(c => c.CapacityAnalysis)
  },
  {
    path: 'structureManagements/productionOptimization',
    loadComponent: () =>
      import('./structure-managements/production-optimization/production-optimization').then(c => c.ProductionOptimization)
  },
  // Auditoría de Costos
  {
    path: 'structureManagements/costAuditSummary',
    loadComponent: () =>
      import('./structure-managements/cost-audit-summary/cost-audit-summary').then(c => c.CostAuditSummary)
  },
  {
    path: 'structureManagements/referenceAudit',
    loadComponent: () =>
      import('./structure-managements/reference-audit/reference-audit').then(c => c.ReferenceAudit)
  },
  {
    path: 'structureManagements/referenceAuditDetail',
    loadComponent: () =>
      import('./structure-managements/reference-audit-detail/reference-audit-detail').then(c => c.ReferenceAuditDetail)
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class EngineeringRoutingModule {}
