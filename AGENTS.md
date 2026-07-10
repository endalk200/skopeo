## References

When modifying, debugging, or explaining code that uses `effect` or `@effect/platform-node`, always use the `source-context` skill first to inspect version-matched dependency source. This is specially true for effect v4 APIs.

## NOTES

- DON'T use the question tool when you want to ask question.

## Workflow

Whenever you make changes to the codebase run:

- `bun run format`
- `bun run check-types`
- `bun run lint`
- `bun run test`

## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues; PRs are not a triage request surface. See `docs/agents/issue-tracker.md`.

### Triage and Wayfinder labels

Canonical triage and Wayfinder roles map directly to same-named GitHub labels. See `docs/agents/triage-labels.md`.

### Domain docs

This is a multi-context repository; use the root context map to find relevant domain docs and ADRs. See `docs/agents/domain.md`.
