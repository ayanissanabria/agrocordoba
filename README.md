# AgroCórdoba

Aplicación web para explorar productos agrícolas y conectar compradores con productores. Esta guía explica cómo configurar y ejecutar el proyecto en una computadora local.

## Stack y versiones

| Componente | Tecnología | Versión usada o declarada |
|---|---|---|
| Frontend | React, React DOM | 19.3.0 |
| Lenguaje frontend | TypeScript | 5.8.3 |
| Servidor y compilador frontend | Vite | 6.4.5 |
| Estilos | Tailwind CSS | 4.3.3 |
| Mapas | Leaflet / React Leaflet | 1.9.4 / 5.0.0 |
| Tiempo real en frontend | Socket.IO Client | 4.8.4 |
| Runtime JavaScript recomendado | Node.js | 22; el proyecto admite Node.js 20 o superior |
| Backend | Python, Flask | Python 3.13; Flask `>=3.1,<4` |
| ORM | Flask-SQLAlchemy | `>=3.1,<4` |
| Tiempo real en backend | Flask-SocketIO | `>=5.5,<6` |
| Base de datos local sin Docker | SQLite | Incluida con Python; se crea al iniciar la API |
| Base de datos con Docker | PostgreSQL | 17 (`postgres:17-alpine`) |
| Entorno de contenedores opcional | Docker Compose | Compose v2 |

Las versiones exactas del frontend están resueltas en [`package-lock.json`](./package-lock.json). Las dependencias Python se expresan como rangos en [`backend/requirements.txt`](./backend/requirements.txt), no como un archivo de bloqueo con versiones exactas. Docker usa las imágenes `node:22-alpine` y `python:3.13-slim`.

## Requisitos

Para ejecutar el modo de desarrollo sin Docker:

- Git, para clonar el repositorio.
- Node.js 20 o superior y npm.
- Python 3.13.

Para ejecutar la aplicación con Docker, instala Docker Desktop o Docker Engine con Docker Compose v2. En ese modo, Node.js, Python y PostgreSQL no necesitan instalarse directamente en el equipo.

## Instalar Docker

Instala Docker siguiendo la documentación oficial correspondiente a tu sistema operativo:

- **Windows:** [Docker Desktop para Windows](https://docs.docker.com/desktop/setup/install/windows-install/). Instala o habilita WSL 2 cuando el instalador lo solicite, inicia Docker Desktop y espera a que indique que el motor está activo.
- **macOS:** [Docker Desktop para Mac](https://docs.docker.com/desktop/setup/install/mac-install/). Descarga el instalador apropiado para el procesador Apple Silicon o Intel, instala Docker Desktop y ábrelo.
- **Linux:** [Docker Engine](https://docs.docker.com/engine/install/) y el [plugin Docker Compose](https://docs.docker.com/compose/install/linux/), siguiendo las instrucciones de la distribución. Inicia el servicio Docker y configura los permisos de usuario según la guía oficial.

Comprueba que Docker y Compose estén instalados y que el motor esté en ejecución:

```sh
docker --version
docker compose version
docker info
```

Para usar el comando único `make` también necesitas GNU Make y una terminal compatible con shell POSIX. En macOS puedes instalarlo con Homebrew (`brew install make`; puede quedar disponible como `gmake`). En Debian o Ubuntu puedes instalarlo con `sudo apt install make`. En Windows utiliza GNU Make desde WSL con Docker Desktop integrado, o usa Docker Compose directamente desde PowerShell con los comandos indicados abajo.

## Opción A: desarrollo local sin Docker

Este modo ejecuta el frontend y el backend en procesos separados y usa SQLite local. No requiere instalar PostgreSQL.

### 1. Obtener el código

Clona o descarga el proyecto y abre una terminal en la carpeta raíz, donde están `package.json` y este `README.md`.

### 2. Instalar las dependencias del frontend

Desde la raíz del proyecto:

```sh
npm ci
```

`npm ci` instala las versiones exactas registradas en `package-lock.json`.

### 3. Crear el entorno Python e instalar el backend

En macOS o Linux, desde la raíz:

```sh
python3.13 -m venv backend/.venv
source backend/.venv/bin/activate
python -m pip install -r backend/requirements.txt
```

En Windows PowerShell, desde la raíz:

```powershell
py -3.13 -m venv backend\.venv
.\backend\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
```

Si PowerShell bloquea la activación del entorno, permite scripts solo en la terminal actual:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\backend\.venv\Scripts\Activate.ps1
```

### 4. Crear la configuración local

La configuración se lee desde `.env` en la raíz del proyecto. No crees un segundo `.env` dentro de `backend`.

En macOS o Linux:

```sh
cp .env.example .env
python3.13 -c 'import secrets; print(secrets.token_hex(32))'
```

En Windows PowerShell:

```powershell
Copy-Item .env.example .env
py -3.13 -c "import secrets; print(secrets.token_hex(32))"
```

Copia el valor generado en `FLASK_SECRET_KEY` dentro de `.env`. El valor debe generarse localmente y mantenerse privado; no lo pegues en el código ni lo compartas. Para este modo deja `DATABASE_URL` vacío: así el backend usa SQLite y crea la base en `backend/instance/`. `POSTGRES_PASSWORD` no se necesita sin Docker.

La autenticación básica local no requiere configurar proveedores externos. Google OAuth y el envío de correo son opcionales y solo funcionan después de configurar credenciales propias en las variables indicadas por `.env.example`.

### 5. Iniciar el backend

Abre una terminal, activa el entorno virtual si aún no está activo y ejecuta:

```sh
cd backend
python app.py
```

La API y Socket.IO quedan disponibles en `http://localhost:5000`.

### 6. Iniciar el frontend

Abre otra terminal en la raíz del proyecto y ejecuta:

```sh
npm run dev
```

Abre <http://localhost:3000>. Vite reenvía las solicitudes `/api`, `/auth` y `/socket.io` al backend local.

Para detener los procesos, pulsa `Ctrl+C` en cada terminal. No ejecutes también la opción Docker al mismo tiempo: ambas usan el puerto local 3000.

## Opción B: ejecutar con Docker Compose

Docker Compose inicia frontend, backend y PostgreSQL 17. Con Docker Compose v2 y GNU Make instalados, desde la raíz ejecuta un solo comando:

```sh
make
```

El objetivo predeterminado de Make prepara `.env` con secretos aleatorios si todavía no existe, construye las imágenes e inicia los servicios en segundo plano. No sobrescribe un `.env` existente. Al terminar, abre <http://localhost:3000>. En Windows se requiere GNU Make y una shell compatible con las recetas POSIX del Makefile.

Si prefieres no usar Make, prepara `.env` manualmente y ejecuta Compose:

1. Copia `.env.example` como `.env`.
2. Genera dos valores privados —uno para `FLASK_SECRET_KEY` y otro para `POSTGRES_PASSWORD`— y asígnalos en `.env`. Por ejemplo, en macOS o Linux:

```sh
python3 -c 'import secrets; print(secrets.token_hex(32))'
python3 -c 'import secrets; print(secrets.token_hex(32))'
```

   En Windows PowerShell, usa `Copy-Item .env.example .env` y ejecuta el generador con `py -3.13 -c "import secrets; print(secrets.token_hex(32))"`.
3. Ejecuta `docker compose up --build -d`.

En ambos casos, detén y retira los contenedores con:

```sh
make down
```

La base PostgreSQL se conserva en un volumen entre reinicios. **No uses `docker compose down -v` salvo que quieras eliminar permanentemente ese volumen y sus datos.** Para volver a iniciar:

```sh
make
```

## Comandos del Makefile

Ejecuta estos comandos desde la raíz del proyecto. `make` es equivalente a `make start`; crea `.env` con secretos aleatorios si falta, conserva una configuración existente, construye las imágenes e inicia los servicios en segundo plano.

| Comando | Acción |
|---|---|
| `make` o `make start` | Preparar la configuración si hace falta, construir e iniciar frontend, backend y PostgreSQL. |
| `make help` | Mostrar la lista de comandos disponibles. |
| `make check` | Comprobar Docker Compose y que el motor de Docker esté activo. |
| `make env` | Crear `.env` con secretos aleatorios si aún no existe. No reemplaza un `.env` existente. |
| `make install` | Preparar `.env` si falta y construir las imágenes sin iniciar los servicios. |
| `make build` | Construir o reconstruir las imágenes. |
| `make run` | Alias de `make start`. |
| `make status` | Mostrar el estado de los servicios. |
| `make logs` | Seguir los registros de frontend, backend y base de datos. Para salir, pulsa `Ctrl+C`; los servicios siguen activos. |
| `make restart` | Reiniciar los contenedores existentes. |
| `make stop` | Detener los servicios sin quitar contenedores ni borrar datos. |
| `make down` | Retirar contenedores y redes; conserva el volumen de PostgreSQL. |
| `make fixtures` | Importar los datos sintéticos de muestra a una base PostgreSQL vacía. |
| `make test` | Ejecutar las pruebas backend dentro de un contenedor. |
| `make db` | Abrir una consola `psql` en el contenedor PostgreSQL. |
| `make backup` | Crear un respaldo SQL en la carpeta `backups/`. |

Para consultar logs y estado también puedes usar directamente Compose:

```sh
docker compose ps
docker compose logs -f frontend backend db
```

El frontend se publica en el puerto `3000` por defecto. Puedes cambiarlo definiendo `FRONTEND_PORT` en `.env`; asegúrate de que `FRONTEND_URL` y `GOOGLE_REDIRECT_URI`, si los usas, coincidan con el puerto elegido. La base PostgreSQL persiste en un volumen de Docker. **No uses `docker compose down -v` salvo que quieras eliminar permanentemente el volumen y todos sus datos.**

Si no tienes GNU Make disponible, el flujo equivalente es: copia `.env.example` a `.env`, genera y configura valores privados para `FLASK_SECRET_KEY` y `POSTGRES_PASSWORD`, y ejecuta:

```sh
docker compose up --build -d
```

## Comprobaciones

Con el entorno Python activado, valida el frontend desde la raíz:

```sh
npm run lint
npm run build
```

Ejecuta las pruebas backend desde `backend`:

```sh
python -m pytest -q -p no:cacheprovider
```

La API ofrece el endpoint de estado <http://localhost:5000/api/health> en el modo sin Docker. Con Docker, la interfaz está disponible en <http://localhost:3000>.

## Variables de entorno

Todas las variables locales se configuran en el archivo `.env` de la raíz del proyecto. Parte de ellas solo se necesita para Docker o para habilitar integraciones opcionales. No crees un segundo `.env` dentro de `backend`.

1. Crea el archivo copiando `.env.example`:

   ```sh
   cp .env.example .env
   ```

   En Windows PowerShell, usa `Copy-Item .env.example .env`.
2. Edita `.env` con un editor de texto y establece solo las variables que vayas a utilizar. En modo Docker, `make` crea este archivo con valores aleatorios para los secretos obligatorios si todavía no existe. No rellena ni sobrescribe un `.env` que ya existe.
3. Después de cambiar variables, reinicia los procesos locales. Con Docker, vuelve a ejecutar `make` para aplicar la configuración del contenedor backend. Nunca subas `.env` a Git ni pegues secretos en mensajes, capturas o documentación compartida.

### Aplicación y base de datos

| Variable | Para qué sirve y cómo configurarla |
|---|---|
| `FLASK_SECRET_KEY` | **Obligatoria para el backend.** Firma las sesiones de Flask. Genera un valor aleatorio privado con `python3 -c 'import secrets; print(secrets.token_hex(32))'` (Windows: `py -3.13 -c "import secrets; print(secrets.token_hex(32))"`) y guárdalo en `.env`. `make` genera uno automáticamente solo al crear el archivo por primera vez. |
| `DATABASE_URL` | URL de conexión de SQLAlchemy. En desarrollo directo, déjala vacía para usar SQLite en `backend/instance/agrocordoba.db`. Docker Compose construye la URL de PostgreSQL con `POSTGRES_USER`, `POSTGRES_PASSWORD` y `POSTGRES_DB`; no es necesario rellenar esta variable para Compose. Para conectar otra base, obtén su URL de conexión desde su administrador y mantenla privada. |
| `POSTGRES_DB` | Nombre de la base PostgreSQL creada por Compose. El ejemplo usa `agrocordoba`; puedes conservar ese valor o cambiarlo. |
| `POSTGRES_USER` | Usuario de la base PostgreSQL local creada por Compose. El ejemplo usa `agrocordoba`; no es una cuenta de un servicio externo. |
| `POSTGRES_PASSWORD` | **Obligatoria para Docker Compose.** Contraseña local del usuario de PostgreSQL del contenedor. Genérala localmente con el comando de `secrets` usado para `FLASK_SECRET_KEY`; no reutilices una contraseña personal o de otro servicio. `make` genera un valor si `.env` no existe. |
| `FRONTEND_PORT` | Puerto del equipo anfitrión donde Compose publica la aplicación. Usa `3000` salvo que ese puerto esté ocupado; si lo cambias, abre `http://localhost:<puerto>` y actualiza las URL locales relacionadas, como `FRONTEND_URL` y `GOOGLE_REDIRECT_URI`. |
| `FLASK_DEBUG` | Activa el modo de depuración al iniciar Flask directamente: usa `true` solo en desarrollo local y `false` en cualquier entorno compartido. Compose fuerza `false`. |
| `COOKIE_SECURE` | Controla el atributo Secure de las cookies de sesión. Usa `false` para trabajar por HTTP en `localhost` y `true` cuando el sitio esté servido con HTTPS. |
| `FRONTEND_URL` | URL base del frontend para redirecciones posteriores a la autenticación. Para el valor local predeterminado usa `http://localhost:3000/`, con `/` final. Si cambias el puerto o el origen, actualízala. |
| `FRONTEND_DIST_DIR` | Ruta a los archivos frontend compilados cuando Flask sirve también la aplicación. No hace falta configurarla para desarrollo con Vite; en la imagen backend de Docker ya se establece. |

### Acceso con Google (opcional)

Estas variables activan el inicio de sesión con Google. Si no las configuras, puedes usar el inicio de sesión local de la aplicación.

| Variable | Para qué sirve |
|---|---|
| `GOOGLE_CLIENT_ID` | Identifica el cliente OAuth de tipo aplicación web creado para este sitio. |
| `GOOGLE_CLIENT_SECRET` | Secreto del cliente OAuth. Es confidencial: solo debe estar en el `.env` local o en el gestor de secretos del entorno donde se despliega. |
| `GOOGLE_REDIRECT_URI` | Dirección a la que Google devuelve al navegador al terminar el consentimiento. En desarrollo local con Vite usa exactamente `http://localhost:3000/auth/google/callback`. En Compose, usa el puerto/origen local público de la aplicación. Debe coincidir carácter por carácter con la URI autorizada en Google Cloud. |

Para obtener las credenciales de Google:

1. Abre [Google Cloud Console](https://console.cloud.google.com/) e inicia sesión con una cuenta que pueda administrar un proyecto. Crea un proyecto nuevo para esta aplicación o selecciona uno existente.
2. En la configuración de **Google Auth Platform / OAuth**, completa la información de marca y el público de la aplicación que solicita la consola. Si la aplicación queda en modo de prueba, añade las cuentas que la probarán como usuarios de prueba.
3. Crea un cliente OAuth de tipo **Web application**.
4. En **Authorized JavaScript origins**, añade `http://localhost:3000`. En **Authorized redirect URIs**, añade `http://localhost:3000/auth/google/callback`. Es la URL pública del proxy Vite; no uses el puerto interno del backend (`5000`).
5. Crea el cliente y copia el ID y el secreto que muestra Google. Guárdalos en `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en el `.env` raíz. Configura `GOOGLE_REDIRECT_URI` con la misma URI de retorno autorizada.
6. Guarda `.env`, reinicia el backend (`python app.py`) o ejecuta `make` si usas Docker, y prueba el inicio con Google.

Consulta la [guía oficial de OAuth para aplicaciones web de Google](https://developers.google.com/identity/protocols/oauth2/web-server). No publiques el secreto del cliente ni el archivo descargado desde Google Cloud.

### Envío de correo (opcional)

El correo se usa para los códigos de recuperación de contraseña y confirmación de cambios de cuenta. Configura **Resend o SMTP**, no ambos. Cuando `RESEND_API_KEY` está configurada, la aplicación envía por Resend; si está vacía, usa SMTP.

#### Opción 1: Resend

| Variable | Para qué sirve |
|---|---|
| `RESEND_API_KEY` | Clave de API de servidor que autoriza el envío a través de Resend. Mantén su valor privado. |
| `RESEND_FROM` | Nombre y dirección remitente verificada, por ejemplo `AgroCórdoba <no-reply@tu-dominio-verificado>`. Debe pertenecer a un dominio verificado en tu cuenta de Resend. |

Pasos para obtenerlas:

1. Crea o abre una cuenta en [Resend](https://resend.com/).
2. En **Domains**, añade un dominio o subdominio que controles. Copia los registros DNS que Resend proporciona y créalos en el proveedor que administra ese dominio. Espera a que Resend confirme la verificación.
3. En **API Keys**, crea una clave de servidor con el permiso mínimo disponible para enviar correo. Copia la clave cuando se muestre y guárdala en `RESEND_API_KEY`; normalmente no podrás volver a consultar el valor completo después de cerrar esa vista.
4. Define `RESEND_FROM` con un remitente de ese dominio verificado. Guarda `.env` y reinicia el backend.

Si no administras un dominio ni sus DNS, solicita al administrador del dominio que complete la verificación y autorice la dirección remitente. Consulta la documentación oficial de [dominios verificados](https://resend.com/docs/dashboard/domains/introduction) y [claves de API](https://resend.com/docs/dashboard/api-keys/introduction).

#### Opción 2: servidor SMTP

| Variable | Para qué sirve y cómo configurarla |
|---|---|
| `SMTP_HOST` | Nombre del servidor SMTP que proporciona tu servicio de correo. |
| `SMTP_PORT` | Puerto SMTP de envío. El valor predeterminado de la aplicación es `587` para STARTTLS. Usa el puerto que documente tu proveedor. |
| `SMTP_USERNAME` | Usuario SMTP que proporciona el servicio; algunos proveedores usan la dirección de correo completa. |
| `SMTP_PASSWORD` | Contraseña SMTP o contraseña de aplicación generada por el proveedor. No uses aquí la contraseña de tu cuenta personal si el proveedor ofrece credenciales específicas para SMTP. |
| `SMTP_FROM` | Dirección remitente que tu proveedor permite enviar, opcionalmente con un nombre visible. |
| `SMTP_USE_TLS` | Usa `true` para STARTTLS (habitualmente junto al puerto `587`). |
| `SMTP_USE_SSL` | Usa `true` para TLS implícito (habitualmente junto al puerto `465`). Si activas SSL, no actives STARTTLS a la vez. |

Pasos para obtenerlas:

1. Elige un servicio de correo que permita envío SMTP y consulta su documentación de configuración de clientes o envío automatizado.
2. Obtén de ese proveedor el host, puerto, usuario y método de cifrado. Si ofrece una contraseña de aplicación o credencial SMTP independiente, genera una para esta aplicación.
3. Introduce los valores en las variables `SMTP_*` correspondientes del `.env`. Deja `RESEND_API_KEY` vacío para que se seleccione SMTP y define el remitente autorizado en `SMTP_FROM`.
4. Guarda el archivo, reinicia el backend y prueba la recuperación de contraseña con una cuenta de prueba. Si falla el envío, revisa los registros del backend y los límites o requisitos de autenticación de tu proveedor.

No existe una receta común para crear credenciales SMTP: cada proveedor administra sus propias cuentas, contraseñas de aplicación, hosts y permisos. Nunca pongas esas credenciales en el frontend ni en Git.

### Administrador inicial (opcional)

| Variable | Para qué sirve y cómo configurarla |
|---|---|
| `ADMIN_EMAIL` | Correo para crear el primer usuario administrador al iniciar la aplicación. |
| `ADMIN_PASSWORD` | Contraseña de ese usuario, de al menos 12 caracteres. Créala específicamente para este entorno y mantenla privada. |

Configura ambas variables juntas solo si quieres que el inicio de la aplicación cree automáticamente el administrador. No cambia la contraseña de una cuenta existente. Para desarrollo local también puedes omitirlas y crear el administrador con el comando `flask --app app create-admin` ejecutado desde `backend`; este comando solicita la contraseña sin guardarla en el archivo. En Docker, si agregas o cambias estas variables, vuelve a ejecutar `make` para recrear el backend.

### Actualización programada SIPSA (opcional)

| Variable | Para qué sirve y cómo configurarla |
|---|---|
| `SIPSA_TASK_TOKEN` | Token privado que protege la ruta `POST /api/tasks/price-references/refresh`. No es una credencial del DANE: genéralo localmente con `python3 -c 'import secrets; print(secrets.token_urlsafe(32))'` (Windows: `py -3.13 -c "import secrets; print(secrets.token_urlsafe(32))"`) y configura el mismo valor como secreto en el planificador que invocará la ruta. |

La aplicación obtiene los boletines SIPSA desde el sitio público del DANE; no se necesita crear una cuenta ni solicitar una API key al DANE para este flujo. Configurar el token por sí solo no programa la tarea: además debes configurar un servicio de planificación externo para hacer la petición `POST` diaria, enviando el token como credencial Bearer en el encabezado `Authorization`. Si no necesitas actualización programada, deja la variable vacía.

Todas estas variables están enumeradas con valores vacíos o valores predeterminados en [`.env.example`](./.env.example). Completa únicamente las que necesites; no se incluyen credenciales en el repositorio.

La base SQLite activa del modo sin Docker está en `backend/instance/agrocordoba.db`. El archivo `backend/database/agrocordoba_sample.db`, si está presente, es solo una muestra y no es la base de trabajo local.
