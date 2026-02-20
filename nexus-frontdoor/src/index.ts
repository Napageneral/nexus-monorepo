import { createFrontdoorServer } from "./server.js";

const { server, config } = createFrontdoorServer();

server.listen(config.port, config.host, () => {
  const origin = `${config.baseUrl.replace(/\/+$/, "")}`;
  process.stdout.write(`[frontdoor] listening on ${origin}\n`);
});

function shutdown(signal: NodeJS.Signals): void {
  process.stdout.write(`[frontdoor] shutting down (${signal})\n`);
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
