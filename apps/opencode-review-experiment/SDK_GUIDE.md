# OpenCode SDK Guide for the Review Experiment

This guide documents the OpenCode JS/TS SDK as used by this experiment with
`@opencode-ai/sdk@0.0.0-beta-202606160953`.

The short version: the SDK is a typed client over the `opencode serve` HTTP
API. The SDK can start an OpenCode server, connect to an existing server, send
messages, subscribe to server-sent events, inspect configuration, list tools,
manage MCP servers, manage sessions, and read resulting messages/diffs. Agent
behavior itself is mainly driven by OpenCode configuration, `.opencode/*`
files, prompt payloads, and permissions.

Sources used for this guide:

- Installed package types:
  `node_modules/.bun/@opencode-ai+sdk@0.0.0-beta-202606160953/node_modules/@opencode-ai/sdk/dist/v2`
- Official SDK docs: <https://opencode.ai/docs/sdk/>
- Local docs submodule:
  `opencode/packages/web/src/content/docs/{sdk,server,config,providers,agents,skills,tools,custom-tools,mcp-servers,permissions}.mdx`
- The local experiment app in `apps/opencode-review-experiment`

## Mental Model

OpenCode is split into a server and clients.

1. `opencode serve` runs a headless HTTP server.
2. The SDK either starts that server for you or connects to an existing one.
3. The SDK sends typed API calls to the server.
4. The server loads config, agents, skills, custom tools, MCP servers, provider
   credentials, project files, and session state.
5. The model loop runs inside the OpenCode server, not inside your Node/Bun
   process.
6. You observe the loop through events and persisted session messages.

This means the SDK is powerful, but it is not a separate high-level "agent
framework". The agent framework is OpenCode itself. The SDK gives you typed
programmatic access to OpenCode.

## Installed Entrypoints

Use the v2 export for this beta:

```ts
import {
  createOpencode,
  createOpencodeClient,
  createOpencodeServer,
  type Config,
  type Event,
  type OpencodeClient,
} from "@opencode-ai/sdk/v2";
```

Exports:

| Export | Purpose |
| --- | --- |
| `createOpencode(options?)` | Start an OpenCode server and return `{ client, server }`. Good for quick scripts. |
| `createOpencodeServer(options?)` | Start only the server. Good when you want lifecycle control. |
| `createOpencodeClient(config?)` | Create a client for an existing server URL. |
| `createOpencodeTui(options?)` | Start the TUI process programmatically. Less relevant for headless review agents. |
| `Config` | Type for OpenCode runtime config. |
| `OpencodeClient` | Typed client class with API groups like `session`, `event`, `config`, `mcp`, `tool`. |
| `Event` | Union of event payload types emitted by `event.subscribe`. |
| `data` | Re-exported generated data/types namespace. |

## Server Lifecycle

### One Call: Start Server and Client

```ts
import { createOpencode, type Config } from "@opencode-ai/sdk/v2";

const config: Config = {
  model: "opencode/grok-code-fast-1",
  default_agent: "code-review",
  share: "disabled",
  agent: {
    "code-review": {
      mode: "primary",
      prompt: "Review code. Report only actionable findings.",
      permission: {
        read: "allow",
        grep: "allow",
        glob: "allow",
        edit: "deny",
        bash: "ask",
      },
    },
  },
};

const opencode = await createOpencode({
  hostname: "127.0.0.1",
  port: 4096,
  timeout: 10_000,
  config,
});

try {
  const health = await opencode.client.global.health({ throwOnError: true });
  console.log(health.data.version);
} finally {
  opencode.server.close();
}
```

### Split Server and Client

This is what the experiment app does because it lets us isolate `HOME`,
`OPENCODE_CONFIG_DIR`, state directories, and working directory before the
server starts.

```ts
import {
  createOpencodeClient,
  createOpencodeServer,
  type Config,
} from "@opencode-ai/sdk/v2";

const directory = "/absolute/path/to/review-target";
const config: Config = {
  model: "opencode/grok-code-fast-1",
  share: "disabled",
};

const previousCwd = process.cwd();
process.chdir(directory);
const server = await createOpencodeServer({
  hostname: "127.0.0.1",
  port: 4096,
  timeout: 10_000,
  config,
});
process.chdir(previousCwd);

const client = createOpencodeClient({
  baseUrl: server.url,
  directory,
});

try {
  console.log(await client.global.health());
} finally {
  server.close();
}
```

### Client Only

Use this when `opencode serve` is already running.

```ts
import { createOpencodeClient } from "@opencode-ai/sdk/v2";

const client = createOpencodeClient({
  baseUrl: "http://127.0.0.1:4096",
  directory: "/absolute/path/to/repo",
});
```

Client options include:

| Option | Meaning |
| --- | --- |
| `baseUrl` | URL of the OpenCode server. Defaults to `http://localhost:4096` in generated client config. |
| `directory` | Default project directory sent with requests by this SDK wrapper. |
| `experimental_workspaceID` | Optional workspace binding for newer workspace APIs. |
| `fetch` | Custom fetch implementation. |
| `parseAs` | Response parsing mode: `auto`, `json`, `text`, `stream`, etc. |
| `responseStyle` | `fields` returns `{ data, error, request, response }`; `data` returns only data. |
| `throwOnError` | Throw on API errors instead of returning `{ error }`. |
| `signal` | Abort signal for requests and event subscriptions. |

## Response Shape and Error Handling

By default SDK calls return a fields object:

```ts
const result = await client.session.get({ sessionID, directory });

if (result.error) {
  console.error(result.response.status, result.error);
} else {
  console.log(result.data);
}
```

With `throwOnError: true`, the call throws on error and otherwise returns data
inside `result.data`.

```ts
try {
  const result = await client.session.get(
    { sessionID, directory },
    { throwOnError: true },
  );
  console.log(result.data);
} catch (error) {
  console.error(error);
}
```

For scripts, `throwOnError: true` is usually easier. For long-running
experiments, returning `{ error }` is useful because you can preserve failures
inside artifacts.

## Simple Message With Event Logging

This is the core loop for a code-review agent:

1. Start or connect to a server.
2. Create a session.
3. Subscribe to events before sending the prompt.
4. Send `session.prompt`.
5. Console log deltas, reasoning, tool calls, and tool results.
6. Fetch durable messages and diff after the prompt finishes.

```ts
import {
  createOpencode,
  type Config,
  type Event,
} from "@opencode-ai/sdk/v2";

const directory = "/absolute/path/to/repo";

const config: Config = {
  model: "opencode/grok-code-fast-1",
  default_agent: "code-review",
  share: "disabled",
  permission: {
    read: "allow",
    grep: "allow",
    glob: "allow",
    list: "allow",
    skill: { "*": "allow" },
    edit: "deny",
    bash: {
      "*": "ask",
      "git diff*": "allow",
      "git status*": "allow",
      "rg *": "allow",
    },
  },
  agent: {
    "code-review": {
      mode: "primary",
      description: "Review code and report concrete findings.",
      prompt: "You are a code review agent. Do not edit files.",
      temperature: 0.1,
      steps: 12,
      tools: {
        read: true,
        grep: true,
        glob: true,
        list: true,
        bash: true,
        edit: false,
        write: false,
        apply_patch: false,
      },
    },
  },
};

const opencode = await createOpencode({ config, timeout: 10_000 });
const client = opencode.client;
const controller = new AbortController();

try {
  const sessionResult = await client.session.create(
    {
      directory,
      title: "SDK review",
      agent: "code-review",
      model: {
        providerID: "opencode",
        id: "grok-code-fast-1",
      },
      metadata: {
        experiment: "simple-message",
      },
    },
    { throwOnError: true },
  );

  const sessionID = sessionResult.data.id;

  const eventTask = (async () => {
    const subscription = await client.event.subscribe(
      { directory },
      { signal: controller.signal },
    );

    for await (const event of subscription.stream) {
      if (eventMatchesSession(event, sessionID)) {
        logUsefulEvent(event);
      }
    }
  })();

  await client.session.prompt(
    {
      sessionID,
      directory,
      agent: "code-review",
      model: {
        providerID: "opencode",
        modelID: "grok-code-fast-1",
      },
      system: "Review for correctness, security, and maintainability.",
      tools: {
        read: true,
        grep: true,
        glob: true,
        bash: true,
        edit: false,
        write: false,
        apply_patch: false,
      },
      parts: [
        {
          type: "text",
          text: "Review the current git diff. Return findings only.",
        },
      ],
    },
    { throwOnError: true },
  );

  controller.abort();
  await eventTask.catch(() => undefined);

  const messages = await client.session.messages(
    { sessionID, directory },
    { throwOnError: true },
  );
  const diff = await client.session.diff(
    { sessionID, directory },
    { throwOnError: true },
  );

  console.log(JSON.stringify({ messages: messages.data, diff: diff.data }, null, 2));
} finally {
  controller.abort();
  opencode.server.close();
}

function eventMatchesSession(event: Event, sessionID: string) {
  const properties = "properties" in event ? event.properties : undefined;
  return (
    typeof properties === "object" &&
    properties !== null &&
    "sessionID" in properties &&
    properties.sessionID === sessionID
  );
}

function logUsefulEvent(event: Event) {
  switch (event.type) {
    case "session.next.text.delta":
      process.stdout.write(event.properties.delta);
      break;

    case "session.next.reasoning.delta":
      console.log("[reasoning]", event.properties.delta);
      break;

    case "session.next.tool.input.started":
      console.log("[tool-input-start]", event.properties.name, event.properties.callID);
      break;

    case "session.next.tool.input.delta":
      console.log("[tool-input-delta]", event.properties.callID, event.properties.delta);
      break;

    case "session.next.tool.called":
      console.log("[tool-called]", event.properties.tool, event.properties.input);
      break;

    case "session.next.tool.progress":
      console.log("[tool-progress]", event.properties.callID, event.properties.content);
      break;

    case "session.next.tool.success":
      console.log("[tool-success]", event.properties.callID, event.properties.content);
      break;

    case "session.next.tool.failed":
      console.log("[tool-failed]", event.properties.callID, event.properties.error);
      break;

    case "session.next.step.ended":
      console.log("[step-ended]", event.properties.finish, event.properties.tokens);
      break;

    case "session.error":
      console.log("[session-error]", event.properties);
      break;

    default:
      console.log("[event]", event.type, event);
  }
}
```

## Raw Event Logger

When learning the SDK, start with raw events before designing abstractions:

```ts
const subscription = await client.event.subscribe({ directory });

for await (const event of subscription.stream) {
  console.log(JSON.stringify(event, null, 2));
}
```

Important event families:

| Family | Examples | Use |
| --- | --- | --- |
| Message lifecycle | `message.updated`, `message.part.updated`, `message.part.removed` | Track durable message projections. |
| Agent loop | `session.next.step.started`, `session.next.step.ended`, `session.next.step.failed` | Track each model/tool iteration. |
| Text output | `session.next.text.started`, `session.next.text.delta`, `session.next.text.ended` | Stream assistant text. |
| Reasoning | `session.next.reasoning.started`, `session.next.reasoning.delta`, `session.next.reasoning.ended` | Stream model reasoning where provider/model exposes it. |
| Tool input | `session.next.tool.input.started`, `session.next.tool.input.delta`, `session.next.tool.input.ended` | Observe the model forming tool arguments. |
| Tool execution | `session.next.tool.called`, `session.next.tool.progress`, `session.next.tool.success`, `session.next.tool.failed` | Observe tool calls and results. |
| Diff/status | `session.diff`, `file.edited`, `vcs.branch.updated` | Observe edits and VCS state. |
| Permission | `permission.updated`, `permission.asked`, `permission.replied`, `permission.v2.asked`, `permission.v2.replied` | Approve or reject tool requests. |
| Questions | `question.asked`, `question.replied`, `question.rejected`, `question.v2.asked` | Handle model questions to the user. |
| MCP | `mcp.tools.changed`, `mcp.browser.open.failed` | Track MCP tool availability and auth issues. |
| Compaction | `session.next.compaction.started`, `session.next.compaction.delta`, `session.next.compaction.ended` | Observe context compaction. |

## Sending User Messages

The direct `session.prompt` API accepts `parts`.

```ts
await client.session.prompt({
  sessionID,
  directory,
  parts: [{ type: "text", text: "Review src/cache.ts" }],
});
```

Supported part inputs in this beta:

```ts
type TextPartInput = {
  type: "text";
  text: string;
  synthetic?: boolean;
  ignored?: boolean;
  metadata?: Record<string, unknown>;
};

type FilePartInput = {
  type: "file";
  mime: string;
  filename?: string;
  url: string;
  source?: FilePartSource;
};

type AgentPartInput = {
  type: "agent";
  name: string;
};

type SubtaskPartInput = {
  type: "subtask";
  prompt: string;
  description: string;
  agent: string;
  model?: { providerID: string; modelID: string };
  command?: string;
};
```

For most SDK experiments, use plain text parts first. File, agent, and subtask
parts are useful once you are already comfortable with session/message behavior.

## System Prompts

There are three practical ways to influence system behavior.

### Agent Prompt in Config

Use this for the default behavior of a named agent:

```ts
const config: Config = {
  default_agent: "code-review",
  agent: {
    "code-review": {
      mode: "primary",
      prompt: "You are a strict code review agent. Do not edit files.",
      temperature: 0.1,
      steps: 16,
    },
  },
};
```

### Markdown Agent File

Use this when you want project-local agents in `.opencode/agents`.

```md
---
description: Reviews code changes and reports concrete findings.
mode: primary
temperature: 0.1
steps: 16
permission:
  edit: deny
  bash:
    "*": ask
    "git diff*": allow
---

You are a review-focused agent. Inspect code before making claims.
```

The file name becomes the agent name. For example,
`.opencode/agents/code-review.md` creates `code-review`.

### Per Message System Override

Use this when the same agent should behave differently for one prompt.

```ts
await client.session.prompt({
  sessionID,
  directory,
  agent: "code-review",
  system: "Only review security issues. Ignore style.",
  parts: [{ type: "text", text: "Review the current diff." }],
});
```

The experiment app loads `prompts/system.md` and passes that content both into
the inline agent config and into `session.prompt({ system })`. That is redundant
on purpose for experimentation: it makes the active prompt easy to see in both
resolved config and prompt payloads.

## Structured Output

`session.prompt` accepts `format`. Use this when you want review findings as
validated JSON.

```ts
const result = await client.session.prompt(
  {
    sessionID,
    directory,
    agent: "code-review",
    format: {
      type: "json_schema",
      retryCount: 2,
      schema: {
        type: "object",
        properties: {
          findings: {
            type: "array",
            items: {
              type: "object",
              properties: {
                severity: { type: "string" },
                file: { type: "string" },
                line: { type: "number" },
                summary: { type: "string" },
                recommendation: { type: "string" },
              },
              required: ["severity", "file", "summary", "recommendation"],
            },
          },
        },
        required: ["findings"],
      },
    },
    parts: [{ type: "text", text: "Review the current diff." }],
  },
  { throwOnError: true },
);

console.log(result.data);
```

The assistant message can include `structured` output. If validation fails, the
assistant message error can be `StructuredOutputError`.

## Provider Configuration

Provider behavior is a mix of config, credentials, and model selection.

### Inspect Providers

```ts
const providerList = await client.provider.list({ directory });
const configured = await client.config.providers({ directory });
const models = await client.v2.model.list({
  location: { directory },
});

console.log(providerList.data);
console.log(configured.data);
console.log(models.data);
```

Useful APIs:

| API | Purpose |
| --- | --- |
| `client.provider.list()` | List available and connected providers. |
| `client.provider.auth()` | List provider auth methods. |
| `client.config.providers()` | List configured providers and default models. |
| `client.v2.provider.list()` | Newer active-provider list. |
| `client.v2.provider.get({ providerID })` | Inspect one provider. |
| `client.v2.model.list()` | List available models ordered by release date. |

### Select a Model Per Session

`session.create` uses `{ id, providerID }`.

```ts
const session = await client.session.create({
  directory,
  model: {
    providerID: "anthropic",
    id: "claude-sonnet-4-5",
  },
});
```

`session.prompt` uses `{ modelID, providerID }`.

```ts
await client.session.prompt({
  sessionID,
  directory,
  model: {
    providerID: "anthropic",
    modelID: "claude-sonnet-4-5",
  },
  parts: [{ type: "text", text: "Review this diff." }],
});
```

This naming mismatch is real in this beta.

### Configure a Provider

For known providers, you often only need options:

```ts
const config: Config = {
  model: "anthropic/claude-sonnet-4-5",
  provider: {
    anthropic: {
      options: {
        baseURL: "https://api.anthropic.com/v1",
      },
    },
  },
};
```

For custom/OpenAI-compatible providers, define the provider and model metadata:

```ts
const config: Config = {
  model: "local-openai/qwen2.5-coder",
  provider: {
    "local-openai": {
      name: "Local OpenAI-compatible server",
      npm: "@ai-sdk/openai-compatible",
      options: {
        baseURL: "http://127.0.0.1:11434/v1",
        apiKey: "not-needed",
      },
      models: {
        "qwen2.5-coder": {
          name: "Qwen 2.5 Coder",
          tool_call: true,
          reasoning: false,
          temperature: true,
          limit: {
            context: 131_072,
            output: 8_192,
          },
          cost: {
            input: 0,
            output: 0,
          },
        },
      },
    },
  },
};
```

### Set Credentials Programmatically

The SDK can store API credentials through `auth.set`.

```ts
await client.auth.set({
  providerID: "anthropic",
  auth: {
    type: "api",
    key: process.env.ANTHROPIC_API_KEY ?? "",
  },
});
```

Remove them:

```ts
await client.auth.remove({ providerID: "anthropic" });
```

For experiments, prefer isolated `HOME`, `XDG_DATA_HOME`, and
`OPENCODE_CONFIG_DIR` so credentials and provider state do not mix with your
real OpenCode setup.

## Agent Configuration

Agents can be primary agents or subagents.

| Agent type | Use |
| --- | --- |
| `primary` | Main assistant selected for the session/prompt. |
| `subagent` | Specialized helper a primary agent can call. |
| `all` | Available in both modes. |

Inline config:

```ts
const config: Config = {
  default_agent: "code-review",
  agent: {
    "code-review": {
      description: "Reviews a change and returns actionable findings.",
      mode: "primary",
      model: "anthropic/claude-sonnet-4-5",
      prompt: "You are a code reviewer. Do not edit files.",
      temperature: 0.1,
      top_p: 0.9,
      steps: 16,
      tools: {
        read: true,
        grep: true,
        glob: true,
        bash: true,
        edit: false,
      },
      permission: {
        read: "allow",
        grep: "allow",
        glob: "allow",
        edit: "deny",
        bash: {
          "*": "ask",
          "git diff*": "allow",
          "git status*": "allow",
        },
      },
    },
    "review-researcher": {
      description: "Read-only code search helper.",
      mode: "subagent",
      prompt: "Gather repository context. Do not edit files.",
      permission: {
        read: "allow",
        grep: "allow",
        glob: "allow",
        edit: "deny",
        bash: "deny",
      },
    },
  },
};
```

Markdown file config:

```md
---
description: Read-only code review agent.
mode: primary
model: anthropic/claude-sonnet-4-5
temperature: 0.1
steps: 16
tools:
  read: true
  grep: true
  glob: true
  edit: false
permission:
  edit: deny
  bash:
    "*": ask
    "git diff*": allow
---

Review code for correctness, reliability, security, and maintainability.
```

List agents:

```ts
const agents = await client.app.agents({ directory });
const agentsV2 = await client.v2.agent.list({
  location: { directory },
});
```

Use an agent:

```ts
await client.session.prompt({
  sessionID,
  directory,
  agent: "code-review",
  parts: [{ type: "text", text: "Review the current diff." }],
});
```

## Skill Configuration

Skills are reusable instructions loaded on demand by the `skill` tool.

Project-local skill layout:

```txt
.opencode/skills/review-findings/SKILL.md
```

Example:

```md
---
name: review-findings
description: Shape code review output as concrete findings.
license: MIT
compatibility: opencode
metadata:
  domain: code-review
---

## Finding Shape

- Severity
- Location
- Evidence
- Impact
- Recommendation
```

Config:

```ts
const config: Config = {
  skills: {
    paths: ["/absolute/path/to/.opencode/skills"],
  },
  permission: {
    skill: {
      "*": "allow",
      "internal-*": "deny",
      "experimental-*": "ask",
    },
  },
  agent: {
    "code-review": {
      tools: {
        skill: true,
      },
      permission: {
        skill: {
          "review-findings": "allow",
        },
      },
    },
  },
};
```

List skills:

```ts
const skills = await client.app.skills({ directory });
const skillsV2 = await client.v2.skill.list({
  location: { directory },
});
```

The SDK does not directly call `skill({ name })` as an application API. The LLM
calls the `skill` tool during a session if it decides the skill is relevant and
permissions allow it.

## Tool Configuration

There are two overlapping concepts:

1. `permission`: allow, ask, or deny tool execution.
2. `tools`: boolean enable/disable list for what the model sees.

The current docs say permissions are the preferred control surface, but the
`tools` boolean map is still supported and useful for experiments.

```ts
const config: Config = {
  permission: {
    read: "allow",
    grep: "allow",
    glob: "allow",
    edit: "deny",
    bash: {
      "*": "ask",
      "git status*": "allow",
      "git diff*": "allow",
      "rm *": "deny",
    },
    webfetch: "ask",
    websearch: "ask",
    skill: { "*": "allow" },
    "github_*": "ask",
  },
  tools: {
    read: true,
    grep: true,
    glob: true,
    bash: true,
    edit: false,
    write: false,
    apply_patch: false,
    skill: true,
  },
};
```

Per prompt:

```ts
await client.session.prompt({
  sessionID,
  directory,
  tools: {
    read: true,
    grep: true,
    bash: false,
    edit: false,
  },
  parts: [{ type: "text", text: "Review without shell commands." }],
});
```

List tools:

```ts
const ids = await client.tool.ids({ directory });

const schemas = await client.tool.list({
  directory,
  provider: "anthropic",
  model: "claude-sonnet-4-5",
});
```

Built-in tool IDs seen in this beta include:

- `bash`
- `read`
- `glob`
- `grep`
- `edit`
- `write`
- `task`
- `webfetch`
- `todowrite`
- `websearch`
- `skill`
- `apply_patch`
- `plan_exit`
- custom tools from `.opencode/tools`
- MCP tools, usually prefixed by server name

## Custom Tools

Custom tools live under `.opencode/tools` or `~/.config/opencode/tools`.

The filename becomes the tool name. This file creates a `review_context` tool:

```ts
// .opencode/tools/review_context.ts
export default {
  description: "Return context about the current OpenCode review session.",
  args: {},
  async execute(_args: Record<string, never>, context: Record<string, unknown>) {
    return JSON.stringify(
      {
        agent: context.agent,
        sessionID: context.sessionID,
        messageID: context.messageID,
        directory: context.directory,
        worktree: context.worktree,
      },
      null,
      2,
    );
  },
};
```

Enable it:

```ts
const config: Config = {
  permission: {
    review_context: "allow",
  },
  tools: {
    review_context: true,
  },
};
```

Use it indirectly by prompting:

```ts
await client.session.prompt({
  sessionID,
  directory,
  tools: { review_context: true, read: true },
  parts: [{ type: "text", text: "Call review_context, then review this repo." }],
});
```

If you export multiple named tools from one file, OpenCode names them
`<filename>_<exportname>`.

## MCP Configuration

MCP servers add external tools to OpenCode.

Static config:

```ts
const config: Config = {
  mcp: {
    mcp_everything: {
      type: "local",
      command: ["bun", "x", "@modelcontextprotocol/server-everything"],
      enabled: true,
      timeout: 5_000,
    },
    github: {
      type: "remote",
      url: "https://api.githubcopilot.com/mcp/",
      headers: {
        Authorization: "Bearer ${GITHUB_TOKEN}",
      },
      enabled: false,
      oauth: false,
    },
  },
  permission: {
    "mcp_everything_*": "ask",
    "github_*": "ask",
  },
};
```

Dynamic SDK APIs:

```ts
await client.mcp.add({
  directory,
  name: "mcp_everything",
  config: {
    type: "local",
    command: ["bun", "x", "@modelcontextprotocol/server-everything"],
    enabled: true,
  },
});

await client.mcp.connect({ directory, name: "mcp_everything" });

const status = await client.mcp.status({ directory });
console.log(status.data);

await client.mcp.disconnect({ directory, name: "mcp_everything" });
```

MCP auth APIs:

```ts
await client.mcp.auth.start({ directory, name: "my-oauth-mcp" });
await client.mcp.auth.callback({
  directory,
  name: "my-oauth-mcp",
  code: "callback-code",
});
await client.mcp.auth.authenticate({ directory, name: "my-oauth-mcp" });
await client.mcp.auth.remove({ directory, name: "my-oauth-mcp" });
```

MCP practical notes:

- MCP tools can add a lot of context.
- Keep only the servers you need enabled.
- Use `permission` wildcards such as `"server_*": "ask"`.
- Use `client.mcp.status()` before a review run and record the result.

## Permissions, Questions, and Human Approval

Permissions can be global, per agent, or per session.

Session-level permission rules:

```ts
const session = await client.session.create({
  directory,
  permission: [
    { permission: "edit", pattern: "*", action: "deny" },
    { permission: "bash", pattern: "*", action: "ask" },
    { permission: "bash", pattern: "git diff*", action: "allow" },
  ],
});
```

List and answer permission requests:

```ts
const pending = await client.permission.list({ directory });

for (const request of pending.data ?? []) {
  console.log(request);
}

await client.permission.reply({
  directory,
  requestID: "request-id",
  reply: "once", // "once" | "always" | "reject"
  message: "Allowed for this review run.",
});
```

List and answer model questions:

```ts
const questions = await client.question.list({ directory });

await client.question.reply({
  directory,
  requestID: "request-id",
  answers: [
    {
      prompt: "Which branch should I compare against?",
      answer: "main",
    },
  ],
});

await client.question.reject({
  directory,
  requestID: "request-id",
});
```

Newer v2 session-scoped variants exist:

```ts
await client.v2.session.permission.list({ sessionID });
await client.v2.session.permission.reply({
  sessionID,
  requestID: "request-id",
  reply: "once",
});

await client.v2.session.question.list({ sessionID });
```

## Config Loading and Isolation

OpenCode merges config layers. Later layers override earlier layers for
conflicting keys, but non-conflicting keys are preserved.

Important sources:

1. Remote organizational config.
2. Global config in `~/.config/opencode/opencode.json`.
3. `OPENCODE_CONFIG`.
4. Project `opencode.json`.
5. `.opencode` directories.
6. Inline config through `OPENCODE_CONFIG_CONTENT`, which the SDK server helper
   uses for `createOpencodeServer({ config })`.
7. Managed/admin config.

For deterministic SDK experiments, isolate environment before starting the
server:

```ts
process.env.HOME = "/tmp/opencode-experiment/home";
process.env.OPENCODE_CONFIG_DIR = "/tmp/opencode-experiment/config";
process.env.XDG_CONFIG_HOME = "/tmp/opencode-experiment/xdg-config";
process.env.XDG_DATA_HOME = "/tmp/opencode-experiment/xdg-data";
process.env.XDG_CACHE_HOME = "/tmp/opencode-experiment/xdg-cache";
delete process.env.OPENCODE_CONFIG;
```

The experiment app does this in `src/opencode.ts` so `inspect` does not
accidentally load your normal agents, skills, credentials, and providers.

## Practical Code Review Agent Flow

```ts
const systemPrompt = await readFile("prompts/system.md", "utf8");
const userPrompt = await readFile("prompts/user.md", "utf8");

const config: Config = {
  default_agent: "code-review",
  model: "anthropic/claude-sonnet-4-5",
  share: "disabled",
  snapshot: false,
  skills: {
    paths: ["/repo/.opencode/skills"],
  },
  permission: {
    read: "allow",
    grep: "allow",
    glob: "allow",
    list: "allow",
    skill: { "*": "allow" },
    edit: "deny",
    bash: {
      "*": "ask",
      "git diff*": "allow",
      "git status*": "allow",
      "rg *": "allow",
    },
  },
  tools: {
    read: true,
    grep: true,
    glob: true,
    list: true,
    skill: true,
    bash: true,
    edit: false,
    write: false,
    apply_patch: false,
    review_context: true,
  },
  agent: {
    "code-review": {
      mode: "primary",
      prompt: systemPrompt,
      temperature: 0.1,
      steps: 16,
    },
  },
};

const opencode = await createOpencode({ config });

const session = await opencode.client.session.create(
  {
    directory: "/repo",
    title: "Review current diff",
    agent: "code-review",
    model: {
      providerID: "anthropic",
      id: "claude-sonnet-4-5",
    },
  },
  { throwOnError: true },
);

await opencode.client.session.prompt(
  {
    sessionID: session.data.id,
    directory: "/repo",
    agent: "code-review",
    system: systemPrompt,
    tools: config.tools,
    parts: [{ type: "text", text: userPrompt }],
  },
  { throwOnError: true },
);

const messages = await opencode.client.session.messages({
  sessionID: session.data.id,
  directory: "/repo",
});

const diff = await opencode.client.session.diff({
  sessionID: session.data.id,
  directory: "/repo",
});

console.log({ messages: messages.data, diff: diff.data });
```

## API Reference by Client Group

This section lists the method surface exposed by the installed beta. Most
methods accept optional `directory` and `workspace` parameters unless they use
newer v2 `location` objects.

### Root Lifecycle

| API | Purpose |
| --- | --- |
| `createOpencode(options?)` | Start server and return client plus closeable server. |
| `createOpencodeServer(options?)` | Start `opencode serve` with optional inline config. |
| `createOpencodeClient(config?)` | Connect to a server. |
| `createOpencodeTui(options?)` | Start the TUI process. |

### `client.global`

| Method | Purpose |
| --- | --- |
| `global.health()` | Server health and OpenCode version. |
| `global.event()` | Subscribe to global events. |
| `global.dispose()` | Dispose all OpenCode instances. |
| `global.upgrade({ target? })` | Upgrade OpenCode. Not something to run inside a pinned beta experiment. |
| `global.config.get()` | Get global config. |
| `global.config.update({ config })` | Update global config. |

### `client.config`

| Method | Purpose |
| --- | --- |
| `config.get({ directory })` | Get resolved config for a project/location. |
| `config.update({ directory, config })` | Update config. |
| `config.providers({ directory })` | List configured providers and default models. |

### `client.session`

| Method | Purpose |
| --- | --- |
| `session.list()` | List sessions. |
| `session.create()` | Create a session. |
| `session.status()` | Get status for all sessions. |
| `session.get({ sessionID })` | Get one session. |
| `session.update({ sessionID, ... })` | Update title, metadata, permission, archive time. |
| `session.delete({ sessionID })` | Delete session data. |
| `session.children({ sessionID })` | List forked child sessions. |
| `session.todo({ sessionID })` | Get todos. |
| `session.diff({ sessionID, messageID? })` | Get file changes for the session or a message. |
| `session.messages({ sessionID, limit?, before? })` | Get durable messages and parts. |
| `session.message({ sessionID, messageID })` | Get one message. |
| `session.prompt({ sessionID, parts, ... })` | Send message and wait for response. |
| `session.promptAsync({ sessionID, parts, ... })` | Send message asynchronously. |
| `session.command({ sessionID, command, arguments? })` | Execute slash command. |
| `session.shell({ sessionID, command })` | Run shell command in session context. |
| `session.fork({ sessionID, messageID? })` | Fork a session. |
| `session.abort({ sessionID })` | Abort an active session. |
| `session.init({ sessionID, ... })` | Analyze app and create `AGENTS.md`. |
| `session.share({ sessionID })` | Create share link. |
| `session.unshare({ sessionID })` | Remove share link. |
| `session.summarize({ sessionID, providerID?, modelID? })` | Summarize/compact session. |
| `session.revert({ sessionID, messageID, partID? })` | Revert a message's effects. |
| `session.unrevert({ sessionID })` | Restore reverted messages. |
| `session.deleteMessage({ sessionID, messageID })` | Delete message without reverting file changes. |

### `client.event`

| Method | Purpose |
| --- | --- |
| `event.subscribe({ directory })` | Subscribe to native server events for a project. |

### `client.app`

| Method | Purpose |
| --- | --- |
| `app.log({ service, level, message, extra })` | Write server log entry. |
| `app.agents({ directory })` | List available agents. |
| `app.skills({ directory })` | List available skills. |

### `client.provider` and `client.auth`

| Method | Purpose |
| --- | --- |
| `provider.list()` | List all available providers plus connected ones. |
| `provider.auth()` | List auth methods. |
| `provider.oauth.authorize({ providerID, ... })` | Start provider OAuth. |
| `provider.oauth.callback({ providerID, code, ... })` | Complete provider OAuth. |
| `auth.set({ providerID, auth })` | Store API/OAuth/well-known auth. |
| `auth.remove({ providerID })` | Remove provider credentials. |

### `client.tool`

| Method | Purpose |
| --- | --- |
| `tool.ids({ directory })` | List all tool IDs, including custom and MCP. |
| `tool.list({ provider, model })` | List tool schemas for a provider/model combination. |

### `client.mcp`

| Method | Purpose |
| --- | --- |
| `mcp.status()` | Get status for all MCP servers. |
| `mcp.add({ name, config })` | Dynamically add an MCP server. |
| `mcp.connect({ name })` | Connect an MCP server. |
| `mcp.disconnect({ name })` | Disconnect an MCP server. |
| `mcp.auth.start({ name })` | Start MCP OAuth. |
| `mcp.auth.callback({ name, code })` | Complete MCP OAuth. |
| `mcp.auth.authenticate({ name })` | Start OAuth and wait for callback. |
| `mcp.auth.remove({ name })` | Remove MCP OAuth credentials. |

### Files, Search, VCS, and Project

| Group | Methods | Purpose |
| --- | --- | --- |
| `find` | `text`, `files`, `symbols` | Search text, file names, and LSP symbols. |
| `file` | `list`, `read`, `status` | List/read files and git status. |
| `vcs` | `get`, `status`, `diff`, `apply`, `diff2.raw` | Git info, status, diffs, apply patch, raw diff. |
| `path` | `get` | Working directory/path info. |
| `project` | `list`, `current`, `initGit`, `update`, `directories` | Project registry and metadata. |
| `worktree` | `list`, `create`, `reset`, `remove` | Managed git worktrees. |
| `lsp` | `status` | LSP server status. |
| `formatter` | `status` | Formatter status. |
| `command` | `list` | Slash command list. |

### Permissions and Questions

| Group | Methods | Purpose |
| --- | --- | --- |
| `permission` | `list`, `reply`, `respond` | List and answer pending permission requests. `respond` is deprecated. |
| `question` | `list`, `reply`, `reject` | List, answer, or reject model questions. |

### PTY and TUI

| Group | Methods | Purpose |
| --- | --- | --- |
| `pty` | `shells`, `list`, `create`, `remove`, `get`, `update`, `connectToken`, `connect` | Manage pseudo-terminal sessions. |
| `tui` | `appendPrompt`, `openHelp`, `openSessions`, `openThemes`, `openModels`, `submitPrompt`, `clearPrompt`, `executeCommand`, `showToast`, `publish`, `selectSession` | Drive a running TUI. |
| `tui.control` | `next`, `response` | Process queued TUI requests. |

### Sync and Parts

| Group | Methods | Purpose |
| --- | --- | --- |
| `part` | `delete`, `update` | Mutate message parts. |
| `sync` | `start`, `replay`, `steal` | Workspace sync operations. |
| `sync.history` | `list` | List sync events. |

### Experimental APIs

| Group | Methods | Purpose |
| --- | --- | --- |
| `experimental.controlPlane` | `moveSession` | Move session to another project directory. |
| `experimental.console` | `get`, `listOrgs`, `switchOrg` | Console org/provider metadata. |
| `experimental.session` | `list`, `background` | Extra session operations. |
| `experimental.resource` | `list` | MCP resources. |
| `experimental.projectCopy` | `generateName` | Generate project copy name. |
| `experimental.workspace` | `list`, `create`, `syncList`, `status`, `remove`, `warp` | Workspace management. |
| `experimental.workspace.adapter` | `list` | Workspace adapters. |

### Newer `client.v2` APIs

The installed beta also exposes a newer `client.v2` namespace. It uses
`location: { directory, workspace }` more consistently and has session-scoped
permission/question endpoints.

| Group | Methods |
| --- | --- |
| `v2.health` | `get` |
| `v2.location` | `get` |
| `v2.agent` | `list` |
| `v2.session` | `list`, `create`, `get`, `prompt`, `compact`, `wait`, `context`, `messages` |
| `v2.session.permission` | `list`, `reply` |
| `v2.session.question` | `list`, `reply`, `reject` |
| `v2.model` | `list` |
| `v2.provider` | `list`, `get` |
| `v2.integration` | `list`, `get` |
| `v2.integration.connect` | `key`, `oauth` |
| `v2.integration.attempt` | `cancel`, `status`, `complete` |
| `v2.credential` | `remove`, `update` |
| `v2.permission.request` | `list` |
| `v2.permission.saved` | `list`, `remove` |
| `v2.fs` | `read`, `list`, `find` |
| `v2.command` | `list` |
| `v2.skill` | `list` |
| `v2.event` | `subscribe` |
| `v2.pty` | `list`, `create`, `remove`, `get`, `update`, `connectToken`, `connect` |
| `v2.question.request` | `list` |
| `v2.reference` | `list` |
| `v2.projectCopy` | `remove`, `create`, `refresh` |

For this experiment, the direct APIs (`client.session`, `client.event`,
`client.config`, `client.tool`, `client.mcp`) are enough and match the local app.
Use `client.v2` when you want newer location/session primitives like
`v2.session.wait` or session-scoped permissions.

## What the Current Experiment App Demonstrates

Run:

```bash
bun run --cwd apps/opencode-review-experiment inspect
```

This exercises:

- `createOpencodeServer`
- `createOpencodeClient`
- `global.health`
- `config.get`
- `config.providers`
- `provider.list`
- `app.agents`
- `app.skills`
- `tool.ids`
- `mcp.status`
- `file.status`

Run:

```bash
bun run --cwd apps/opencode-review-experiment review
```

This exercises:

- `session.create`
- `event.subscribe`
- `session.prompt`
- `session.messages`
- `session.diff`
- event artifact capture

Use no model response for a dry run:

```bash
OPENCODE_NO_REPLY=1 bun run --cwd apps/opencode-review-experiment review
```

Replay an artifact:

```bash
bun run --cwd apps/opencode-review-experiment src/index.ts replay runs/<file>.json
```

## Practical Recommendations

- Keep the SDK layer thin while experimenting. Let OpenCode config, agents,
  skills, tools, and MCP do the interesting work.
- Start every investigation with `inspect`; it tells you what OpenCode actually
  loaded.
- Subscribe to events before calling `session.prompt`.
- Save raw events and messages to artifacts. Event types change faster than
  high-level concepts in a beta.
- Isolate `HOME`, XDG dirs, and `OPENCODE_CONFIG_DIR` when you want repeatable
  behavior.
- Use `permission` as the primary safety layer and `tools` as a visibility layer.
- Deny edits for review-only agents unless you are explicitly testing autofix.
- Keep MCP small. MCP tool descriptions consume context.
- Prefer config files and prompt files over lots of CLI flags for this
  experiment, because you are learning the actual SDK and OpenCode surfaces.
