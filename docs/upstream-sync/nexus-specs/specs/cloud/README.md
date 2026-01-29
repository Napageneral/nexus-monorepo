# Nexus Cloud Specs

**Status:** SPEC NEEDED  
**Conflict Risk:** Low (new feature)

---

## Documents

| Spec | Status | Description |
|------|--------|-------------|
| `NEXUS_CLOUD.md` | TODO | Sync service design |

---

## Concept

Encrypted backup and sync of user's `home/` directory.

### Features

| Feature | Description |
|---------|-------------|
| Encryption | Keys stay local, server never sees plaintext |
| Scope | Everything in `home/` EXCEPT patterns in `.nexusignore` |
| Sync | Push/pull on demand, optional auto-sync |

### What Gets Synced

- `home/` directory (user's personal space)
- NOT: `state/` (sessions, credentials — too sensitive)
- NOT: `skills/` (managed via hub)

### What Gets Ignored

Default `.nexusignore` patterns:
- `.git/` directories
- `node_modules/`
- `.venv/`
- Build artifacts

---

## Skill

`nexus-cloud` skill provides usage guide.

```bash
nexus skills use nexus-cloud
```

---

*Full spec to be written.*
