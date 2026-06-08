## References

Check [./CONTEXT.md](./CONTEXT.md) for terminology questions.

When modifying, debugging, or explaining code that uses `effect` or `@effect/platform-node`, always use the `source-context` skill first to inspect version-matched dependency source. This is specially true for effect v4 APIs.

## Workflow

Whenever you make changes to the codebase run:

- `bun run format`
- `bun run check-types`
- `bun run lint`
- `bun run test`
