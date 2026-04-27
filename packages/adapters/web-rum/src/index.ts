import { runAdapter } from "@nexus-project/adapter-sdk-ts";
import { webRumAdapter } from "./adapter.js";

const exitCode = await runAdapter(webRumAdapter);

process.exit(exitCode);
