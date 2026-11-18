# Backend - Sistema de Farmacia Privada Comercial INACAP

API REST transaccional construida con Express 5, TypeScript (ESM), PostgreSQL y Prisma ORM v7.

---

## 1. Requisitos y Variables de Entorno (`.env.example`)

- **Node.js** >= 20.x
- **PostgreSQL** >= 15.x

Crea un archivo `.env` en el directorio `backend/` tomando como base `.env.example`:

```env
DATABASE_URL="postgresql://farmacia_user:farmacia_password@localhost:5433/farmacia_db"

PORT=3000
NODE_ENV=development
CORS_ORIGIN="http://localhost:5173"

JWT_ACCESS_SECRET="cambia_este_secreto_por_uno_de_al_menos_32_caracteres_seguros"
JWT_ACCESS_EXPIRES_IN="8h"
REFRESH_TOKEN_DAYS=7

ADMIN_RUT="11.111.111-1"
ADMIN_FIRST_NAME="Administrador"
ADMIN_LAST_NAME="Sistema"
ADMIN_EMAIL="admin@farmacia.local"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="administrador"
```

> **Importante:** Cambia `JWT_ACCESS_SECRET` y `ADMIN_PASSWORD` antes de desplegar en producción.

Para iniciar PostgreSQL con Docker, ejecuta desde la carpeta raíz del proyecto:

```powershell
docker compose up -d postgres
```

El contenedor publica PostgreSQL en el puerto `5433` del equipo. Cuando esté disponible, desde `backend/` ejecuta `npm run prisma:migrate`.

Los registros que creas desde la aplicación se guardan en esta base de datos. Si agregas o modificas modelos o campos en `prisma/schema.prisma`, ejecuta `npm run prisma:migrate` desde `backend/` antes de iniciar la API; Prisma creará y aplicará una migración sin borrar los datos existentes. No es necesario ejecutar migraciones para agregar registros desde la aplicación.

---

## 2. Configuración de Prisma v7 y Migraciones

El proyecto utiliza **Prisma ORM v7** con el adaptador nativo `@prisma/adapter-pg` y configuración en `prisma.config.ts`.

Comandos principales:

```powershell
# Validar el esquema de base de datos
npm run prisma:validate

# Generar el cliente tipado en src/generated/prisma
npm run prisma:generate

# Ejecutar migraciones en entorno de desarrollo
npm run prisma:migrate

# Explorador visual de datos
npm run prisma:studio
```

> La migración de simplificación elimina permanentemente datos y tablas de pacientes, médicos, recetas, laboratorios, convenios y controlados. Haz un respaldo antes de aplicarla en una base con datos reales.

---

## 3. Arquitectura de Módulos y RBAC

Cada dominio dentro de `src/modules/` sigue una arquitectura en 4 capas:
- `*.routes.ts`: Definición de endpoints, middlewares de autenticación (`requireAuth`) y autorización por permisos (`requirePermission`).
- `*.controller.ts`: Orquestación HTTP, parseo con esquemas Zod y delegación al servicio mediante `asyncHandler`.
- `*.service.ts`: Lógica de negocio, transacciones atómicas en Prisma y validaciones de dominio (`ApiError`).
- `*.schemas.ts`: Validación de payloads, query params y parámetros de ruta con Zod v4.

### Módulos y Autenticación (Auth + RBAC)
- **Autenticación (`/api/auth`)**: Login (`POST /api/auth/login`), rotación de sesión (`POST /api/auth/refresh`), cierre (`POST /api/auth/logout`) y perfil activo (`GET /api/auth/me`).
- **Control de Acceso (`/api/users`, `/api/access`)**: Gestión de usuarios, roles y matriz granular de permisos RBAC.
- **Catálogo (`/api/categories`, `/api/active-ingredients`, `/api/products`)**: Administración de productos y condición de venta (sin receta, receta simple o receta retenida).
- **Administración y Reportes (`/api/reports`, `/api/audit`, `/api/settings`)**: Dashboard, reportería exportable (XLSX y PDF), auditoría de solicitudes y verbos SQL (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) sin guardar consultas ni parámetros. El rol `AUDITOR` solo tiene el permiso `audit.read`.

---

## 4. Reglas de Negocio (FEFO/FIFO, Caja, Ventas, DTE)

- **Inventario, Compras y FEFO (`/api/suppliers`, `/api/purchases`, `/api/inventory`)**:
  - Recepción parcial o completa de órdenes de compra con ingreso automático de lotes (`ProductBatch`) y saldos por ubicación (`StockBalance`).
  - Asignación y sugerencia automática de lotes bajo criterio **FEFO (First Expired, First Out)** excluyendo lotes vencidos o bloqueados.
  - El servidor revisa vencimientos al iniciar y cada hora; los lotes vencidos se bloquean para venta, generan una alerta y conservan sus registros históricos.
  - Alertas de quiebre de stock y vencimiento próximo, además de transferencias y ajustes de inventario trazables.
- **Sesiones de Caja (`/api/cash`)**:
  - Apertura, arqueo de cierre y registro de movimientos manuales por caja/terminal (`CashRegister`).
  - Restricción de sesión abierta única por terminal y cajero garantizada a nivel de servicio e índice único parcial (`cash_session_partial_unique_idx`).
- **Punto de Venta (`/api/sales`)**:
  - Descuento atómico de stock por lote dentro de una transacción serializada, con reversión automática ante stock insuficiente.
  - Para productos con receta, el vendedor debe confirmar que revisó la receta; para receta retenida también confirma que la retuvo.
  - Anulación de ventas con restitución íntegra de stock a sus lotes de origen.
- **Emisión DTE (`/api/sales/:id/tax-document/mock-issue`)**:
  - Simulación académica de timbraje y emisión de documentos tributarios electrónicos (Boleta/Factura) ante el SII.

---

## 5. Ejecución de Semillas (`seed.ts`) y Pruebas

### Poblar Base de Datos Inicial
```powershell
npm run seed
```

### Pruebas Automatizadas (Vitest + Supertest)
```powershell
# Ejecutar suite de pruebas unitarias y de integración
npm test

# Modo observador
npm run test:watch
```

Los scripts de pruebas manuales heredados de QA se encuentran aislados en `backend/scripts/qa/`.
