import { runAdapter } from "@nexus-project/adapter-sdk-ts";
import { mailchimpAdapter } from "./adapter.js";

await runAdapter(mailchimpAdapter);
