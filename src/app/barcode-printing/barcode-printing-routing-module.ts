import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DashPrinting } from './dash-printing/dash-printing';

const routes: Routes = [
  {
    path: '',
    component: DashPrinting,
    children: [
      {
        path: 'dash',
        loadComponent: () => import('./dash-printing/dash-printing').then((c) => c.DashPrinting)
      },
    ]
  },
  {
    path: 'barcodePrinting',
    loadComponent: () => import('./barcode-printing/barcode-printing').then((c) => c.BarcodePrinting)
  },
  {
    path: 'barcodeParameters',
    loadComponent: () => import('./printing-parameters/printing-parameters').then((c) => c.PrintingParameters)
  },
  {
    path: 'readBarcode',
    loadComponent: () => import('./read-barcode/read-barcode').then((c) => c.ReadBarcode)
  },
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class BarcodePrintingRoutingModule { }
