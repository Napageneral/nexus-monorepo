# WWEX SpeedShip adapter

This package registers MoonSleep's existing root-owned WWEX SpeedShip collector as a read-only Nex source connection.

It deliberately receives no SpeedShip credential and performs no browser work. The browser collector, invoice Record registration job, reconciliation agent, and Dispatch projection remain separate authority stages.

The adapter provides the reviewed connection identity the invoice publisher's `record.ingest` calls bind to: adapter `wwex-speedship`, platform `speedship`, account `moonsleep-production`, connection `moonsleep-wwex-speedship`. Records land through the public `record.ingest` seam (one immutable Record per invoice revision); this package never emits them itself.
