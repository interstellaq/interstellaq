# ADR 0002: Correlación de facturas, almacenamiento y entrega a la billetera

- Estado: Aceptado
- Fecha: 2026-11-07
- Actualizado: 2026-11-08 (issue #3: reglas de correlación y liquidación en Horizon, y correcciones de la revisión del PR #7)
- Reemplaza: las decisiones abiertas del ADR 0001 y de docs/ARCHITECTURE.md

## Contexto

El MVP debe demostrar, sobre Stellar Testnet, un flujo completo de solicitud de pago: creación de factura, presentación por QR, autorización desde la billetera y verificación de la liquidación ligada a la factura exacta. El ADR 0001 dejó sin resolver el mecanismo de correlación, el modelo de almacenamiento, la elección de activo y la entrega a la billetera. Los cuatro tuvieron que decidirse antes de la implementación.

## Decisiones

### Activo: XLM nativo

Las facturas se denominan solo en XLM nativo. XLM no necesita trustline, emisor de activo ni suposiciones de liquidez en Testnet, lo que elimina una clase completa de fallos de configuración del camino de la demo. Los activos emitidos quedan como extensión posterior al hackathon (hoja de ruta futura del PRD).

### Correlación: memo de texto único

Cada factura lleva una referencia única con la forma `ISQ` más 10 caracteres base32 aleatorios (13 bytes ASCII, muy dentro del límite de 28 bytes del memo de texto). La transacción de pago adjunta la referencia como memo de texto.

Antes de consultar Horizon, la factura debe superar la validación estructural del ADR 0003 (`validateInvoiceData` con identificador obligatorio). Una factura inválida nunca se liquida y la verificación devuelve `invalid_invoice` sin hacer peticiones. Además, `loadInvoices` y `getInvoice` descartan los registros almacenados que no superan esa validación o cuyo estado no es `active`, `settled` ni `verification_failed`, de modo que el panel y su monitor solo verifican facturas bien formadas.

La verificación compara cada transacción de Horizon que lleva la referencia contra todos los siguientes criterios (`evaluateTransaction` en `app/app/src/lib/stellar.ts`):

- la transacción es exitosa, y también lo es cada una de sus operaciones;
- el memo es de tipo texto y es igual a la referencia de la factura;
- la hora de cierre del ledger que la incluyó es válida y anterior a `expiresAt`;
- Horizon devolvió todas las operaciones declaradas (`operation_count`); si falta alguna, la transacción se rechaza;
- el destinatario no es el origen de la transacción ni el origen efectivo de ninguna operación. El origen efectivo es el `source_account` propio de la operación o, si no lo tiene, el de la transacción (Horizon ya lo resuelve en cada registro de operación). Así un comercio no puede liquidar su propia factura ni con una transacción enviada por un tercero cuya operación de pago tenga como origen la cuenta del comercio, ni añadiendo una operación propia (por ejemplo, una devolución) junto a un pago válido;
- exactamente una operación acredita al destinatario (`payment`, `path_payment_strict_receive`, `path_payment_strict_send`, `create_account` o `account_merge` hacia su cuenta), y esa operación es un `payment` en XLM nativo por el monto exacto de la factura, comparado en stroops. Esa operación queda identificada por su id de Horizon en el resultado de la verificación. Dos créditos al destinatario en la misma transacción se rechazan por ambiguos, aunque uno de ellos coincida.

Como las referencias son aleatorias (50 bits de entropía) y la unicidad también se aplica por tienda de comercio al guardar, una transacción nunca puede satisfacer dos facturas. La verificación es idempotente: volver a ejecutarla para una factura ya liquidada devuelve el resultado almacenado, y un hash de transacción ya reclamado por otra factura del mismo almacén se rechaza (`isTxHashUsed` en `app/app/src/lib/verify.ts`). Una liquidación solo se informa después de persistirla: si `localStorage` no acepta la escritura, la verificación devuelve `not_persisted`, la factura sigue pendiente y una verificación posterior lo reintenta.

#### Expiración

La expiración se juzga con la hora de cierre del ledger de la transacción, no con el momento en que se consulta Horizon. Un pago confirmado antes de `expiresAt` liquida la factura aunque la verificación ocurra después; un pago confirmado en `expiresAt` o más tarde nunca la liquida. En consecuencia:

- la verificación manual sigue disponible para facturas expiradas, que ya no pueden pagarse desde la aplicación;
- el monitoreo automático sigue consultando una factura no liquidada durante 5 minutos después de su expiración (`EXPIRY_GRACE_MS`), para recoger un pago confirmado justo antes del vencimiento e indexado con retraso, y después se detiene.

`expiresAt` procede del reloj del navegador que creó la factura, mientras que la hora del ledger procede de la red. Un desfase del reloj del comercio desplaza el vencimiento efectivo en la misma magnitud; se acepta para el MVP.

El pago construido dentro de la aplicación lleva límites temporales coherentes con esta regla (`paymentMaxTime`): su `maxTime` es el menor entre 10 minutos desde el momento de construirlo y `ceil(expiresAt / 1000) − 1`, el último segundo de ledger que todavía liquida la factura (las horas de cierre son segundos enteros y una transacción es válida mientras `closeTime ≤ maxTime`). Así la red rechaza con `tx_too_late` un pago que llegaría tarde, en lugar de mover fondos que nunca liquidarán la factura. La aplicación no construye pagos para una factura que ya expiró según el reloj local. El URI SEP-7 `pay` no admite límites temporales, por lo que ese camino conserva el riesgo de un pago confirmado después del vencimiento.

#### Búsqueda acotada en Horizon

La verificación recorre las transacciones de la cuenta del destinatario de la más reciente a la más antigua, en páginas de 200 registros (máximo de Horizon) encadenadas por `paging_token`, y solo pide las operaciones de las transacciones cuyo memo de texto coincide con la referencia. La búsqueda termina:

- con cobertura completa, solo cuando una página trae menos de 200 registros, es decir, cuando se alcanzó el final del historial de la cuenta que sirve Horizon;
- con cobertura incompleta, al agotar 5 páginas completas (1000 transacciones, `MAX_TRANSACTION_PAGES`).

Las marcas de tiempo no se usan para declarar cobertura. Una versión anterior daba la búsqueda por completa al alcanzar transacciones anteriores a `createdAt` menos 5 minutos, porque la referencia no existía antes de la factura. Esa garantía depende de que el reloj del navegador que creó la factura no vaya adelantado más que la tolerancia, algo que la aplicación no puede comprobar (en el dispositivo del pagador, `createdAt` llega incluso desde el QR). Con un reloj adelantado 10 minutos, un pago válido quedaba fuera y la verificación respondía `no_match`. Ampliar la tolerancia solo desplaza el supuesto. Un ancla verificable en cadena (por ejemplo, el `paging_token` del último ledger registrado al crear la factura) permitiría detener la búsqueda antes con garantía, pero exige cambiar el modelo de factura y el payload QR; queda como mejora posterior.

Resultado de la búsqueda:

- Si entre las transacciones examinadas hay pagos válidos, la factura se liquida con el confirmado primero, según este orden total: hora de cierre del ledger, después `paging_token` comparado numéricamente (secuencia de ledger y orden de aplicación dentro del ledger) y, si no es utilizable, el hash. El resultado no depende del orden en que Horizon devolvió los registros.
- Con una búsqueda incompleta puede existir un pago válido anterior que no se examinó. En ese caso se registra el más temprano de los examinados; ambos pagos llevan la referencia de esta factura, por lo que ninguno puede liquidar otra.
- Sin pago válido, una búsqueda incompleta devuelve `incomplete` y nunca `no_match` ni `expired`: la aplicación no afirma la ausencia de un pago que no ha podido descartar. Una búsqueda completa devuelve `expired` si la factura ya venció y `no_match` en caso contrario.
- La garantía de cobertura completa supone que Horizon sirve todo el historial de la cuenta. Un Horizon con retención limitada podría terminar el historial antes y la búsqueda se declararía completa sin serlo.

Alternativas consideradas:

- Contrato de facturas en Soroban con eventos: rechazado para el MVP. Las operaciones nativas más los memos proporcionan la semántica de correlación y verificación requerida sin despliegue de contratos, modelo de autorización ni costo de almacenamiento que revisar dentro de la ventana del hackathon (el M3 del backlog mantiene la opción abierta).
- Referencias con el monto codificado: rechazado porque el memo debe permanecer opaco y único, y el monto ya es un campo explícito de la factura.

### Almacenamiento: localStorage del navegador, claveado por la dirección del comercio

Las facturas se guardan bajo `interstellaq.invoices.<clave pública>` y los perfiles de comercio bajo `interstellaq.merchant.<clave pública>`. No hay backend: el MVP mantiene su superficie de confianza dentro del navegador, lo que coincide con la postura sin custodia de docs/SECURITY.md. El estado almacenado se trata como estado de cliente no confiable; solo la evidencia de Horizon puede mover una factura a `settled`.

Las lecturas entre dispositivos se resuelven con el payload del QR: la URL de la factura incrusta la solicitud completa de pago en el fragmento de la URL (`#p=<json base64url>`), de modo que cualquier dispositivo que escanee el QR pueda renderizar la solicitud y verificar la liquidación contra datos públicos de Horizon sin un almacén compartido.

### Entrega a la billetera: SEP-7 más firma con Wallets Kit dentro de la aplicación

Dos caminos de entrega, ambos sin custodia:

1. Dentro de la aplicación: el Stellar Wallets Kit (ya provisto por Scaffold Stellar) conecta la billetera del pagador, la aplicación construye el pago sin firmar, la billetera lo firma y la aplicación lo envía. Este es el camino de la demo y el que se ejercita de extremo a extremo.
2. SEP-7: el detalle de la factura expone un URI `web+stellar://pay` con destino, activo, monto, memo, tipo de memo y red, para billeteras que registren el manejador de protocolo.

### Registro de comercio: transacción sin efecto firmada

El registro envía una operación `bumpSequence` a la secuencia actual de la cuenta con el memo fijo `InterstellaQ:registro`. No cambia ningún estado del libro mayor, pero solo puede ser firmada por el titular del secreto de la cuenta, por lo que una transacción confirmada demuestra el control antes de que el nombre visual sea de confianza (docs/SECURITY.md, requisitos de autorización). El hash de la transacción se guarda como evidencia de registro y se vincula en stellar.expert.

## Consecuencias

- La evidencia de liquidación y la prueba de registro son públicas e inspeccionables en stellar.expert (explorador de Testnet).
- El panel del comercio y la página de la factura consultan Horizon cada 20 segundos mientras hay una factura pendiente, de modo que un pago confirmado actualiza el estado sin acción del usuario. La consulta se pausa con la pestaña oculta, nunca ejecuta dos consultas a la vez y un chequeo fallido deja el estado sin cambios.
- La demo depende de la disponibilidad de Horizon Testnet; los fallos de verificación se presentan como un estado accionable en lugar de un cambio en la factura.
- El estado de la factura no sobrevive a un borrado del navegador ni se mueve entre dispositivos salvo a través del payload del QR; un backend compartido es una decisión posterior al MVP.
- La ruta Soroban (backlog M3) sigue disponible si las reglas de liquidación programables se convierten en un requisito.
- Solo un `payment` nativo liquida una factura. Pagos de ruta, operaciones Soroban o reclamos de saldos reclamables no se reconocen aunque entreguen XLM, y una transacción que combine el pago con otro crédito al comercio se rechaza; el comercio tendría que conciliarla manualmente.
- Para una cuenta con más de 1000 transacciones en total, una verificación sin pago encontrado devuelve siempre `incomplete`, nunca `no_match` ni `expired`, y lee 5 páginas por consulta. Un pago confirmado a tiempo deja de encontrarse cuando se acumulan más de 1000 transacciones posteriores; la verificación lo indica como búsqueda incompleta en lugar de rechazarlo. Un indexador o backend propio queda fuera del alcance del MVP.
- Cada factura pendiente realiza su propia búsqueda en cada ciclo del monitor. En cuentas con mucho historial, varias facturas pendientes multiplican las peticiones y pueden alcanzar el límite de tasa de Horizon, lo que se presenta como `network_error`, nunca como liquidación. Compartir una búsqueda por destinatario queda como mejora posterior.
- Las reglas se prueban con respuestas de Horizon simuladas. La comprobación en Testnet es manual y posterior (`npm run test:net`, a demanda); CI no ejecuta pagos reales.
