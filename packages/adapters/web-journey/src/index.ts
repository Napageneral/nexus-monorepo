import { runAdapter } from "@nexus-project/adapter-sdk-ts";
import { webJourneyAdapter } from "./adapter.js";

const exitCode = await runAdapter(webJourneyAdapter);

process.exit(exitCode);
