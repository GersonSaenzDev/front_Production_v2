# TypeScript Code Style — Angular Projects

> Standards for TypeScript in Angular 19+. All identifiers in English.

---

## 1. Naming

| Type | Convention | Example |
|---|---|---|
| Class / Component / Service | `PascalCase` | `StaffListComponent`, `PermissionsService` |
| Interface | `PascalCase` (no `I` prefix) | `StaffRecord`, `ApiResponse`, `OvertimeBatch` |
| Enum | `PascalCase` name, `UPPER_SNAKE_CASE` values | `PermissionStatus.APPROVED` |
| Method / function | `camelCase` + verb | `loadPermissions()`, `handleError()` |
| Property / variable | `camelCase` | `isLoading`, `staffList`, `selectedDate` |
| Constant | `UPPER_SNAKE_CASE` | `MAX_FILE_SIZE_MB`, `API_DATE_FORMAT` |
| File | `kebab-case` | `staff-list.component.ts`, `permissions.service.ts` |

---

## 2. Interfaces — Always Type API Responses

```typescript
// ❌ BAD — no types, any is dangerous
getPermissions(): Observable<any> { }

// ✅ GOOD — typed response matching the backend contract
interface ApiResponse<T> {
  ok: boolean;
  msg?: string;
  data?: T;
}

interface Permission {
  _id: string;
  employeeName: string;
  status: 'pendiente' | 'aprobado' | 'rechazado' | 'cancelado';
  startDatePermission: string;  // DD/MM/YYYY format
  payrollDiscount: boolean;
}

getPermissions(): Observable<ApiResponse<Permission[]>> { }
```

---

## 3. `const` / `let` — Never `var`

```typescript
// ❌ NEVER
var token = localStorage.getItem('token');

// ✅ const for values that don't reassign
const staffRecord = response.data[0];

// ✅ let only when reassignment is needed
let isLoading = false;
```

---

## 4. Strict Null Checks — Handle Them

```typescript
// ❌ BAD — runtime crash if data is null
const name = response.data.employeeName;

// ✅ GOOD — optional chaining + nullish coalescing
const name = response.data?.employeeName ?? 'Unknown';
const total = response.data?.length ?? 0;
```

---

## 5. Enums for Fixed Values

```typescript
// ❌ BAD — magic strings scattered in code
if (status === 'aprobado') { }

// ✅ GOOD — enum matches backend values
enum PermissionStatus {
  PENDING = 'pendiente',
  APPROVED = 'aprobado',
  REJECTED = 'rechazado',
  CANCELLED = 'cancelado'
}

if (status === PermissionStatus.APPROVED) { }
```

---

## 6. No `any` — Use `unknown` When Type Is Truly Unknown

```typescript
// ❌ BAD — disables all type checking
handleError(error: any) { }

// ✅ GOOD
handleError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error';
}
```