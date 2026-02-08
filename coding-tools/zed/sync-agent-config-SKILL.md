---
name: sync-agent-config
description: Sync global Zed rules and skills between the agents repo (~/mia-cx/agents) and the global config directory. Use when the user wants to push local changes to global config, pull global config into the repo, or check for drift between the two.
---

# Sync Agent Config

Keep `~/mia-cx/agents/` (version-controlled) in sync with the active global Zed config.

## Repo Structure

```
~/mia-cx/agents/
  AGENTS.md          ← Master AGENTS.md template
    create-agents-md/SKILL.md
    sync-agent-config/SKILL.md
```

## Sync Directions

### Push (repo → global)

Deploy repo contents to the active global Zed config. Use after editing skills/rules in the repo.

```bash
rsync -av --delete \
  ~/mia-cx/agents/skills/ \

rsync -av --delete \
  ~/mia-cx/agents/rules/ \
```

### Pull (global → repo)

Capture new skills/rules created during work sessions back into the repo.

```bash
rsync -av --delete \
  ~/mia-cx/agents/skills/

rsync -av --delete \
  ~/mia-cx/agents/rules/
```

### Diff (check for drift)

See what's different without changing anything.

```bash

```

## Workflow

1. **Ask the user which direction**: push, pull, or diff.
2. **Run diff first** to show what would change.
3. **Confirm before destructive syncs** — `--delete` removes files at the destination that don't exist at the source.
4. **After push or pull**, list the synced contents to confirm.

## Important

- **The repo is the source of truth.** Prefer editing in the repo and pushing, but pull after work sessions where new skills/rules were created on-the-fly.
- **Commit after pulling.** If you pull new config into the repo, remind the user to commit.
