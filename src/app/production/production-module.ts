import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';


import { ProductionRoutingModule } from './production-routing-module';
import { NgbAlertModule } from '@ng-bootstrap/ng-bootstrap';


@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    NgbAlertModule,
    ProductionRoutingModule
  ]
})
export class ProductionModule { }
