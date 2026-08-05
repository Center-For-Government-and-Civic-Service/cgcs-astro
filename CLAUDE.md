# CLAUDE.md

## Vault Sync

vault_project: ~/code/s-vault/03_projects/CGCS-Website/
tier: 1

## Session Rules

### Session Start
1. Read the vault dashboard frontmatter at the vault_project path above
2. Run `git log --oneline --since=[last_vault_update from frontmatter]` in this repo
3. If this repo has commits newer than last_vault_update, flag: "Vault is stale. Want me to sync?"

### Session End
Before ending this session:
1. Update the vault CGCS-Website dashboard with any changes made
2. Update `last_vault_update` in dashboard frontmatter to today's date
3. Check off completed tasks, add new ones, note decisions

### Conflict Detection
If vault says one thing and the code shows another, present both and ask to resolve before proceeding.

## Project Context
CGCS public-facing website built with Astro. Maintained by Stefano as part of his CGCS role at ACC.
