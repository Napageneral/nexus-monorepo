#!/usr/bin/env node

import { runAdapter } from "@nexus-project/adapter-sdk-ts";
import { discordAdapter } from "./adapter.js";

await runAdapter(discordAdapter);
