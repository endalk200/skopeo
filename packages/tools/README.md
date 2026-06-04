# @skopeo/tools

Repository-scoped AI SDK tools for Skopeo's Code Review Agent.

This package intentionally exposes a small API. Implementation helpers such as path resolution, line-range normalization, shell policy checks, truncation, and raw `readPath` / `runBash` functions are package internals.

## Exports

### `ReadTool`

Effect service tag for reading repository files and listing repository directories.

Use `ReadTool.Live` when constructing the tool runtime layer.

### `BashTool`

Effect service tag for running repository-scoped shell commands.

Use `BashTool.Live` when constructing the tool runtime layer.

### `makeReadTool(runEffect)`

Creates an AI SDK `read` tool backed by the `ReadTool` service.

The tool reads files with optional line ranges, or lists the immediate children of a directory. Paths are resolved inside the repository root from the repository tool context.

### `makeBashTool(runEffect)`

Creates an AI SDK `bash` tool backed by the `BashTool` service.

The tool runs a shell command in the repository root or in a repository-contained working directory. The requested timeout is clamped by package policy, and returned stdout/stderr are truncated.

### `RepositoryToolContextType`

Type for the repository context required by both tools.

```ts
type RepositoryToolContextType = {
  readonly repositoryRoot: string;
};
```

## Usage

```ts
import {
  BashTool,
  makeBashTool,
  makeReadTool,
  ReadTool,
  type RepositoryToolContextType,
} from "@skopeo/tools";
import { Effect, Layer, ManagedRuntime } from "effect";

const ToolRuntimeLayer = Layer.mergeAll(ReadTool.Live, BashTool.Live);

export const makeReviewTools = () =>
  Effect.sync(() => {
    const runtime = ManagedRuntime.make(ToolRuntimeLayer);
    const runEffect = <A, E>(effect: Effect.Effect<A, E, ReadTool | BashTool>) =>
      runtime.runPromise(effect);

    return {
      tools: {
        read: makeReadTool(runEffect),
        bash: makeBashTool(runEffect),
      },
      close: runtime.disposeEffect,
    };
  });

const toolContext: RepositoryToolContextType = {
  repositoryRoot: "/path/to/repository",
};
```

The tool factories do not capture `toolContext`. The model execution layer must pass it into tool execution options so both tools can resolve paths relative to the selected repository.

With the current implementation, `makeReadTool` and `makeBashTool` read repository context from `experimental_context`:

```ts
const result = await read.execute?.(
  { path: "src/index.ts" },
  {
    experimental_context: toolContext,
  } as never,
);
```

When the agent integration moves to AI SDK `toolsContext` / tool `context`, update the factories and this README together so the documented context path remains accurate.
