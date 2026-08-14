import { runAdapter } from "@nexus-project/adapter-sdk-ts";
import { bordenFedexAdapter } from "./adapter.js";

const exitCode = await runAdapter(bordenFedexAdapter);

process.exit(exitCode);
