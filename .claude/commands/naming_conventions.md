# Naming Conventions — Angular Projects

> All identifiers in English. Name describes purpose, not technology.

---

## Angular Building Blocks

| Block | Suffix | File pattern | Example |
|---|---|---|---|
| Component | `Component` | `kebab-case.component.ts` | `StaffListComponent` → `staff-list.component.ts` |
| Service | `Service` | `kebab-case.service.ts` | `PermissionsService` → `permissions.service.ts` |
| Pipe | `Pipe` | `kebab-case.pipe.ts` | `DateFormatPipe` → `date-format.pipe.ts` |
| Directive | `Directive` | `kebab-case.directive.ts` | `HighlightDirective` → `highlight.directive.ts` |
| Guard | `Guard` | `kebab-case.guard.ts` | `AuthGuard` → `auth.guard.ts` |
| Interceptor | `Interceptor` | `kebab-case.interceptor.ts` | `TokenInterceptor` → `token.interceptor.ts` |
| Interface | No suffix | `kebab-case.model.ts` | `StaffRecord` → `staff.model.ts` |
| Enum | No suffix | `kebab-case.enum.ts` | `PermissionStatus` → `permission-status.enum.ts` |

---

## Methods — Verb + Subject

```typescript
// ✅ Good method names
loadStaffList(): void { }
handlePermissionApproval(permissionId: string): void { }
formatDateForDisplay(date: string): string { }
isPermissionActive(permission: Permission): boolean { }
buildRequestPayload(formData: FormData): CreatePermissionRequest { }
```

---

## Properties — Describe What They Hold

```typescript
// ❌ BAD
data: any[] = [];
flag = false;
list: any;

// ✅ GOOD
staffList: StaffRecord[] = [];
isLoadingPermissions = false;
selectedPermission: Permission | null = null;
```

---

## Booleans — Always `is`, `has`, `can`, `should`

```typescript
isLoading = false;
hasActivePermission = false;
canEditRecord = true;
shouldRefreshList = false;
```

---

## Observables — Suffix with `$`

```typescript
// ✅ Clearly identifies Observable variables
staffList$: Observable<StaffRecord[]>;
permissions$ = this.permissionsService.getAll();
destroy$ = new Subject<void>();
```

---

## Template Variables — `#camelCase`

```html
<!-- ✅ Descriptive template reference variables -->
<input #searchInput type="text">
<app-staff-form #staffForm></app-staff-form>
<ng-template #loadingTemplate>...</ng-template>
```