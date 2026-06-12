import {
	type AgentToolRuntimeDependencies,
	type BashAgentTool,
	makeAgentToolsLayer,
	makeBashToolDefinition,
	makeReadFileToolDefinition,
	type ReadFileAgentTool,
} from "@skopeo/tools";
import { type ChatMiddleware, chat, maxIterations } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { Console, Context, Effect, Layer } from "effect";

/**
 * Review Target selected for a Code Review Agent run.
 *
 * `working` reviews the current working tree, while `branch` reviews committed
 * branch changes against a base ref.
 */
type CodeReviewTarget = "working" | "branch";

/**
 * Serialization format requested for the Review Report.
 */
type CodeReviewFormat = "json" | "markdown";

/**
 * Runtime facts passed to the Code Review Agent for prompt context.
 *
 * These values describe the execution environment; they are not user
 * configuration.
 */
type CodeReviewEnvironment = {
	readonly os: string;
	readonly currentPath: string;
	readonly dateTime: string;
};

type CodeReviewAgentToolServices = ReadFileAgentTool | BashAgentTool;

/**
 * Complete request contract for one Code Review Agent run.
 *
 * The request identifies the Review Target, Repository Root, branch metadata,
 * output format, and runtime environment used to produce the Review Report.
 */
type CodeReviewRequest = {
	readonly target: CodeReviewTarget;
	readonly base: string;
	readonly format: CodeReviewFormat;
	readonly currentBranch: string | null;
	readonly currentBranchHead: string | null;
	readonly environment: CodeReviewEnvironment;
	readonly repositoryRoot: string;
};

/**
 * Effect service that runs Skopeo's Code Review Agent.
 */
class CodeReviewService extends Context.Service<
	CodeReviewService,
	{
		readonly review: (request: CodeReviewRequest) => Effect.Effect<void, unknown, AgentToolRuntimeDependencies>;
	}
>()("CodeReviewService") {}

/**
 * Live Code Review Agent service layer.
 *
 * The implementation creates repository-scoped Agent Tools for each request,
 * sends the generated prompts to the model, and prints the resulting Review
 * Report.
 */
const CodeReviewServiceLive = Layer.effect(
	CodeReviewService,
	Effect.gen(function* () {
		return CodeReviewService.of({
			review: (request) =>
				Effect.fn("review")(function* () {
					const context = yield* Effect.context<AgentToolRuntimeDependencies>();
					const runEffect = Effect.runPromiseWith(context);
					const toolLayer = makeAgentToolsLayer({ repositoryRoot: request.repositoryRoot });
					const runToolEffect = <A, E>(effect: Effect.Effect<A, E, CodeReviewAgentToolServices>) =>
						runEffect(effect.pipe(Effect.provide(toolLayer)));
					const readFileToolDefinition = makeReadFileToolDefinition({ runEffect: runToolEffect });
					const bashToolDefinition = makeBashToolDefinition({ runEffect: runToolEffect });

					const loggerMiddleware: ChatMiddleware = {
						name: "logger",
						onConfig: (ctx, config) => {
							runEffect(
								Effect.logInfo(`[${ctx.requestId}] onConfig`).pipe(
									Effect.annotateLogs({
										ctx: ctx,
										config: config,
									}),
								),
							);
						},
						onStart: (ctx) => {
							runEffect(
								Effect.logInfo(`[${ctx.requestId}] Chat started`).pipe(
									Effect.annotateLogs({
										ctx: ctx,
									}),
								),
							);
						},
						onChunk: (ctx, chunk) => {
							runEffect(
								Effect.logInfo(`[${ctx.requestId}] Chat chunk`).pipe(
									Effect.annotateLogs({
										ctx: ctx,
										chunk: chunk,
									}),
								),
							);
						},
						onBeforeToolCall: (ctx, tool) => {
							runEffect(
								Effect.logInfo(`[${ctx.requestId}] Tool called`).pipe(
									Effect.annotateLogs({
										ctx: ctx,
										tool: tool,
									}),
								),
							);
						},
						onAfterToolCall: (ctx, tool) => {
							runEffect(
								Effect.logInfo(`[${ctx.requestId}] Tool returned`).pipe(
									Effect.annotateLogs({
										ctx: ctx,
										tool: tool,
									}),
								),
							);
						},
						onUsage: (ctx, usage) => {
							runEffect(
								Effect.logInfo(`[${ctx.requestId}] Usage`).pipe(
									Effect.annotateLogs({
										ctx: ctx,
										usage: usage,
									}),
								),
							);
						},
						onFinish: (ctx) => {
							runEffect(
								Effect.logInfo(`[${ctx.requestId}] Chat finished`).pipe(
									Effect.annotateLogs({
										ctx: ctx,
									}),
								),
							);
						},
						onAbort: (ctx, info) => {
							runEffect(
								Effect.logWarning(`[${ctx.requestId}] Chat aborted`).pipe(
									Effect.annotateLogs({
										ctx: ctx,
										info: info,
									}),
								),
							);
						},
						onError: (ctx, error) => {
							runEffect(
								Effect.logError(`[${ctx.requestId}] Chat error`).pipe(
									Effect.annotateLogs({
										ctx: ctx,
										error: error,
									}),
								),
							);
						},
					};
					const report = yield* Effect.tryPromise(() => {
						return chat({
							adapter: openaiText("gpt-5.4-mini"),
							messages: [
								{
									role: "user",
									content: createReviewPrompt(request),
								},
							],
							systemPrompts: [createReviewSystemPrompt(request)],
							tools: [readFileToolDefinition, bashToolDefinition],
							agentLoopStrategy: maxIterations(20),
							stream: false,
							middleware: [loggerMiddleware],
							context: {
								currentBranch: request.currentBranch ?? "unknown",
								workingDirectory: process.cwd(),
							},
						});
					});

					yield* Console.log(report);
				})(),
		});
	}),
);

/**
 * Builds the stable system prompt that defines the Code Review Agent role,
 * Agent Tool rules, review priorities, and output rules.
 */
const createReviewSystemPrompt = (
	request: CodeReviewRequest,
) => `You are Skopeo, a pragmatic senior engineer acting as a Code Review Agent.

Your job is to inspect the Review Target requested by the Skopeo User and produce a concise Review Report.

Runtime context:
- OS: ${request.environment.os}
- Current path: ${request.environment.currentPath}
- Date/time: ${request.environment.dateTime}

Agent Tool rules:
- Use the read_file and bash tools to inspect the repository, diffs, and relevant context before concluding.
- Tool paths may be absolute or relative; relative paths resolve from the current path.
- The tools are repository-scoped and cannot read or run commands outside the current path.
- Do not attempt to read secret-bearing files or run destructive commands.

Review priorities:
- Find concrete bugs, behavioral regressions, security problems, data-loss risks, race conditions, and missing tests for changed behavior.
- Prefer high-signal Review Findings over style comments or broad refactoring suggestions.
- Do not assume the diff is complete if a nearby file, test, or type definition is needed; inspect it.
- If you cannot verify something, say what is unverified instead of inventing certainty.

Output rules:
- Put Review Findings first, ordered by severity.
- Include file and line references when available.
- For each Review Finding, explain impact and the smallest practical fix.
- If there are no Review Findings, say that explicitly and mention any residual testing gaps.
- Keep summaries brief. Do not include tool transcripts.`;

/**
 * Builds the target-specific user prompt that tells the Code Review Agent which
 * git commands to run first for the requested Review Target.
 */
const createReviewPrompt = (request: CodeReviewRequest) => {
	const targetCommand =
		request.target === "working"
			? "Review staged, unstaged, and untracked working-tree changes. Start with `git status --short`, `git diff --stat`, and `git diff --cached --stat`, then inspect `git diff` and `git diff --cached`. Inspect untracked files with Agent Tools when they are part of the Review Target."
			: `Review committed branch changes against base ${request.base}. Start with \`git diff --stat ${request.base}...HEAD\`, then inspect \`git diff ${request.base}...HEAD\`.`;

	return `Review command input:
- target: ${request.target}
- base: ${request.base}
- format: ${request.format}
- currentBranch: ${request.currentBranch ?? "unknown"}
- currentBranchHead: ${request.currentBranchHead ?? "unknown"}
- repositoryRoot: ${request.repositoryRoot}

${targetCommand}

Use the command input to decide the Review Target. Produce the Review Report in ${request.format} format.`;
};

export type { CodeReviewEnvironment, CodeReviewFormat, CodeReviewRequest, CodeReviewTarget };
export { CodeReviewService, CodeReviewServiceLive, createReviewSystemPrompt };
