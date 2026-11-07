# Pitch: InterstellaQ (Código Cordillera, Genesis)

Rodeo de 5 minutos. Objetivo del jurado: qué hace, para quién y por qué
Stellar, con una demo en vivo que termine en una transacción visible en
stellar.expert.

## 0:00 a 1:00 - El problema

Los comercios latinoamericanos que venden en línea o exportan reciben pagos
transfronterizos lentos y caros. Cada transferencia pierde tiempo, pierde
dinero y pierde contexto: no existe un formato estándar de solicitud de
pago que un cliente pueda abrir, revisar y autorizar desde su wallet sin
que el comercio custodie fondos.

Dato de contexto del propio hackathon: Colombia recibe miles de millones de
dólares en remesas cada año, y cada transferencia pierde tiempo y dinero.

## 1:00 a 2:00 - La solución

InterstellaQ es un protocolo de solicitud de pago nativo de Stellar:

1. El comercio conecta su cuenta, se registra con una prueba de control en
   cadena y crea una factura con monto fijo y expiración.
2. Comparte un código QR. El cliente ve destinatario, activo, monto,
   referencia y expiración antes de autorizar nada.
3. La wallet del cliente firma el pago. InterstellaQ verifica la
   transacción real en Horizon y marca la factura como liquidada solo
   cuando destinatario, monto y referencia coinciden.

El comercio nunca toca los fondos del cliente: ninguna clave privada pasa
por la aplicación.

## 2:00 a 3:30 - Demo en vivo (Testnet)

Pasos en pantalla, en este orden:

1. Panel del comercio: conectar wallet (Stellar Wallets Kit), registrar el
   comercio. Se firma una transacción real y se muestra el enlace a
   stellar.expert.
2. Crear una factura de ejemplo (por ejemplo 12.5 XLM, expiración 30 min).
3. Abrir la factura: datos completos, cuenta regresiva de expiración, código
   QR con el pago incrustado.
4. Con una segunda wallet (o la misma en otra pestaña), pagar: la wallet
   pide confirmación, la transacción se envía y el estado cambia a Liquidada
   con enlace a la transacción en stellar.expert.
5. Mostrar un caso negativo: verificar una factura sin pago o con un monto
   distinto no la liquidará.

Si cae la red: explicar que la verificación consulta Horizon Testnet y que
un error de red deja el estado intacto, nunca inventa una liquidación.

## 3:30 a 4:15 - Por qué Stellar

- Operaciones nativas con memo de texto: correlación factura-transacción
  sin capa extra.
- Liquidación en unos segundos por una fracción de centavo: adecuada para
  pagos de comercio de bajo monto.
- Cuentas y wallets abiertas: el cliente firma con su wallet, el comercio
  recibe los fondos directamente.
- SEP-7 para entrega de pago a wallets compatibles.
- Evidencia pública: cada liquidación y cada registro se puede abrir en
  stellar.expert/Testnet.

## 4:15 a 5:00 - Usuario, evidencia y siguientes pasos

- Usuario concreto: comercio pequeño o en línea que recibe pagos
  internacionales y quiere cobrar sin custodiar fondos ni integrar un PSP.
- Evidencia de esta edición: flujo completo verificado sobre Testnet, con
  pruebas automatizadas que liquidan un pago real y que rechazan un pago con
  monto incorrecto (`npm run test:net`).
- Siguientes pasos con fechas: activos emitidos y cotizaciones multi-asset
  (post hackathon), persistencia compartida para facturas multi-dispositivo,
  y evaluación de un contrato Soroban para reglas de liquidación
  programables (backlog M3).
