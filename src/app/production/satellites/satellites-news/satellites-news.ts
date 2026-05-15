import { Component } from '@angular/core';
import { SharedNewsComponent } from '../../../theme/layout/admin/navigation/shared-news.component';

@Component({
  selector: 'app-satellites-news',
  standalone: true,
  imports: [SharedNewsComponent],
  templateUrl: './satellites-news.html',
  styleUrl: './satellites-news.scss'
})
export class SatellitesNews {}
