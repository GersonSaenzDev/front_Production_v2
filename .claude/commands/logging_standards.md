# Logging Standards — Angular Projects

> No Winston in Angular. Logging is environment-based — verbose in dev, silent in production.

---

## 1. The Rule

```typescript
// ❌ NEVER in production Angular code
console.log('response:', response);
console.error('error:', error);

// ✅ Use environment flag to guard all debug output
if (!environment.production) {
  console.log('[PermissionsService] Response:', response);
}
```

---

## 2. Create a Logger Service

Centralizes all logging so switching behavior requires one change:

```typescript
// src/app/core/services/logger.service.ts
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class LoggerService {

  log(context: string, message: string, data?: unknown): void {
    if (!environment.production) {
      console.log(`[${context}] ${message}`, data ?? '');
    }
  }

  warn(context: string, message: string, data?: unknown): void {
    if (!environment.production) {
      console.warn(`[${context}] ${message}`, data ?? '');
    }
  }

  error(context: string, message: string, error?: unknown): void {
    // Errors log in all environments for debugging
    console.error(`[${context}] ${message}`, error ?? '');
  }
}
```

---

## 3. Usage in Components and Services

```typescript
export class PermissionsService {
  constructor(private logger: LoggerService) {}

  getPermissions(): Observable<ApiResponse<Permission[]>> {
    return this.http.get<ApiResponse<Permission[]>>(`${this.apiUrl}/list`).pipe(
      tap(response => this.logger.log('PermissionsService', 'getPermissions response', response)),
      catchError(error => {
        this.logger.error('PermissionsService', 'getPermissions failed', error);
        return throwError(() => error);
      })
    );
  }
}
```

---

## 4. Log Format

```
[ContextName] action description: value
```

Examples:
```
[PermissionsService] getPermissions response: { ok: true, data: [...] }
[StaffListComponent] loadStaff failed: HttpErrorResponse { status: 401 }
[TokenInterceptor] Token attached to request: POST /permission/create
```

---

## 5. Never Log Sensitive Data

```typescript
// ❌ NEVER log tokens, passwords, or biometric data
this.logger.log('AuthService', 'Token received', token);
this.logger.log('StaffService', 'Biometric data', face_embedding);

// ✅ Log only non-sensitive identifiers
this.logger.log('AuthService', 'Login successful for user', userApp);
this.logger.log('StaffService', 'Staff loaded, count:', staffList.length);
```