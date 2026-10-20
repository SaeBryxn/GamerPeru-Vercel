# 05 · Flujos críticos

Los diagramas resumen el código actual; las pruebas y los pendientes están en [07](07-calidad-y-pruebas.md). Un estado enviado por el navegador no sustituye las transacciones del dominio.

## Navegación y búsqueda

```mermaid
sequenceDiagram
  actor C as Comprador
  participant UI as Storefront
  participant R as Lectores catálogo/búsqueda
  participant DB as PostgreSQL
  C->>UI: Categoría, marca, filtros o consulta
  UI->>R: Parámetros validados
  R->>DB: Productos publicados y datos públicos
  DB-->>R: Resultados y variantes visibles
  R-->>UI: HTML/RSC y datos estructurados
  C->>UI: Abrir PDP por slug
```

Los lectores de catálogo usan caché por tag; la búsqueda aplica sus reglas de consulta. La URL conserva filtros compartibles. La PDP muestra variantes, disponibilidad y contenido estructurado; no se exponen borradores ni campos privados.

## Carrito y checkout

```mermaid
sequenceDiagram
  actor C as Comprador
  participant B as Carrito / checkout
  participant S as Servicio de checkout
  participant DB as PostgreSQL
  C->>B: Añadir variante y cantidad
  B->>S: Cotizar y crear pedido con clave idempotente
  S->>DB: Validar precio, stock, envío y método
  S->>DB: Transacción: pedido, snapshots, reserva, pago UNPAID y outbox
  DB-->>S: Resultado consistente
  S-->>B: Confirmación y acceso autorizado al pago
```

```mermaid
flowchart LR
  PDP[PDP] --> Cart[Carrito]
  Cart --> Check[Checkout]
  Check --> Validate{Validación servidor}
  Validate -->|Inválido o stock insuficiente| Error[Error recuperable]
  Error --> Check
  Validate -->|Válido| Order[Pedido PENDING y reserva]
  Order --> Payment[Instrucciones Yape o Plin]
```

Los importes monetarios se conservan en centavos y los snapshots evitan que una edición posterior del catálogo cambie un pedido existente. La misma petición idempotente no debe crear dos pedidos.

## Pago manual: enviado no equivale a pagado

```mermaid
sequenceDiagram
  actor C as Cliente
  participant S as Servicio de pagos
  participant DB as PostgreSQL
  actor A as Admin autorizado
  C->>S: Código de operación / comprobante
  S->>DB: Submission y estado SUBMITTED
  S-->>C: Enviado para revisión
  A->>S: Iniciar revisión con orders:verify
  S->>DB: VERIFYING y auditoría
  A->>A: Comprobar recepción real de fondos
  A->>S: Aprobar o rechazar
  alt Aprobado
    S->>DB: Pago PAID, pedido CONFIRMED y eventos
  else Reintento permitido
    S->>DB: Pago UNPAID y nueva oportunidad controlada
  else Rechazo terminal
    S->>DB: Pago REJECTED y cancelación según dominio
  end
```

```mermaid
stateDiagram-v2
  [*] --> UNPAID
  UNPAID --> SUBMITTED: cliente envía información
  SUBMITTED --> VERIFYING: admin inicia revisión
  VERIFYING --> PAID: fondos verificados
  VERIFYING --> UNPAID: rechazo reintentable
  VERIFYING --> REJECTED: rechazo terminal
  PAID --> REFUNDED: reembolso autorizado
```

## Identidad, OAuth y permisos

```mermaid
sequenceDiagram
  actor U as Usuario
  participant Auth as Supabase Auth
  participant App as App servidor
  participant RBAC as PostgreSQL RBAC
  U->>Auth: Correo/contraseña o Google OAuth
  Auth-->>App: Sesión/callback
  App->>App: Verificar identidad y redirect
  App->>RBAC: Roles y permisos del auth_user_id verificado
  RBAC-->>App: Contexto READY o fallo
  App-->>U: Cuenta/admin permitido o 401/403
```

Cada mutación privilegiada vuelve a comprobar autorización en servidor. No basta con haber cargado una página del admin. Equipo e invitaciones requieren `staff:manage`; no se permite autoelevar un rol enviado por el cliente.

## Crear y publicar un producto

```mermaid
flowchart TD
  Draft[Crear DRAFT con catalog:manage] --> Fields[Marca, categoría, variantes y especificaciones]
  Fields --> Media[Galería, principal y Product Story]
  Media --> Review[Validar integridad y revisar contenido]
  Review --> Permission{catalog:publish}
  Permission -->|No| Denied[403]
  Permission -->|Sí y válido| Publish[Transacción de publicación y audit]
  Publish --> Cache[Invalidación de catálogo]
  Cache --> PDP[PDP pública]
```

La investigación IA genera propuestas revisables. Publicar sigue siendo una operación explícita con permiso. Editar medios de DRAFT no invalida el storefront; completar medios de PUBLISHED invalida datos por tag sin `revalidatePath`.

## Subida: init, PUT, complete, abort y sweep

```mermaid
sequenceDiagram
  actor A as Operador
  participant B as Navegador
  participant H as Route Handlers
  participant DB as Ledger / presupuesto
  participant R2 as R2
  A->>B: Seleccionar imagen hasta 20 MiB
  B->>B: Orientar, reencodificar y limitar galería a 2400 px / 4 MiB
  B->>H: POST init JSON
  H->>H: Origen, sesión, permiso y Zod
  H->>DB: Reservar presupuesto + PENDING, transacción
  H-->>B: UUID, URL firmada, headers y expiresAt
  B->>R2: PUT directo por XHR, progreso y reintentos limitados
  R2-->>B: Resultado HTTP
  alt PUT correcto
    B->>H: POST complete UUID
    H->>R2: HEAD + GET bytes 0..4095
    H->>H: Validar firma, tamaño, tipo y dimensiones
    H->>DB: FOR UPDATE, READY, asset/referencia/audit y reserva a uso
    H-->>B: Resultado idempotente
    B->>B: Refresh una vez al final del lote
  else Cancelación o fallo
    B->>H: POST abort; pagehide intenta beacon
    H->>DB: Bloquear PENDING
    H->>R2: DELETE
    H->>DB: ABORTED y liberar reserva
  end
```

Si la firma no coincide, el servicio borra el objeto y marca REJECTED con 422. Las dimensiones persistidas provienen del header, no de las declaradas por el navegador. READY repetido no crea otro asset ni vuelve a consumir presupuesto. Un fallo de DELETE conserva reserva/estado mediante rollback.

```mermaid
flowchart LR
  Cron[Inngest, minuto 17 de cada hora] --> Select[PENDING expiradas hace más de una hora]
  Select --> Lock[Hasta 25 con skipLocked]
  Lock --> Delete[DELETE objeto]
  Delete --> Success{¿Éxito?}
  Success -->|Sí| Expire[EXPIRED y liberar reserva]
  Success -->|No| Rollback[Rollback y reintento posterior]
```

```mermaid
stateDiagram-v2
  [*] --> PENDING: init reservado
  PENDING --> READY: complete válido
  READY --> READY: complete idempotente
  PENDING --> ABORTED: cancelación
  PENDING --> EXPIRED: caducidad o sweep
  PENDING --> REJECTED: firma o metadatos inválidos
  ABORTED --> [*]
  EXPIRED --> [*]
  REJECTED --> [*]
```

## Estados del pedido

```mermaid
stateDiagram-v2
  [*] --> PENDING: checkout
  PENDING --> CONFIRMED: pago verificado
  PENDING --> CANCELLED: cancelación autorizada o rechazo
  PENDING --> EXPIRED: reserva sin pago caduca
  CONFIRMED --> PROCESSING: preparar
  PROCESSING --> FULFILLED: completar entrega
  CONFIRMED --> CANCELLED: cancelación válida según dominio
  CONFIRMED --> REFUNDED: reembolso
  FULFILLED --> REFUNDED: reembolso
```

Los estados provienen de `orders/enums.ts` y `payments/enums.ts`. El diagrama resume el camino principal; los servicios controlan precondiciones, transiciones y reembolsos parciales. El pago y el pedido son agregados distintos: un formulario de comprobante no los confirma por sí mismo.
