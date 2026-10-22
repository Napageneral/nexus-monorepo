# Flexport adapter

This package connects MoonSleep's Flexport API v2 client to Nex. It reads shipments, their containers, legs, customs entries, invoices and documents, and MoonSleep's Flexport network, and emits each shipment bundle and the network as immutable Records. Final document files are downloaded once into the adapter's private custody and attached to the shipment Record.

The binding is adapter `flexport`, platform `flexport`, service `flexport`, account `moonsleep`, connection `moonsleep-flexport`, credential row `flexport/moonsleep-flexport`. The connection stores the Flexport client id and secret; the adapter exchanges them for one cached bearer token (Flexport allows 10 token requests a day; the adapter refuses at 8) and sends it only to `https://api.flexport.com`.

The adapter writes to Flexport only through `flexport.products.create`, `flexport.products.update`, `flexport.bookings.create` and `flexport.documents.create`, and only when the call carries the exact JSON body, its sha256, Tyler's words and `SEND_TO_FLEXPORT`. The monitor, backfill and health never write. Meaning (matching shipments to purchase orders, applying dates, holds) lives in moonsleep-v1, not here.
