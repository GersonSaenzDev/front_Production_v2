import { Component } from '@angular/core';
import { SharedNewsComponent } from '../../theme/layout/admin/navigation/shared-news.component';

@Component({
  selector: 'app-maintenance-news',
  standalone: true,
  imports: [SharedNewsComponent],
  templateUrl: './maintenance-news.html',
  styleUrl: './maintenance-news.scss'
})
export class MaintenanceNews {}
