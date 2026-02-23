#!/usr/bin/env node

import { runAdapter } from "@nexus-project/adapter-sdk-ts";
import { telegramAdapter } from "./adapter.js";

const exitCode = await runAdapter(telegramAdapter, {
  requireRuntimeContext: false,
});

process.exit(exitCode);
