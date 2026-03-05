package operations

// RegisterStaticTaxonomy registers all static operations from the operation taxonomy.
// Handlers are nil initially — each phase wires in real handlers.
func RegisterStaticTaxonomy(r *Registry) {
	for _, def := range staticTaxonomy {
		r.Register(def)
	}
}

// staticTaxonomy is the canonical operation contract, ported from
// nex/src/nex/control-plane/runtime-operations.ts STATIC_RUNTIME_OPERATION_TAXONOMY.
var staticTaxonomy = []OperationDef{
	// Transport / handshake
	{Operation: "connect", Kind: KindProtocol, Action: ActionWrite, Resource: "auth.connect"},
	{Operation: "auth.login", Kind: KindProtocol, Action: ActionWrite, Resource: "auth.login", Surfaces: []Surface{SurfaceHTTPControl}},

	// Health / introspection
	{Operation: "health", Kind: KindControl, Action: ActionRead, Resource: "runtime.health", Surfaces: []Surface{SurfaceWSControl, SurfaceHTTPControl}},
	{Operation: "status", Kind: KindControl, Action: ActionRead, Resource: "runtime.status"},
	{Operation: "logs.tail", Kind: KindControl, Action: ActionRead, Resource: "runtime.logs"},
	{Operation: "system-presence", Kind: KindControl, Action: ActionRead, Resource: "runtime.presence"},
	{Operation: "system.presence", Kind: KindEvent, Action: ActionWrite, Resource: "system.presence", Surfaces: []Surface{SurfaceWSControl}},
	{Operation: "events.stream", Kind: KindControl, Action: ActionRead, Resource: "runtime.bus", Surfaces: []Surface{SurfaceHTTPControl}},
	{Operation: "apps.list", Kind: KindControl, Action: ActionRead, Resource: "runtime.apps", Surfaces: []Surface{SurfaceHTTPControl}},

	// Auth (control-plane user management)
	{Operation: "auth.users.list", Kind: KindControl, Action: ActionRead, Resource: "auth.users"},
	{Operation: "auth.users.create", Kind: KindControl, Action: ActionAdmin, Resource: "auth.users"},
	{Operation: "auth.users.setPassword", Kind: KindControl, Action: ActionAdmin, Resource: "auth.users.password"},
	{Operation: "auth.tokens.ingress.list", Kind: KindControl, Action: ActionRead, Resource: "auth.tokens.ingress"},
	{Operation: "auth.tokens.ingress.create", Kind: KindControl, Action: ActionAdmin, Resource: "auth.tokens.ingress"},
	{Operation: "auth.tokens.ingress.revoke", Kind: KindControl, Action: ActionAdmin, Resource: "auth.tokens.ingress"},
	{Operation: "auth.tokens.ingress.rotate", Kind: KindControl, Action: ActionAdmin, Resource: "auth.tokens.ingress"},

	// Adapter capability operations
	{Operation: "adapter.info", Kind: KindControl, Action: ActionRead, Resource: "adapter.info"},
	{Operation: "adapter.health", Kind: KindControl, Action: ActionRead, Resource: "adapter.health"},
	{Operation: "adapter.accounts.list", Kind: KindControl, Action: ActionRead, Resource: "adapter.accounts"},
	{Operation: "adapter.monitor.start", Kind: KindControl, Action: ActionAdmin, Resource: "adapter.monitor"},
	{Operation: "adapter.monitor.stop", Kind: KindControl, Action: ActionAdmin, Resource: "adapter.monitor"},
	{Operation: "adapter.control.start", Kind: KindControl, Action: ActionAdmin, Resource: "adapter.control"},
	{Operation: "adapter.setup.start", Kind: KindControl, Action: ActionPair, Resource: "adapter.setup"},
	{Operation: "adapter.setup.submit", Kind: KindControl, Action: ActionPair, Resource: "adapter.setup"},
	{Operation: "adapter.setup.status", Kind: KindControl, Action: ActionRead, Resource: "adapter.setup"},
	{Operation: "adapter.setup.cancel", Kind: KindControl, Action: ActionPair, Resource: "adapter.setup"},
	{Operation: "delivery.send", Kind: KindControl, Action: ActionWrite, Resource: "delivery.send"},
	{Operation: "delivery.stream", Kind: KindControl, Action: ActionWrite, Resource: "delivery.stream"},
	{Operation: "delivery.react", Kind: KindControl, Action: ActionWrite, Resource: "delivery.react"},
	{Operation: "delivery.edit", Kind: KindControl, Action: ActionWrite, Resource: "delivery.edit"},
	{Operation: "delivery.delete", Kind: KindControl, Action: ActionWrite, Resource: "delivery.delete"},
	{Operation: "delivery.poll", Kind: KindControl, Action: ActionWrite, Resource: "delivery.poll"},
	{Operation: "adapter.connections.list", Kind: KindControl, Action: ActionRead, Resource: "adapter.connections"},
	{Operation: "adapter.connections.status", Kind: KindControl, Action: ActionRead, Resource: "adapter.connections"},
	{Operation: "adapter.connections.oauth.start", Kind: KindControl, Action: ActionPair, Resource: "adapter.connections.oauth"},
	{Operation: "adapter.connections.oauth.complete", Kind: KindControl, Action: ActionPair, Resource: "adapter.connections.oauth"},
	{Operation: "adapter.connections.apikey.save", Kind: KindControl, Action: ActionAdmin, Resource: "adapter.connections.credentials"},
	{Operation: "adapter.connections.upload", Kind: KindControl, Action: ActionWrite, Resource: "adapter.connections.upload"},
	{Operation: "adapter.connections.custom.start", Kind: KindControl, Action: ActionPair, Resource: "adapter.connections.custom"},
	{Operation: "adapter.connections.custom.submit", Kind: KindControl, Action: ActionPair, Resource: "adapter.connections.custom"},
	{Operation: "adapter.connections.custom.status", Kind: KindControl, Action: ActionRead, Resource: "adapter.connections.custom"},
	{Operation: "adapter.connections.custom.cancel", Kind: KindControl, Action: ActionPair, Resource: "adapter.connections.custom"},
	{Operation: "adapter.connections.test", Kind: KindControl, Action: ActionRead, Resource: "adapter.connections"},
	{Operation: "adapter.connections.disconnect", Kind: KindControl, Action: ActionAdmin, Resource: "adapter.connections"},

	// Models / usage
	{Operation: "models.list", Kind: KindControl, Action: ActionRead, Resource: "models"},
	{Operation: "usage.status", Kind: KindControl, Action: ActionRead, Resource: "usage"},
	{Operation: "usage.cost", Kind: KindControl, Action: ActionRead, Resource: "usage"},
	{Operation: "sessions.usage", Kind: KindControl, Action: ActionRead, Resource: "sessions.usage"},
	{Operation: "sessions.usage.timeseries", Kind: KindControl, Action: ActionRead, Resource: "sessions.usage"},
	{Operation: "sessions.usage.logs", Kind: KindControl, Action: ActionRead, Resource: "sessions.usage"},

	// Config
	{Operation: "config.get", Kind: KindControl, Action: ActionRead, Resource: "config"},
	{Operation: "config.schema", Kind: KindControl, Action: ActionRead, Resource: "config.schema"},
	{Operation: "config.set", Kind: KindControl, Action: ActionAdmin, Resource: "config"},
	{Operation: "config.patch", Kind: KindControl, Action: ActionAdmin, Resource: "config"},
	{Operation: "config.apply", Kind: KindControl, Action: ActionAdmin, Resource: "config"},

	// Wizard / onboarding
	{Operation: "wizard.start", Kind: KindControl, Action: ActionAdmin, Resource: "wizard"},
	{Operation: "wizard.next", Kind: KindControl, Action: ActionAdmin, Resource: "wizard"},
	{Operation: "wizard.cancel", Kind: KindControl, Action: ActionAdmin, Resource: "wizard"},
	{Operation: "wizard.status", Kind: KindControl, Action: ActionRead, Resource: "wizard"},

	// Agents (personas)
	{Operation: "agents.list", Kind: KindControl, Action: ActionRead, Resource: "agents"},
	{Operation: "agents.create", Kind: KindControl, Action: ActionAdmin, Resource: "agents"},
	{Operation: "agents.update", Kind: KindControl, Action: ActionAdmin, Resource: "agents"},
	{Operation: "agents.delete", Kind: KindControl, Action: ActionAdmin, Resource: "agents"},
	{Operation: "agents.files.list", Kind: KindControl, Action: ActionRead, Resource: "agents.files"},
	{Operation: "agents.files.get", Kind: KindControl, Action: ActionRead, Resource: "agents.files"},
	{Operation: "agents.files.set", Kind: KindControl, Action: ActionAdmin, Resource: "agents.files"},
	{Operation: "agent.identity.get", Kind: KindControl, Action: ActionRead, Resource: "agents.identity"},
	{Operation: "agent.wait", Kind: KindControl, Action: ActionRead, Resource: "agents.runs"},

	// Skills
	{Operation: "skills.status", Kind: KindControl, Action: ActionRead, Resource: "skills"},
	{Operation: "skills.install", Kind: KindControl, Action: ActionAdmin, Resource: "skills"},
	{Operation: "skills.update", Kind: KindControl, Action: ActionAdmin, Resource: "skills"},

	// Sessions
	{Operation: "sessions.list", Kind: KindControl, Action: ActionRead, Resource: "sessions"},
	{Operation: "sessions.resolve", Kind: KindControl, Action: ActionRead, Resource: "sessions"},
	{Operation: "sessions.preview", Kind: KindControl, Action: ActionRead, Resource: "sessions.history"},
	{Operation: "sessions.import", Kind: KindControl, Action: ActionAdmin, Resource: "sessions.import"},
	{Operation: "sessions.import.chunk", Kind: KindControl, Action: ActionAdmin, Resource: "sessions.import"},
	{Operation: "sessions.patch", Kind: KindControl, Action: ActionAdmin, Resource: "sessions"},
	{Operation: "sessions.reset", Kind: KindControl, Action: ActionAdmin, Resource: "sessions"},
	{Operation: "sessions.delete", Kind: KindControl, Action: ActionAdmin, Resource: "sessions"},
	{Operation: "sessions.compact", Kind: KindControl, Action: ActionAdmin, Resource: "sessions.compaction"},

	// Memory review
	{Operation: "memory.review.runs.list", Kind: KindControl, Action: ActionRead, Resource: "memory.review"},
	{Operation: "memory.review.run.get", Kind: KindControl, Action: ActionRead, Resource: "memory.review"},
	{Operation: "memory.review.run.episodes.list", Kind: KindControl, Action: ActionRead, Resource: "memory.review"},
	{Operation: "memory.review.episode.get", Kind: KindControl, Action: ActionRead, Resource: "memory.review"},
	{Operation: "memory.review.episode.outputs.get", Kind: KindControl, Action: ActionRead, Resource: "memory.review"},
	{Operation: "memory.review.quality.summary", Kind: KindControl, Action: ActionRead, Resource: "memory.review"},
	{Operation: "memory.review.quality.items.list", Kind: KindControl, Action: ActionRead, Resource: "memory.review"},
	{Operation: "memory.review.entity.get", Kind: KindControl, Action: ActionRead, Resource: "memory.review"},
	{Operation: "memory.review.fact.get", Kind: KindControl, Action: ActionRead, Resource: "memory.review"},
	{Operation: "memory.review.observation.get", Kind: KindControl, Action: ActionRead, Resource: "memory.review"},
	{Operation: "memory.review.search", Kind: KindControl, Action: ActionRead, Resource: "memory.review"},

	// Work CRM operations
	{Operation: "work.tasks.list", Kind: KindControl, Action: ActionRead, Resource: "work.tasks"},
	{Operation: "work.tasks.create", Kind: KindControl, Action: ActionWrite, Resource: "work.tasks"},
	{Operation: "work.entities.seed", Kind: KindControl, Action: ActionWrite, Resource: "work.entities"},
	{Operation: "work.workflows.list", Kind: KindControl, Action: ActionRead, Resource: "work.workflows"},
	{Operation: "work.workflows.create", Kind: KindControl, Action: ActionWrite, Resource: "work.workflows"},
	{Operation: "work.workflows.instantiate", Kind: KindControl, Action: ActionWrite, Resource: "work.workflows"},
	{Operation: "work.campaigns.instantiate", Kind: KindControl, Action: ActionWrite, Resource: "work.campaigns"},
	{Operation: "work.items.list", Kind: KindControl, Action: ActionRead, Resource: "work.items"},
	{Operation: "work.items.get", Kind: KindControl, Action: ActionRead, Resource: "work.items"},
	{Operation: "work.items.create", Kind: KindControl, Action: ActionWrite, Resource: "work.items"},
	{Operation: "work.items.events.list", Kind: KindControl, Action: ActionRead, Resource: "work.items.events"},
	{Operation: "work.items.assign", Kind: KindControl, Action: ActionWrite, Resource: "work.items"},
	{Operation: "work.items.snooze", Kind: KindControl, Action: ActionWrite, Resource: "work.items"},
	{Operation: "work.items.complete", Kind: KindControl, Action: ActionWrite, Resource: "work.items"},
	{Operation: "work.items.cancel", Kind: KindControl, Action: ActionWrite, Resource: "work.items"},
	{Operation: "work.sequences.list", Kind: KindControl, Action: ActionRead, Resource: "work.sequences"},
	{Operation: "work.sequences.get", Kind: KindControl, Action: ActionRead, Resource: "work.sequences"},
	{Operation: "work.dashboard.summary", Kind: KindControl, Action: ActionRead, Resource: "work.dashboard"},

	// Chat / ingress operations
	{Operation: "chat.history", Kind: KindControl, Action: ActionRead, Resource: "chat.history"},
	{Operation: "chat.abort", Kind: KindControl, Action: ActionWrite, Resource: "chat"},
	{Operation: "chat.inject", Kind: KindControl, Action: ActionAdmin, Resource: "chat.inject"},
	{Operation: "event.ingest", Kind: KindEvent, Action: ActionWrite, Resource: "ingress.event", Surfaces: []Surface{SurfaceWSControl, SurfaceHTTPIngress, SurfaceAdapterCLI, SurfaceInternalClock}},
	{Operation: "event.backfill", Kind: KindEvent, Action: ActionWrite, Resource: "ingress.backfill", Surfaces: []Surface{SurfaceWSControl, SurfaceAdapterCLI}},

	// Clock schedule operations
	{Operation: "clock.schedule.wake", Kind: KindControl, Action: ActionWrite, Resource: "clock.schedule"},
	{Operation: "clock.schedule.list", Kind: KindControl, Action: ActionRead, Resource: "clock.schedule"},
	{Operation: "clock.schedule.status", Kind: KindControl, Action: ActionRead, Resource: "clock.schedule"},
	{Operation: "clock.schedule.create", Kind: KindControl, Action: ActionAdmin, Resource: "clock.schedule"},
	{Operation: "clock.schedule.update", Kind: KindControl, Action: ActionAdmin, Resource: "clock.schedule"},
	{Operation: "clock.schedule.remove", Kind: KindControl, Action: ActionAdmin, Resource: "clock.schedule"},
	{Operation: "clock.schedule.run", Kind: KindControl, Action: ActionAdmin, Resource: "clock.schedule"},
	{Operation: "clock.schedule.runs", Kind: KindControl, Action: ActionRead, Resource: "clock.schedule"},

	// Device pairing
	{Operation: "device.pair.list", Kind: KindControl, Action: ActionPair, Resource: "pairing.devices"},
	{Operation: "device.pair.approve", Kind: KindControl, Action: ActionPair, Resource: "pairing.devices"},
	{Operation: "device.pair.reject", Kind: KindControl, Action: ActionPair, Resource: "pairing.devices"},
	{Operation: "device.token.rotate", Kind: KindControl, Action: ActionPair, Resource: "pairing.devices.tokens"},
	{Operation: "device.token.revoke", Kind: KindControl, Action: ActionPair, Resource: "pairing.devices.tokens"},
	{Operation: "device.host.list", Kind: KindControl, Action: ActionRead, Resource: "device.host"},
	{Operation: "device.host.describe", Kind: KindControl, Action: ActionRead, Resource: "device.host"},
	{Operation: "device.host.invoke", Kind: KindControl, Action: ActionWrite, Resource: "device.host.invoke"},

	// Browser control
	{Operation: "browser.request", Kind: KindControl, Action: ActionWrite, Resource: "browser", Surfaces: []Surface{SurfaceWSControl, SurfaceHTTPControl}},

	// Speech features
	{Operation: "talk.mode", Kind: KindControl, Action: ActionWrite, Resource: "talk"},
	{Operation: "tts.status", Kind: KindControl, Action: ActionRead, Resource: "tts"},
	{Operation: "tts.providers", Kind: KindControl, Action: ActionRead, Resource: "tts"},
	{Operation: "tts.enable", Kind: KindControl, Action: ActionWrite, Resource: "tts"},
	{Operation: "tts.disable", Kind: KindControl, Action: ActionWrite, Resource: "tts"},
	{Operation: "tts.convert", Kind: KindControl, Action: ActionWrite, Resource: "tts"},
	{Operation: "tts.setProvider", Kind: KindControl, Action: ActionWrite, Resource: "tts"},
	{Operation: "voicewake.get", Kind: KindControl, Action: ActionRead, Resource: "voicewake"},
	{Operation: "voicewake.set", Kind: KindControl, Action: ActionWrite, Resource: "voicewake"},

	// ACL approvals
	{Operation: "acl.requests.list", Kind: KindControl, Action: ActionApprove, Resource: "acl.requests"},
	{Operation: "acl.requests.show", Kind: KindControl, Action: ActionApprove, Resource: "acl.requests"},
	{Operation: "acl.requests.approve", Kind: KindControl, Action: ActionApprove, Resource: "acl.requests"},
	{Operation: "acl.requests.deny", Kind: KindControl, Action: ActionApprove, Resource: "acl.requests"},
	{Operation: "acl.approval.request", Kind: KindControl, Action: ActionApprove, Resource: "acl.approvals"},

	// Tools invoke
	{Operation: "tools.invoke", Kind: KindControl, Action: ActionWrite, Resource: "tools.invoke", Surfaces: []Surface{SurfaceHTTPControl}},

	// Updates
	{Operation: "update.run", Kind: KindControl, Action: ActionAdmin, Resource: "runtime.update"},
}
