# ADR 0002: Correlación de facturas, almacenamiento y entrega a la billetera

- Estado: Aceptado
- Fecha: 2026-11-07
- Reemplaza: las decisiones abiertas del ADR 0001 y de docs/ARCHITECTURE.md

## Contexto

El MVP debe demostrar, sobre Stellar Testnet, un flujo completo de solicitud de pago: creación de factura, presentación por QR, autorización desde la billetera y verificación de la liquidación ligada a la factura exacta. El ADR 0001 dejó sin resolver el mecanismo de correlación, el modelo de almacenamiento, la elección de activo y la entrega a la billetera. Los cuatro tuvieron que decidirse antes de la implementación.

## Decisiones

### Activo: XLM nativo

Las facturas se denominan solo en XLM nativo. XLM no necesita trustline, emisor de activo ni suposiciones de liquidez en Testnet, lo que elimina una clase completa de fallos de configuración del camino de la demo. Los activos emitidos quedan como extensión posterior al hackathon (hoja de ruta futura del PRD).

### Correlación: memo de texto único

Cada factura lleva una referencia única con la forma `ISQ` más 10 caracteres base32 aleatorios (13 bytes ASCII, muy dentro del límite de 28 bytes del memo de texto). La transacción de pago adjunta la referencia como memo de texto.

La verificación compara una transacción de Horizon contra todos los siguientes criterios:

- transacción exitosa;
- el memo de texto es igual a la referencia de la factura;
- la primera operación de pago es en XLM nativo;
- el destino del pago es igual al destinatario de la factura;
- el monto del pago es igual al monto de la factura exactamente, comparado en stroops;
- el origen de la transacción difiere del destinatario (un comercio no puede liquidar su propia factura).

Como las referencias son aleatorias (50 bits de entropía) y la unicidad también se aplica por tienda de comercio al guardar, una transacción nunca puede satisfacer dos facturas. La verificación es idempotente: volver a ejecutarla para una factura ya liquidada devuelve el resultado almacenado, y un hash de transacción ya reclamado por otra factura se rechaza.

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
