# LicitAlcázar

Instancia de [Adjudica](https://github.com/soker90/adjudica) para la contratación pública de Alcázar de San Juan. El código común está en el submódulo `adjudica`; este repositorio conserva la configuración, los flujos de actualización y los datos de esta instancia.

## Contenido propio

- `site.config.json`: marca, URL y ámbito geográfico.
- `public/logo.svg`: logotipo de la instancia.
- `data/contracting-authorities.json`: perfiles de contratación incluidos.
- `data/licitaciones_alcazar.db`: base SQLite actualizada por GitHub Actions.
- `data/catalogs/`: correcciones y relaciones verificadas utilizadas por las migraciones.
- `data/historical-sources.json`: fuentes y registros históricos propios de la instancia.

## Desarrollo y despliegue

Configura `DNI_SALT` como secreto de Actions en este repositorio y como variable de entorno de producción en el proyecto de Vercel. La aplicación y los flujos de sincronización lo usan para seudonimizar identificadores personales; ambos entornos deben usar el mismo valor estable.

Clona el repositorio con sus submódulos:

```sh
git clone --recurse-submodules https://github.com/soker90/licitalcazar.git
cd licitalcazar/adjudica
pnpm install
ADJUDICA_INSTANCE_ROOT=.. ADJUDICA_INSTANCE_DB_PATH=../data/licitaciones_alcazar.db pnpm prepare:instance
ADJUDICA_DB_PATH=../data/licitaciones_alcazar.db pnpm run migrate-db
pnpm dev
```

Vercel debe tener como **Root Directory** `.` (la raíz de este repositorio). El `vercel.json` de esta instancia instala Next.js en la raíz para que Vercel detecte el framework y después instala las dependencias bloqueadas en el submódulo `adjudica`. El build prepara aquí la configuración, el logotipo y `data/licitaciones_alcazar.db`, y compila Next.js desde el submódulo. El `package.json` de la raíz declara la misma versión de Next.js que Adjudica; la aplicación y sus dependencias siguen perteneciendo al submódulo. No configures `adjudica` como Root Directory: la configuración y los datos de la instancia están fuera de esa carpeta. Los flujos de GitHub Actions ejecutan las tareas de sincronización desde el submódulo y guardan los cambios en `data/`.

## Actualizar Adjudica

Adjudica publica versiones con etiquetas `vX.Y.Z`. Esta instancia conserva la versión exacta en el commit del submódulo. Para actualizarla, ejecuta desde la raíz del repositorio:

```sh
git -C adjudica fetch --tags origin
git -C adjudica checkout vX.Y.Z
git add adjudica
git commit -m "Actualiza Adjudica a vX.Y.Z"
```

Revisa y despliega el cambio como cualquier otra actualización del repositorio.
