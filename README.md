# InterstellaQ

> Pagos abiertos sin fronteras

InterstellaQ es un protocolo de pagos globales para comercios, sin custodia, en etapa temprana para Stellar. Los comercios registrados crean solicitudes de pago por código QR que los clientes autorizan con billeteras Stellar compatibles.

**Demo desplegada (Vercel):** https://app-virid-sigma-44.vercel.app

## Problema

Los pagos transfronterizos entre comercios siguen siendo fragmentados, costosos y difíciles de integrar. Los comercios necesitan un flujo de solicitud y liquidación simple e interoperable sin custodiar los fondos de los clientes.

## Solución propuesta

InterstellaQ es un protocolo de solicitud de pago nativo de Stellar: el comercio publica una factura, el cliente escanea una solicitud QR y autoriza una transferencia desde su billetera, y el comercio verifica la liquidación en Stellar. Soroban solo se considerará donde las reglas programables del protocolo aporten valor más allá de las operaciones nativas.

## Qué está implementado (Código Cordillera, pista Genesis)

El MVP del hackathon funciona de extremo a extremo sobre Stellar Testnet:

- Registro de comercio con prueba en cadena del control de la cuenta (transacción sin efecto firmada, evidencia vinculada en stellar.expert).
- Facturas de monto fijo con referencias únicas en memo de texto y expiración (15 minutos a 24 horas).
- Solicitud de pago QR que incrusta la petición completa en la URL, por lo que se abre en cualquier dispositivo sin backend, además de una entrega SEP-7 `web+stellar:pay` experimental y todavía no verificada con ninguna billetera (ver [ADR 0002](docs/adr/0002-invoice-correlation.md)).
- Pago del cliente a través de la billetera conectada (Stellar Wallets Kit): la aplicación construye el pago exacto en XLM, la billetera lo firma y la aplicación lo envía.
- Verificación de la liquidación contra Horizon: transacción exitosa, memo de referencia coincidente, destinatario, monto exacto en stroops, rechazo de activos no nativos, rechazo de autopagos, las facturas vencidas nunca se liquidan y una transacción nunca puede liquidar dos facturas.
- Monitoreo automático de pagos: el panel del comercio y la página de la factura consultan Horizon cada 20 segundos mientras hay una factura pendiente, de modo que un pago confirmado cambia el estado sin que nadie presione un botón.
- Estados de factura: active, settled, expired, verification_failed, con enlaces de evidencia pública por cada factura liquidada.
- Interfaz en español, formularios operables con teclado y equivalentes de texto para los datos del QR.

Queda deliberadamente fuera del alcance del MVP (ver [docs/PRD.md](docs/PRD.md)): custodia, reembolsos, rampas de fiat, KYC, activos emitidos y un backend.

### Alcance entregado frente a la descripción registrada del proyecto

Toda la funcionalidad de la descripción registrada ("Gateway Global de Pagamentos por QR Code") está presente: registro de empresa, solicitudes de pago por QR, autorización desde billeteras compatibles con Freighter, liquidación en cadena, monitoreo automático de pagos, panel de comercio con historial y enlaces al explorador. Hay tres desviaciones deliberadas y documentadas en [docs/PRD.md](docs/PRD.md) y en [ADR 0002](docs/adr/0002-invoice-correlation.md):

- **Solo XLM nativo**: las stablecoins y otros activos emitidos son un ítem de hoja de ruta, no parte del MVP.
- **React + Vite, no Next.js**: la plantilla oficial de Scaffold Stellar; TypeScript en todo el proyecto.
- **Sin backend NestJS**: el estado de las facturas vive en el navegador, y eso es lo que mantiene el flujo sin custodia.

## Cómo ejecutar

Prerrequisitos: Node.js 20 o superior y npm. La Stellar CLI, Rust y Docker solo son necesarios si trabajas con el espacio de contratos del scaffold (no requerido para la demo).

```bash
cd app
npm install
npm start
```

Abre http://localhost:5173, conecta una billetera de Testnet (por ejemplo Freighter en Testnet) y usa "Cargar cuenta" si la cuenta necesita XLM de prueba.

### Pruebas

Ejecutadas desde el directorio `app/`:

```bash
npm test          # suite unitaria: referencias, ciclo de vida, reglas de liquidación, payloads
npm run test:net  # chequeo en vivo sobre Testnet: un pago real liquida, un monto incorrecto no
```

`npm run test:net` financia dos cuentas desechables con friendbot, envía un pago real y comprueba el resultado de la verificación contra Horizon.

### Deploy

La aplicación estática de Vercel se construye y despliega desde el directorio `app/`:

**Demo desplegada:** https://app-virid-sigma-44.vercel.app

```bash
cd app
vercel --prod
```

`app/vercel.json` ejecuta la construcción del workspace (`npm run build`) y publica su salida: la raíz del proyecto en Vercel es `app/`, por lo que el directorio de salida es `app/dist` (es decir, `app/app/dist` desde la raíz del repositorio).

## Estructura del proyecto

```
app/                 Workspace de Scaffold Stellar (npm workspaces)
  app/               Frontend React + Vite + TypeScript (la demo)
  app-lib/           Helpers compartidos de billetera, red y formato
  contracts/         Contratos de ejemplo del scaffold (no usados por el MVP, reservados para el backlog M3)
docs/                PRD, requisitos, arquitectura, seguridad, backlog, pitch
docs/adr/            ADR 0001 (stack) y ADR 0002 (correlación, almacenamiento, entrega a billetera)
```

## Documentación

- [Requisitos del producto](docs/PRD.md)
- [Requisitos](docs/REQUIREMENTS.md)
- [Arquitectura](docs/ARCHITECTURE.md)
- [Seguridad](docs/SECURITY.md)
- [Backlog](docs/BACKLOG.md)
- [Guion del pitch](docs/PITCH.md)
- [ADR de stack tecnológico](docs/adr/0001-technology-stack.md)
- [ADR de correlación, almacenamiento y entrega a billetera](docs/adr/0002-invoice-correlation.md)

## Evidencia de verificación

La liquidación y el registro son públicos en Testnet. Cada factura liquidada y cada registro de comercio vincula su transacción en [stellar.expert, explorador de Testnet](https://stellar.expert/explorer/testnet).

## Visión a largo plazo

Hacer que los pagos abiertos e interoperables para comercios sean tan accesibles como el Pix de Brasil, usando Stellar para el movimiento transfronterizo de valor y Soroban para capacidades de liquidación programables cuidadosamente delimitadas.
