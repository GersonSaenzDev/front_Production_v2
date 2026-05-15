import { Component } from '@angular/core';
import { SharedNewsComponent } from '../../../theme/layout/admin/navigation/shared-news.component';

@Component({
  selector: 'app-glass-news',
  standalone: true,
  imports: [SharedNewsComponent],
  templateUrl: './glass-news.html',
  styleUrl: './glass-news.scss'
})
export class GlassNews {}
