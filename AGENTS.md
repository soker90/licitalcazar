# Reglas del Proyecto (Workspace Rules)

## Gestor de Paquetes y Ejecución de Comandos
- **Uso obligatorio de `pnpm`**: Utilizar siempre y de forma exclusiva `pnpm` en cualquier tarea de gestión de dependencias, scripts o ejecución de binarios.
  - Compilación y scripts: `pnpm build`, `pnpm dev`, `pnpm test`, `pnpm run <script>`
  - Gestión de dependencias: `pnpm add`, `pnpm add -D`, `pnpm remove`, `pnpm install`
  - Ejecución de herramientas CLI / TS: `pnpm exec <cmd>` o `pnpm dlx <cmd>` (nunca `npx` ni `npm exec`)
  - **Prohibido**: No usar `npm`, `npx` ni `yarn`.

## Idioma del Código Fuente (English for Code)
- **Todo el código debe escribirse en inglés**:
  - Nombres de componentes React (`HomeExpiringContractsSection`, `ContractInvestigationHub`, etc.).
  - Nombres de archivos de código (`*.ts`, `*.tsx`, utilidades, hooks, etc.).
  - Variables, constantes, funciones, tipos, interfaces y propiedades (`props`).
  - Comentarios de código, documentación interna y nombres de tests.
  - **Excepción**: Todo texto visible para usuarios debe permanecer en español, al ser una aplicación orientada a la ciudadanía y administración local española.
  - Esto incluye la interfaz de usuario, mensajes de consola, logs de ejecución, mensajes de progreso, errores y avisos emitidos por scripts o tareas automatizadas.
  - Los nombres técnicos inevitables (por ejemplo, nombres de tablas, campos, endpoints, comandos, códigos de estado o identificadores externos) pueden conservarse en su forma original dentro de esos mensajes, pero la explicación que los acompaña debe estar en español.
  - Los nombres oficiales externos y denominaciones procedentes de fuentes oficiales pueden conservarse en su idioma o forma oficial.


## Contracting authority model
- Each PLACSP contracting authority is an independent entity; never group authorities.
- Use `contracting_authority_id` as the internal foreign key and `placsp_id` as the stable external identity.
- Use `name` for the official/display name and `scope` for institutional scope.
- Never use a display or normalized name as an entity identifier.
- Public URLs may remain Spanish, including `/organismos/<placsp_id>`.
