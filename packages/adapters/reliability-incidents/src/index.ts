import { runAdapter } from "@nexus-project/adapter-sdk-ts";
import { reliabilityIncidentsAdapter } from "./adapter.js";

const exitCode = await runAdapter(reliabilityIncidentsAdapter);

process.exitCode = exitCode;
