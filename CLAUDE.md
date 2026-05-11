# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # ng serve -o (opens browser)
npm run build      # Development build
npm run build-prod # Production build
npm run lint       # ESLint
npm run lint:fix   # ESLint with auto-fix
npm run prettier   # Format all src/ files with Prettier
npm test           # Unit tests
```

## Stack

Angular 20 + TypeScript 5.8 + Bootstrap 5 + CoreUI Icons. Code quality: ESLint (`angular-eslint`) + Prettier 3. No Angular Material — uses Bootstrap + `@ng-bootstrap`. Charts via ApexCharts (`ng-apexcharts`).

## Project Structure

```
src/
├── app/
│   ├── core/           # Singleton services, interceptors, guards
│   ├── shared/         # Reusable components, pipes, directives
│   ├── features/       # Feature modules (lazy-loaded)
│   └── app.routes.ts   # Root routing
├── environments/       # environment.ts / environment.prod.ts
└── assets/
```

## Code Quality Rules

- Prettier is configured — run `npm run prettier` before committing
- ESLint with `angular-eslint` rules — run `npm run lint:fix` to auto-fix
- TypeScript strict mode — no implicit `any`

## API Communication

Uses Angular `HttpClient` with interceptors for JWT token via `x-token` header. Error responses follow the backend contract: `{ ok: boolean, msg: string, data?: any }`.

## Naming Conventions

- Components: `PascalCase` + `Component` → `ProductionOrderComponent`
- Services: `PascalCase` + `Service` → `ProductionPlanningService`
- Interfaces: `PascalCase` → `ProductionOrder`, `ApiResponse`
- Files: `kebab-case` → `production-order.component.ts`
- CSS classes: Bootstrap utilities first, custom classes in `kebab-case`