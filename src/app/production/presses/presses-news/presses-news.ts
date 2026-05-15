import { Component } from '@angular/core';
import { SharedNewsComponent } from '../../../theme/layout/admin/navigation/shared-news.component';

@Component({
  selector: 'app-presses-news',
  standalone: true,
  imports: [SharedNewsComponent],
  templateUrl: './presses-news.html',
  styleUrl: './presses-news.scss'
})
export class PressesNews {}
