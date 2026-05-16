import { Component } from '@angular/core';
import { SharedNewsComponent } from '../../../theme/layout/admin/navigation/shared-news/shared-news.component';

@Component({
  selector: 'app-covering-news',
  standalone: true,
  imports: [SharedNewsComponent],
  templateUrl: './covering-news.html',
  styleUrl: './covering-news.scss'
})
export class CoveringNews {}
