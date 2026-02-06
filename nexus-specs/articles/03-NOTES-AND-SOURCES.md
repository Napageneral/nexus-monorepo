# Article Notes and Sources

Reference material for "OpenClaw and the Rise of the Agent Operating System"

---

## Security Incidents and Sources

### CVE-2026-25253 — One-Click Remote Code Execution (CVSS 8.8)
- **What**: Control UI trusts `gatewayUrl` from query string without validation, auto-connects on load, sends stored gateway token to attacker's server. Attacker gains full gateway control: modify configs, invoke privileged actions, achieve RCE.
- **Patched**: Version 2026.1.29, released January 30, 2026
- **Source**: [The Hacker News — OpenClaw Bug Enables One-Click Remote Code Execution via Malicious Link](https://thehackernews.com/2026/02/openclaw-bug-enables-one-click-remote.html)
- **Source**: [SecurityWeek — Vulnerability Allows Hackers to Hijack OpenClaw AI Assistant](https://securityweek.com/vulnerability-allows-hackers-to-hijack-openclaw-ai-assistant)

### 1,100+ Instances Exposed on Public Internet
- **What**: Researchers using Shodan and Censys found 1,100+ Clawdbot/Moltbot gateway instances publicly accessible. Many with NO authentication on port 18789.
- **Exposed**: Shell command execution, plaintext API keys (OpenAI, Anthropic, etc.), full conversation histories, root system access, browser control of logged-in accounts.
- **Notable case**: One attacker consumed 180 million Anthropic tokens after harvesting API credentials from an exposed instance.
- **Source**: [Breached.company — Over 1,000 Clawdbot AI Agents Exposed on the Public Internet](https://breached.company/over-1-000-clawdbot-ai-agents-exposed-on-the-public-internet-a-security-wake-up-call-for-autonomous-ai-infrastructure/)
- **Source**: [BeyondMachines — Clawdbot Security Issues: Over 1,000 AI Agent Servers Exposed](https://beyondmachines.net/event_details/clawdbot-security-issues-over-1000-ai-agent-servers-exposed-to-unauthenticated-access-6-y-a-t-e)
- **Source**: [ToClawdbot — Deep Dive: Analysis of Clawdbot Gateway Port Exposure](https://toclawdbot.com/security/vulnerability-analysis)

### Enterprise Shadow IT Adoption
- **22% of enterprise employees** have Clawdbot installed on personal devices (Token Security)
- **53% of enterprise customers** gave ClawdBot privileged access over a single weekend without formal permission processes (Noma Security)
- Running on unmanaged personal devices, bypassing corporate DLP controls and audit trails
- **Source**: [Token Security — The Clawdbot (Moltbot) Enterprise AI Risk: One in Five Have it Installed](https://www.token.security/blog/the-clawdbot-enterprise-ai-risk-one-in-five-have-it-installed)
- **Source**: [Noma Security — 53% of our Enterprise Customers Gave ClawdBot Privileged Access](https://noma.security/blog/customers-gave-clawdbot-privileged-access-and-noone-asked-permission/)

### Active Attack Campaigns
- Infostealer malware campaigns actively targeting Clawdbot configuration directories
- **Source**: [Guardz — When AI Agents Go Wrong: ClawdBot's Security Failures, Active Campaigns, and Defense Playbook](https://guardz.com/blog/when-ai-agents-go-wrong-clawdbots-security-failures-active-campaigns-and-defense-playbook)

### Industry Analysis
- **Cisco**: Published "Personal AI Agents Like Moltbot Are a Security Nightmare"
  - [Cisco Blog](https://blogs.cisco.com/ai/personal-ai-agents-like-moltbot-are-a-security-nightmare)
- **The Register**: "Clawdbot sheds skin to become Moltbot, can't slough off security issues"
  - [The Register](https://www.theregister.com/2026/01/27/clawdbot_moltbot_security_concerns/)
- **ZDNet**: "OpenClaw is a security nightmare — 5 red flags you shouldn't ignore"
  - [ZDNet](https://zdnet.com/article/openclaw-moltbot-clawdbot-5-reasons-viral-ai-agent-security-nightmare)
- **IT Brief UK**: "Shadow AI assistant Clawdbot raises workplace risks"
  - [IT Brief](https://itbrief.co.uk/story/shadow-ai-assistant-clawdbot-raises-workplace-risks)

### Rebrand Chaos / Crypto Scam
- Anthropic forced trademark rebrand from Clawdbot to Moltbot (January 2026)
- During rebrand, crypto scammers hijacked original GitHub org and X account (~10 seconds)
- Launched fraudulent $CLAWD token that reached $16M market cap before collapse
- Source: BeyondMachines article above

---

## Key Stats for the Article
- 149,000-167,000+ GitHub stars as of Feb 2026
- Gained 54,000 stars in three days (Jan 24-27, 2026)
- Released November 2025
- Created by Peter Steinberger (successfully exited founder, raised €100M)
- CVE-2026-25253 patched Jan 30, 2026 (days before article publication)

---

## Potential Article References
These could be linked or cited in the article:
1. The Hacker News CVE article (most technical, most credible)
2. Token Security enterprise adoption report (strongest enterprise angle)
3. Cisco blog (big brand, validates "security nightmare" framing)
4. Breached.company exposed instances report (most visceral)
