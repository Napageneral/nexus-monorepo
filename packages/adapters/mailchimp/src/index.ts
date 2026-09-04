import { runAdapter } from "@nexus-project/adapter-sdk-ts";
import { mailchimpAdapter } from "./adapter.js";

// A failed backfill must exit non-zero: the runtime's backfill job resolves only on
// exit 0, so a discarded code would mark a fail-closed run as complete.
process.exitCode = await runAdapter(mailchimpAdapter);
