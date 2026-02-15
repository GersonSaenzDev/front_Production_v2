import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ClientHomeRoutingModule } from './client-home-routing-module';
import { NgbAlertModule } from '@ng-bootstrap/ng-bootstrap';


@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    ClientHomeRoutingModule,
    NgbAlertModule,
  ]
})
export class ClientHomeModule { }
