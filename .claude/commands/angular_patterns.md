# Angular Patterns — Best Practices

> Observable management, signals, lifecycle, lazy loading, and error handling.

---

## 1. Always Unsubscribe

Memory leaks occur when subscriptions are never cleaned up.

```typescript
// ✅ BEST — Angular 16+ with takeUntilDestroyed
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

export class PermissionsComponent {
  private destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.service.getPermissions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => this.permissions = data);
  }
}

// ✅ ALTERNATIVE — manual with Subject
export class PermissionsComponent implements OnDestroy {
  private destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.service.getPermissions()
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => this.permissions = data);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
```

---

## 2. Use `async` Pipe in Templates — Avoid Manual Subscribe

```typescript
// ❌ BAD — manual subscription, must remember to unsubscribe
ngOnInit(): void {
  this.service.getStaff().subscribe(data => {
    this.staffList = data;
  });
}
```

```html
<!-- ✅ GOOD — async pipe subscribes and unsubscribes automatically -->
<div *ngFor="let staff of staffList$ | async">
  {{ staff.full_name }}
</div>
```

---

## 3. Handle Loading and Error States

```typescript
// ✅ Three-state pattern for every API call
export class PermissionsComponent {
  isLoading = false;
  errorMessage = '';
  permissions: Permission[] = [];

  loadPermissions(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.service.getPermissions()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isLoading = false)
      )
      .subscribe({
        next: (response) => {
          if (response.ok) {
            this.permissions = response.data ?? [];
          } else {
            this.errorMessage = response.msg ?? 'Error loading data.';
          }
        },
        error: (err) => {
          this.errorMessage = 'Connection error. Please try again.';
        }
      });
  }
}
```

---

## 4. Services — Single Responsibility

```typescript
// ✅ One service per feature domain
@Injectable({ providedIn: 'root' })
export class PermissionsService {
  private readonly apiUrl = `${environment.apiUrl}/permission`;

  constructor(private http: HttpClient) {}

  getPermissionsByUser(document: string): Observable<ApiResponse<Permission[]>> {
    return this.http.post<ApiResponse<Permission[]>>(
      `${this.apiUrl}/viewPermissions`,
      { document }
    );
  }
}
```

---

## 5. Lazy Loading — Every Feature Module

```typescript
// ✅ app.routes.ts — load feature modules on demand
export const routes: Routes = [
  {
    path: 'permissions',
    loadChildren: () => import('./features/permissions/permissions.routes')
      .then(m => m.PERMISSIONS_ROUTES)
  }
];
```

---

## 6. Signals — Prefer for Local Component State (Angular 16+)

```typescript
// ✅ Signals for reactive local state
export class StaffFormComponent {
  isSubmitting = signal(false);
  formErrors = signal<string[]>([]);

  submit(): void {
    this.isSubmitting.set(true);
    // ...
  }
}
```