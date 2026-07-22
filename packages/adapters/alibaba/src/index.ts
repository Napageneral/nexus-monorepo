import { runAdapter } from "@nexus-project/adapter-sdk-ts";
import { alibabaAdapter } from "./adapter.js";

const exitCode = await runAdapter(alibabaAdapter);

process.exitCode = exitCode;
