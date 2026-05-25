import { Component } from '@angular/core';
import { SharedNewsComponent } from '../../../theme/layout/admin/navigation/shared-news/shared-news.component';

@Component({
  selector: 'app-rails-news',
  standalone: true,
  imports: [SharedNewsComponent],
  templateUrl: './rails-news.html',
  styleUrl: './rails-news.scss'
})
export class RailsNews {}
