// Angular import
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

// project import
import { SpinnerComponent } from './theme/shared/components/spinner/spinner.component';
import { NgxPaginationModule } from 'ngx-pagination';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  imports: [
    RouterOutlet,
    SpinnerComponent,
    NgxPaginationModule,
  ],
  providers: [
  ]
})
export class AppComponent {
  title = 'Control de Produccion Indusel';
}
