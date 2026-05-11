# Angular Best Practices — Index

> Standards for Angular 19 + TypeScript 5.7 (Indusel_RH).
> Reference: [angular.dev/best-practices](https://angular.dev/best-practices)

---

## Guides

| File | What it covers |
|---|---|
| [typescript_code_style.md](typescript_code_style.md) | TypeScript naming, interfaces, enums, strict mode |
| [naming_conventions.md](naming_conventions.md) | Component/Service/Pipe/Directive/Guard naming |
| [angular_patterns.md](angular_patterns.md) | Observables, signals, async pipe, lifecycle, lazy loading |
| [http_responses.md](http_responses.md) | HttpClient, interceptors, error handling, API contract |
| [logging_standards.md](logging_standards.md) | Environment-based logging, no console.log in production |

---

## What We Already Do Right — Do Not Break

| Practice | Why |
|---|---|
| Lazy-loaded feature modules | Keeps initial bundle small |
| `proxy.conf.json` for dev API calls | Avoids CORS issues in development |
| `x-token` header for JWT | Matches backend contract — do not rename |
| Luxon for date formatting | Backend uses DD/MM/YYYY — always format consistently |
| PWA with service worker | Do not remove `@angular/service-worker` configuration |

---

## Commit Checklist

- [ ] All variables, methods, and classes named in **English**
- [ ] No `console.log` left in production code — use environment-based logging
- [ ] `async pipe` used in templates instead of manual subscribe/unsubscribe
- [ ] `unsubscribe` called on all manual subscriptions (or `takeUntilDestroyed`)
- [ ] API errors handled — no unhandled Observable errors
- [ ] `{ ok, msg/data }` backend response shape handled in every HTTP call
- [ ] New services added to the correct module (not `AppModule` directly)
- [ ] `ng lint` passes before commit