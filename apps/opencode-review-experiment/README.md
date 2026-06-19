# OpenCode Review Experiment

This app is a contained OpenCode SDK experiment. It starts or connects to an OpenCode server, configures a review-focused agent, runs prompts against a Review Target, captures server events, and writes an artifact with messages, tool activity, MCP status, provider/config metadata, and any generated diff.

The requested SDK version is pinned:

```json
"@opencode-ai/sdk": "0.0.0-beta-202606160953"
```

## Run It

```bash
bun run --cwd apps/opencode-review-experiment inspect
bun run --cwd apps/opencode-review-experiment review
bun run --cwd apps/opencode-review-experiment src/index.ts replay runs/<file>.json
```

`inspect` can run without sending an LLM prompt. `review` creates an OpenCode session and sends a prompt, so it requires a configured provider/model unless you use `OPENCODE_NO_REPLY=1`.

## Edit Points

- `src/settings.ts`: target directory, model, server URL, and toggles.
- `prompts/system.md`: the system prompt.
- `prompts/user.md`: the review prompt template.
- `.opencode/agents/code-review.md`: project agent fixture.
- `.opencode/skills/review-findings/SKILL.md`: skill fixture.
- `.opencode/tools/review_context.ts`: custom tool fixture.
- `examples/opencode.config.jsonc`: provider, tools, permissions, and MCP examples.

The experiment isolates OpenCode config/data/cache and `HOME` under `.runtime` by default so `inspect` does not mix in your normal `~/.config/opencode`, `~/.agents`, providers, credentials, agents, or skills. To attach to an already-running server that uses your normal OpenCode setup, use `OPENCODE_BASE_URL`.

Useful env vars:

```bash
OPENCODE_MODEL=anthropic/claude-sonnet-4-5 bun run --cwd apps/opencode-review-experiment review
OPENCODE_NO_REPLY=1 bun run --cwd apps/opencode-review-experiment review
OPENCODE_EXPERIMENT_TARGET=/path/to/repo bun run --cwd apps/opencode-review-experiment inspect
OPENCODE_EXAMPLE_MCP=1 bun run --cwd apps/opencode-review-experiment inspect
OPENCODE_EXPERIMENT_CONFIG=examples/opencode.config.jsonc bun run --cwd apps/opencode-review-experiment inspect
```

## What It Exercises

- SDK server lifecycle: `createOpencodeServer`.
- SDK client lifecycle: `createOpencodeClient`.
- Config injection: inline `Config` passed through `OPENCODE_CONFIG_CONTENT`.
- Prompt control: `session.prompt({ system, parts, tools, agent, model })`.
- Skills: `.opencode/skills/review-findings/SKILL.md`.
- Custom tools: `.opencode/tools/review_context.ts`.
- MCP: config and dynamic status through `mcp.status`; optional local example server.
- Observability: `event.subscribe`, `session.messages`, `session.diff`, `tool.ids`, provider/config endpoints.

## Notes From the API Surface

The SDK is a typed client over the OpenCode server API. Agent behavior is mostly configured through OpenCode config, project/global `.opencode` files, and prompt payloads rather than through a separate high-level "agent SDK" abstraction.

The live documentation used for this experiment is the OpenCode SDK docs at <https://opencode.ai/docs/sdk/>. The local submodule docs are under `opencode/packages/web/src/content/docs/`.
