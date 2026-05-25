import { Component } from '@angular/core';
import { SharedNewsComponent } from '../../../theme/layout/admin/navigation/shared-news/shared-news.component';

@Component({
  selector: 'app-wood-news',
  standalone: true,
  imports: [SharedNewsComponent],
  templateUrl: './wood-news.html',
  styleUrl: './wood-news.scss'
})
export class WoodNews {}
