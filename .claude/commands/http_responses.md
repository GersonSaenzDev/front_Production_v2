# HTTP Responses — Angular API Communication

> Standards for HttpClient usage, interceptors, and handling the backend's response contract.

---

## 1. Backend Response Contract

Every API call returns this shape — always type it:

```typescript
interface ApiResponse<T = null> {
  ok: boolean;
  msg?: string;
  data?: T;
  errors?: string[];
}
```

---

## 2. Always Check `ok` Before Using Data

```typescript
// ❌ BAD — assumes success
this.service.createPermission(data).subscribe(response => {
  this.permissions = response.data;
});

// ✅ GOOD — handles both paths
this.service.createPermission(data).subscribe({
  next: (response) => {
    if (response.ok) {
      this.toastr.success('Permission created successfully.');
      this.loadPermissions();
    } else {
      this.toastr.error(response.msg ?? 'Could not create permission.');
    }
  },
  error: () => {
    this.toastr.error('Connection error. Please try again.');
  }
});
```

---

## 3. Token Interceptor — `x-token` Header

The backend reads the JWT from the `x-token` header (not `Authorization: Bearer`).

```typescript
// ✅ Token interceptor
@Injectable()
export class TokenInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const token = localStorage.getItem('token') ?? '';

    if (token) {
      const authReq = req.clone({
        setHeaders: { 'x-token': token }
      });
      return next.handle(authReq);
    }

    return next.handle(req);
  }
}
```

---

## 4. Error Interceptor — Handle 401 Globally

```typescript
// ✅ Centralized 401 handling — redirect to login
@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
  constructor(private router: Router) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401) {
          localStorage.removeItem('token');
          this.router.navigate(['/login']);
        }
        return throwError(() => error);
      })
    );
  }
}
```

---

## 5. Date Format — Always DD/MM/YYYY

The backend stores and returns dates as `DD/MM/YYYY` strings. Never send ISO dates.

```typescript
import { DateTime } from 'luxon';

// ✅ Format before sending to API
const formattedDate = DateTime.fromJSDate(datePickerValue).toFormat('dd/MM/yyyy');

// ✅ Parse when received from API
const displayDate = DateTime.fromFormat(apiDateString, 'dd/MM/yyyy').toFormat('dd MMM yyyy');
```

---

## 6. Environment URLs

```typescript
// src/environments/environment.ts
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3011/api/v1'
};

// ✅ Always use environment — never hardcode URLs
@Injectable({ providedIn: 'root' })
export class PermissionsService {
  private apiUrl = `${environment.apiUrl}/permission`;
}
```