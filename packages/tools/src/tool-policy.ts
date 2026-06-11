import { Context, Data, Effect, FileSystem, Layer, Path, Result } from "effect";

export type AgentToolPolicyDecision =
	| {
			readonly approved: true;
	  }
	| {
			readonly approved: false;
			readonly reason: string;
	  };

export class AgentToolPolicyDenied extends Data.TaggedError("AgentToolPolicyDenied")<{
	readonly reason: string;
}> {}

export class InvalidAgentToolInput extends Data.TaggedError("InvalidAgentToolInput")<{
	readonly message: string;
}> {}

export class AgentToolPolicy extends Context.Service<
	AgentToolPolicy,
	{
		readonly repositoryRoot: string;
		readonly canReadFile: (input: { readonly path: string }) => Effect.Effect<AgentToolPolicyDecision>;
		readonly canRunCommand: (input: {
			readonly path: string;
			readonly command: string;
		}) => Effect.Effect<AgentToolPolicyDecision>;
	}
>()("AgentToolPolicy") {
	static readonly layer = (options: { readonly repositoryRoot: string }) =>
		Layer.effect(
			AgentToolPolicy,
			Effect.gen(function* () {
				const fs = yield* FileSystem.FileSystem;
				const path = yield* Path.Path;
				const repositoryRoot = yield* fs.realPath(options.repositoryRoot);
				const rootInfo = yield* fs.stat(repositoryRoot);

				if (rootInfo.type !== "Directory") {
					return yield* Effect.fail(
						new InvalidAgentToolInput({
							message: "Repository root must be a directory.",
						}),
					);
				}

				const relativeToRoot = (targetPath: string) => path.relative(repositoryRoot, targetPath);
				const isInsideRepository = (targetPath: string) => {
					const relativePath = relativeToRoot(targetPath);
					return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
				};
				const readBlockReason = (targetPath: string): string | null => {
					const relativePath = normalizeRelativePath(relativeToRoot(targetPath));

					if (isEnvironmentFile(relativePath)) {
						return "Reading environment files is blocked because they often contain secrets.";
					}

					if (isPrivateKeyFile(relativePath)) {
						return "Reading private key files is blocked because they often contain credentials.";
					}

					if (isLocalCredentialDirectoryPath(relativePath)) {
						return "Reading local credential directories is blocked because they often contain secrets.";
					}

					return null;
				};

				return AgentToolPolicy.of({
					repositoryRoot,
					canReadFile: ({ path: requestedPath }) =>
						Effect.gen(function* () {
							const targetPath = yield* Effect.result(fs.realPath(requestedPath));

							if (Result.isFailure(targetPath)) {
								return {
									approved: false,
									reason: "Unable to verify that the path is safe to read.",
								};
							}

							if (!isInsideRepository(targetPath.success)) {
								return {
									approved: false,
									reason: "Reading files outside the repository is blocked.",
								};
							}

							const blockedReason = readBlockReason(targetPath.success);
							return blockedReason === null
								? { approved: true }
								: { approved: false, reason: blockedReason };
						}),

					canRunCommand: ({ command, path: requestedPath }) =>
						Effect.gen(function* () {
							const targetPath = yield* Effect.result(fs.realPath(requestedPath));

							if (Result.isFailure(targetPath)) {
								return {
									approved: false,
									reason: "Unable to verify that the command directory is inside the repository.",
								};
							}

							if (!isInsideRepository(targetPath.success)) {
								return {
									approved: false,
									reason: "Running commands outside the repository is blocked.",
								};
							}

							const blockedCommandReason = commandBlockReason(command);
							return blockedCommandReason === null
								? { approved: true }
								: { approved: false, reason: blockedCommandReason };
						}),
				});
			}),
		);
}

export const resolveToolPath = (path: Path.Path, repositoryRoot: string, inputPath: string): string =>
	path.isAbsolute(inputPath) ? path.resolve(inputPath) : path.resolve(repositoryRoot, inputPath);

export const enforcePolicy = (decision: AgentToolPolicyDecision): Effect.Effect<void, AgentToolPolicyDenied> =>
	decision.approved ? Effect.void : Effect.fail(new AgentToolPolicyDenied({ reason: decision.reason }));

const normalizeRelativePath = (relativePath: string): string => relativePath.replaceAll("\\", "/");

const isEnvironmentFile = (relativePath: string) => {
	const name = relativePath.split("/").at(-1) ?? relativePath;
	return name === ".env" || name.startsWith(".env.") || name.endsWith(".env");
};

const isPrivateKeyFile = (relativePath: string) => /\.(?:pem|key|p12|pfx)$/i.test(relativePath);

const isLocalCredentialDirectoryPath = (relativePath: string) =>
	/^(\.aws|\.azure|\.gcloud|\.ssh)(?:\/|$)/.test(relativePath);

const commandBlockReason = (command: string): string | null => {
	if (/\b(?:rm|rmdir|unlink|shred|dd|mkfs)\b/.test(command)) {
		return "Running destructive filesystem commands is blocked.";
	}

	if (/\b(?:chmod|chown|chgrp)\b/.test(command)) {
		return "Running permission or ownership changes is blocked.";
	}

	return null;
};
