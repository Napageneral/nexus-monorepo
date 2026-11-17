# Borden FedEx adapter

This package registers MoonSleep's existing root-owned Borden FedEx Billing Online collector as a read-only Nex source connection.

It deliberately receives no FedEx credential and performs no browser work. The browser collector, invoice Record registration job, reconciliation agent, and Dispatch projection remain separate authority stages.

The adapter provides the reviewed connection identity required by `records.revisions.register`: adapter `borden-fedex`, service `fedex-billing-online`, account `borden-production`.
