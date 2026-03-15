#!/usr/bin/env -S node --import tsx
/**
 * Standalone test: Spike service start + dispatch (Rung 11)
 *
 * Validates:
 * 1. App discovery finds the Spike app
 * 2. isServiceRouted() correctly identifies it
 * 3. ServiceManager spawns the spike-engine stub binary
 * 4. Health check passes (port allocation, binary starts)
 * 5. Service dispatch handlers are constructed
 * 6. Method calls are dispatched to the service and responses come back
 * 7. Graceful shutdown works
 */
import { discoverApps } from "../src/apps/discovery.js";
import { AppRegistry } from "../src/apps/registry.js";
import { isServiceRouted, buildServiceDispatchHandlers } from "../src/apps/service-dispatch.js";
import { ServiceManager } from "../src/apps/service-manager.js";

const APPS_DIR = "/Users/tyler/nexus/home/projects/nexus/apps";

async function main() {
  console.log("=== Rung 11: Spike Service Start + Dispatch ===\n");

  // Step 1: Discover apps
  console.log("Step 1: Discovering apps...");
  const apps = discoverApps(APPS_DIR);
  const spikeApp = apps.find((a) => a.manifest.id === "spike");
  if (!spikeApp) {
    console.error("FAIL: spike app not found in discovered apps");
    console.error("  Found:", apps.map((a) => a.manifest.id).join(", "));
    process.exit(1);
  }
  console.log(`  ✓ Found spike app at ${spikeApp.packageDir}`);

  // Step 2: Verify it's service-routed
  console.log("\nStep 2: Checking service routing...");
  const serviceRouted = isServiceRouted(spikeApp.manifest);
  if (!serviceRouted) {
    console.error("FAIL: spike should be service-routed but isServiceRouted returned false");
    process.exit(1);
  }
  console.log("  ✓ isServiceRouted(spike) = true");
  console.log(`  Services: ${Object.keys(spikeApp.manifest.services || {}).join(", ")}`);
  console.log(`  Methods:  ${Object.keys(spikeApp.manifest.methods || {}).length} total`);

  // Step 3: Register in AppRegistry
  console.log("\nStep 3: Registering in AppRegistry...");
  const registry = new AppRegistry();
  registry.register(spikeApp.manifest, spikeApp.packageDir);
  const registeredSpike = registry.get("spike");
  if (!registeredSpike) {
    console.error("FAIL: spike not in registry after registration");
    process.exit(1);
  }
  console.log("  ✓ Spike registered in AppRegistry");

  // Step 4: Start services via ServiceManager
  console.log("\nStep 4: Starting spike services via ServiceManager...");
  const serviceManager = new ServiceManager({
    maxRestarts: 1,
    healthCheckIntervalMs: 60_000,  // long interval; we don't need periodic checks in this test
    initialHealthTimeoutMs: 10_000, // 10s timeout for initial health
    shutdownGracePeriodMs: 3_000,
  });

  try {
    await serviceManager.startServices(spikeApp.manifest, spikeApp.packageDir);
    console.log("  ✓ Services started successfully");
  } catch (err) {
    console.error("FAIL: Failed to start services:", err);
    process.exit(1);
  }

  // Step 5: Verify health
  console.log("\nStep 5: Checking service health...");
  const engineHealthy = serviceManager.isServiceHealthy("spike", "engine");
  if (!engineHealthy) {
    console.error("FAIL: spike/engine is not healthy after startup");
    await serviceManager.stopAll();
    process.exit(1);
  }
  console.log("  ✓ spike/engine is healthy");

  const services = serviceManager.getServices("spike");
  console.log(`  Port: ${services[0]?.port}`);
  console.log(`  PID:  ${services[0]?.process?.pid}`);

  // Step 6: Build service dispatch handlers
  console.log("\nStep 6: Building service dispatch handlers...");
  const handlers = buildServiceDispatchHandlers(
    spikeApp.manifest,
    () => serviceManager.getServiceClient("spike", "engine"),
  );
  console.log(`  ✓ Built ${handlers.size} dispatch handlers`);

  // Verify all manifest methods have handlers
  const manifestMethods = Object.keys(spikeApp.manifest.methods || {});
  const missingHandlers = manifestMethods.filter((m) => !handlers.has(m));
  if (missingHandlers.length > 0) {
    console.error("FAIL: Missing handlers for:", missingHandlers.join(", "));
    await serviceManager.stopAll();
    process.exit(1);
  }
  console.log(`  ✓ All ${manifestMethods.length} manifest methods have dispatch handlers`);

  // Step 7: Call methods through dispatch
  console.log("\nStep 7: Dispatching method calls...");

  // 7a: spike.status
  console.log("  Calling spike.status...");
  const statusHandler = handlers.get("spike.status")!;
  const statusResult = await statusHandler(
    {},
    { user: { userId: "test-user", email: "test@example.com" }, requestId: "test-001" },
  );
  console.log(`  ✓ spike.status: ${JSON.stringify(statusResult)}`);

  // 7b: spike.ask
  console.log("  Calling spike.ask...");
  const askHandler = handlers.get("spike.ask")!;
  const askResult = await askHandler(
    { query: "How does authentication work?", tree_id: "tree-abc" },
    { user: { userId: "test-user", email: "test@example.com" }, requestId: "test-002" },
  );
  console.log(`  ✓ spike.ask: ${JSON.stringify(askResult).slice(0, 200)}`);

  // 7c: spike.repositories.list
  console.log("  Calling spike.repositories.list...");
  const repoListHandler = handlers.get("spike.repositories.list")!;
  const repoListResult = await repoListHandler(
    {},
    { user: { userId: "test-user" }, requestId: "test-003" },
  );
  console.log(`  ✓ spike.repositories.list: ${JSON.stringify(repoListResult)}`);

  // 7d: spike.sync
  console.log("  Calling spike.sync...");
  const syncHandler = handlers.get("spike.sync")!;
  const syncResult = await syncHandler(
    { tree_id: "tree-xyz", repo_id: "repo-1", ref: "main" },
    { user: { userId: "test-user" }, requestId: "test-004" },
  );
  console.log(`  ✓ spike.sync: ${JSON.stringify(syncResult)}`);

  // Step 8: Graceful shutdown
  console.log("\nStep 8: Graceful shutdown...");
  await serviceManager.stopAll();

  // Verify service is gone
  const afterStop = serviceManager.getServices("spike");
  if (afterStop.length > 0) {
    console.error("FAIL: Services still registered after stopAll");
    process.exit(1);
  }
  console.log("  ✓ All services stopped and cleaned up");

  console.log("\n✅ Rung 11 PASS — Spike service start + dispatch validated");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
