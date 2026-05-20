import { Component } from '@angular/core';
import { SharedNewsComponent } from '../../../theme/layout/admin/navigation/shared-news/shared-news.component';

@Component({
  selector: 'app-pipes-news',
  standalone: true,
  imports: [SharedNewsComponent],
  templateUrl: './pipes-news.html',
  styleUrl: './pipes-news.scss'
})
export class PipesNews {}
