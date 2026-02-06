# Streaming in NEX

> **This document has been consolidated.** See [`../STREAMING.md`](../STREAMING.md) for the canonical streaming architecture spec.

Streaming is a cross-cutting concern that touches Broker, NEX, and Adapters. The consolidated doc covers:
- StreamEvent protocol
- NEX stream router (native adapter streaming vs block pipeline fallback)
- Broker → NEX interface (BrokerStreamHandle)
- Adapter `stream` command protocol (bidirectional JSONL)
- Platform-specific adapter behavior
- Interruption and partial failure handling

**Note:** The previous version of this document described an internal adapter model where the Broker streamed directly to adapter objects. That model has been superseded by the external CLI adapter model defined in `../adapters/ADAPTER_SYSTEM.md`. The consolidated spec reflects the current architecture.
