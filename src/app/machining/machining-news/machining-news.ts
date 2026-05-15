import { Component } from '@angular/core';
import { SharedNewsComponent } from '../../theme/layout/admin/navigation/shared-news.component';

@Component({
  selector: 'app-machining-news',
  standalone: true,
  imports: [SharedNewsComponent],
  templateUrl: './machining-news.html',
  styleUrl: './machining-news.scss'
})
export class MachiningNews {}
