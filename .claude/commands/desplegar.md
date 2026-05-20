---
description: Despliega el proyecto — build, git add, commit (revisando cambios) y push, con gate de errores
---

Ejecuta el flujo de **despliegue** de este proyecto **en orden estricto** y **DETENTE ante el primer error**.

⚠️ Regla crítica: si fallan los pasos 1, 2 o 3, **NO** ejecutes `git push`. Reporta el error y termina.

## Pasos

1. **Build** — ejecuta `npm run build-prod` (build de producción).
   - Si la compilación falla (exit code ≠ 0 o hay errores en la salida), DETENTE y reporta el error. No continúes.

2. **Stage** — ejecuta `git add .`.
   - Si falla, DETENTE y reporta.

3. **Revisar y commit**:
   - Ejecuta `git status` y `git diff --cached --stat` para ver qué cambió realmente.
   - Redacta el mensaje de commit con este formato:
     - Primera línea: `modificaciones en:`
     - Luego una lista (una por línea, con `-`) de los componentes/archivos modificados usando su **título legible** (ej. `- Menu Access Service`, `- Navegación (grupos Oxyplast/Compras/Ambiental)`).
   - Termina SIEMPRE el mensaje con la línea:
     `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`
   - Ejecuta el commit (en PowerShell usa un here-string `@'...'@` para el mensaje multilínea).
   - Si el commit falla, DETENTE y reporta. (Si no hay cambios para commitear, avisa y NO hagas push.)

4. **Push** — SOLO si los pasos 1, 2 y 3 terminaron sin errores, ejecuta `git push origin HEAD`.

## Notas
- No uses `--no-verify` ni omitas hooks.
- Build de desarrollo: `npm run build`. Si se requiere build de producción, usar `npm run build-prod`.
- Reporta al final un resumen: resultado del build, archivos commiteados y resultado del push.
