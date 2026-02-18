# Streaming (Broker)

> **This document has been consolidated.** See [`../STREAMING.md`](../STREAMING.md) for the canonical streaming architecture spec.

Streaming is a cross-cutting concern that touches Broker, NEX, and Adapters. The consolidated doc covers:
- StreamEvent protocol
- Broker → NEX interface (BrokerStreamHandle, BrokerExecution)
- Agent Engine → Broker callback translation
- NEX stream routing (native vs block pipeline)
- Adapter `stream` command protocol
- Interruption (preempt/abort)
- Streaming vs ledger write separation
