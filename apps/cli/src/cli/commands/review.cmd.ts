import { CodeReviewService } from "@skopeo/code-review-agent";
import { GitService } from "@skopeo/utils";
import { Data, Effect, Option, Path } from "effect";
import { Command, Flag } from "effect/unstable/cli";
import { codeReviewLayer } from "../../runtime/layers.js";

type ReviewTarget = "working" | "branch";
type ReviewFormat = "json" | "markdown";

/**
 * A review flag combination the CLI cannot execute. Tagged so the program's
 * failure handling prints the message instead of exiting silently.
 */
export class InvalidReviewFlags extends Data.TaggedError("InvalidReviewFlags")<{
	readonly message: string;
}> {}

type ReviewPlan = {
	readonly target: ReviewTarget;
	readonly base: string;
	readonly format: ReviewFormat;
	readonly currentBranch: string | null;
	readonly currentBranchHead: string | null;
	readonly repositoryRoot: string;
};

const resolveReviewPlan = ({
	base,
	currentBranch,
	currentBranchHead,
	format,
	mainBranch,
	repositoryRoot,
	target,
}: {
	readonly target: ReviewTarget;
	readonly base: string | undefined;
	readonly format: ReviewFormat;
	readonly currentBranch: string | null;
	readonly currentBranchHead: string | null;
	readonly mainBranch: string | null;
	readonly repositoryRoot: string;
}): Effect.Effect<ReviewPlan, InvalidReviewFlags> =>
	Effect.gen(function* () {
		if (target === "working") {
			if (base !== undefined) {
				return yield* Effect.fail(
					new InvalidReviewFlags({ message: "--base cannot be used with --target working" }),
				);
			}

			if (currentBranch === null) {
				return yield* Effect.fail(
					new InvalidReviewFlags({
						message: "--target working requires a checked-out branch; detached HEAD is not supported",
					}),
				);
			}

			return {
				base: currentBranch,
				currentBranch,
				currentBranchHead,
				format,
				repositoryRoot,
				target,
			};
		}

		const resolvedBase = base ?? mainBranch;

		if (resolvedBase === null) {
			return yield* Effect.fail(
				new InvalidReviewFlags({
					message: "--target branch requires --base because no repository main branch could be detected",
				}),
			);
		}

		return {
			base: resolvedBase,
			currentBranch,
			currentBranchHead,
			format,
			repositoryRoot,
			target,
		};
	});

export { resolveReviewPlan };

export const reviewCommand = Command.make("review", {
	target: Flag.choice("target", ["working", "branch"] as const).pipe(
		Flag.withAlias("t"),
		Flag.withDescription("Review target: working tree changes or committed branch changes"),
		Flag.withDefault("working"),
	),
	base: Flag.string("base").pipe(
		Flag.withDescription("Base branch for branch reviews. Not allowed with --target working."),
		Flag.optional,
	),
	format: Flag.choice("format", ["json", "markdown"] as const).pipe(
		Flag.withAlias("f"),
		Flag.withDescription("Report output format"),
		Flag.withDefault("markdown"),
	),
}).pipe(
	Command.withDescription(
		"Review local changes and print findings for either the working tree or the committed branch diff.",
	),
	Command.withShortDescription("Review local changes"),
	Command.withAlias("r"),
	Command.withExamples([
		{
			command: "review",
			description: "Review staged, unstaged, tracked, and untracked working-tree changes",
		},
		{
			command: "review --target working --format json",
			description: "Review the working tree and print machine-readable JSON",
		},
		{
			command: "review --target branch",
			description: "Review committed branch changes against the repository main branch",
		},
		{
			command: "review --target branch --base release/2026-06",
			description: "Review committed branch changes against a specific base branch",
		},
	]),
	Command.withHandler((input) =>
		Effect.gen(function* () {
			const path = yield* Path.Path;
			const cwd = path.resolve();

			const git = yield* GitService;
			const currentBranch = yield* git.getCurrentBranch(cwd);
			const currentBranchHead = yield* git.getCurrentBranchHead(cwd);
			const mainBranch = yield* git.getMainBranch(cwd);
			const repositoryRoot = yield* git.getRepositoryRoot(cwd);

			const plan = yield* resolveReviewPlan({
				base: Option.getOrUndefined(input.base),
				currentBranch,
				currentBranchHead,
				format: input.format,
				mainBranch,
				repositoryRoot,
				target: input.target,
			});

			yield* Effect.annotateCurrentSpan({
				"cli.command": "review",
				"skopeo.command": "review",
				"skopeo.review.base": plan.base,
				"skopeo.review.repository_root": plan.repositoryRoot,
				"skopeo.review.target": plan.target,
				"git.branch": plan.currentBranch,
				"git.branch.head": plan.currentBranchHead,
			});

			// The Code Review Agent services are provided around the review
			// call after flag validation, so InvalidReviewFlags always surface
			// before agent-layer construction.
			yield* Effect.gen(function* () {
				const codeReview = yield* CodeReviewService;
				yield* codeReview.review({
					...plan,
					environment: {
						currentPath: plan.repositoryRoot,
						dateTime: new Date().toISOString(),
						os: process.platform,
					},
				});
			}).pipe(Effect.provide(codeReviewLayer));
		}).pipe(
			Effect.annotateLogs({
				"skopeo.command": "review",
			}),
		),
	),
);
