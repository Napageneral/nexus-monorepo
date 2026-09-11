import { runAdapter } from "@nexus-project/adapter-sdk-ts";
import { wwexSpeedShipAdapter } from "./adapter.js";

const exitCode = await runAdapter(wwexSpeedShipAdapter);

process.exit(exitCode);
