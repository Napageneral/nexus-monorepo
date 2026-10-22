import { runAdapter } from "@nexus-project/adapter-sdk-ts";
import { flexportAdapter } from "./adapter.js";

const exitCode = await runAdapter(flexportAdapter);

process.exitCode = exitCode;
