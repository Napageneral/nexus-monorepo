#!/usr/bin/env node

import { runAdapter } from "@nexus-project/adapter-sdk-ts";
import { whatsappAdapter } from "./adapter.js";

const exitCode = await runAdapter(whatsappAdapter, {
  requireRuntimeContext: false,
});

process.exit(exitCode);
