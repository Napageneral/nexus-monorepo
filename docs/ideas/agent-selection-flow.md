## Agent Selection Flow (Follow-up)

Status: TODO

### Why
- When multiple agents exist and no explicit agent id is set, the gateway should prompt for selection instead of falling back to "default".

### Open Questions
- Should selection persist to `config.agent.id`, or only to session state?
- Should the prompt be gated to DMs only, or allowed in group contexts?
- Do we need a timeout or retry flow for "no response"?

### Next Steps
- Define UX copy and selection command patterns.
- Decide persistence rules and config update behavior.
- Add tests for multi-agent selection and no-agent cases.
