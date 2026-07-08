import { Effect, Schema } from "effect";
import { InvalidProjectInput } from "./errors.js";

export const SourceControlProvider = Schema.Literals(["github", "gitlab"]).annotate({
	description: "Supported source control hosting provider.",
	identifier: "SourceControlProvider",
});

export type SourceControlProvider = (typeof SourceControlProvider)["Type"];

export type Project = {
	readonly id: string;
	readonly name: string;
	readonly sourceControlProvider: SourceControlProvider;
	readonly sourceControlUrl: string;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly deletedAt: string | null;
};

export type CreateProjectCommand = {
	readonly name: string;
	readonly sourceControlProvider: SourceControlProvider;
	readonly sourceControlUrl: string;
};

export type UpdateProjectCommand = {
	readonly name?: string | undefined;
	readonly sourceControlProvider?: SourceControlProvider | undefined;
	readonly sourceControlUrl?: string | undefined;
};

export type ValidatedCreateProject = {
	readonly name: string;
	readonly sourceControlProvider: SourceControlProvider;
	readonly sourceControlUrl: string;
};

export type ValidatedUpdateProject = {
	readonly name?: string | undefined;
	readonly sourceControlProvider?: SourceControlProvider | undefined;
	readonly sourceControlUrl?: string | undefined;
};

const providerHosts: Readonly<Record<SourceControlProvider, ReadonlySet<string>>> = {
	github: new Set(["github.com", "www.github.com"]),
	gitlab: new Set(["gitlab.com", "www.gitlab.com"]),
};

const normalizeProjectName = (name: string) => name.trim().replaceAll(/\s+/g, " ");

const validateProjectName = (name: string): Effect.Effect<string, InvalidProjectInput> => {
	const normalized = normalizeProjectName(name);

	if (normalized.length === 0) {
		return Effect.fail(new InvalidProjectInput({ message: "Project name is required." }));
	}

	if (normalized.length > 160) {
		return Effect.fail(new InvalidProjectInput({ message: "Project name must be 160 characters or fewer." }));
	}

	return Effect.succeed(normalized);
};

const providerForHost = (host: string): SourceControlProvider | null => {
	const normalizedHost = host.toLowerCase();

	if (providerHosts.github.has(normalizedHost)) {
		return "github";
	}

	if (providerHosts.gitlab.has(normalizedHost)) {
		return "gitlab";
	}

	return null;
};

const validateSourceControlUrl = (
	url: string,
	expectedProvider: SourceControlProvider,
): Effect.Effect<string, InvalidProjectInput> =>
	Effect.try({
		try: () => {
			const parsed = new URL(url);
			if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
				throw new Error("Source control URL must use http or https.");
			}

			const provider = providerForHost(parsed.hostname);
			if (provider === null) {
				throw new Error("Source control URL must point to github.com or gitlab.com.");
			}

			if (provider !== expectedProvider) {
				throw new Error("Source control provider does not match the source control URL host.");
			}

			const pathSegments = parsed.pathname.split("/").filter((segment) => segment.length > 0);
			if (pathSegments.length < 2) {
				throw new Error("Source control URL must point to a repository path.");
			}

			parsed.hash = "";
			parsed.search = "";
			return parsed.toString().replace(/\/$/, "");
		},
		catch: (cause) =>
			new InvalidProjectInput({
				message: cause instanceof Error ? cause.message : "Source control URL is invalid.",
			}),
	});

export const validateCreateProject = (
	command: CreateProjectCommand,
): Effect.Effect<ValidatedCreateProject, InvalidProjectInput> =>
	Effect.all({
		name: validateProjectName(command.name),
		sourceControlProvider: Effect.succeed(command.sourceControlProvider),
		sourceControlUrl: validateSourceControlUrl(command.sourceControlUrl, command.sourceControlProvider),
	});

export const validateUpdateProject = (
	command: UpdateProjectCommand,
): Effect.Effect<ValidatedUpdateProject, InvalidProjectInput> =>
	Effect.gen(function* () {
		const hasName = command.name !== undefined;
		const hasProvider = command.sourceControlProvider !== undefined;
		const hasUrl = command.sourceControlUrl !== undefined;

		if (!hasName && !hasProvider && !hasUrl) {
			return yield* Effect.fail(
				new InvalidProjectInput({ message: "At least one project field must be provided." }),
			);
		}

		if (hasProvider !== hasUrl) {
			return yield* Effect.fail(
				new InvalidProjectInput({
					message: "sourceControlProvider and sourceControlUrl must be updated together.",
				}),
			);
		}

		const provider = command.sourceControlProvider;
		const name = hasName ? yield* validateProjectName(command.name) : undefined;

		if (hasUrl) {
			if (provider === undefined) {
				return yield* Effect.fail(
					new InvalidProjectInput({
						message: "sourceControlProvider and sourceControlUrl must be updated together.",
					}),
				);
			}

			return {
				name,
				sourceControlProvider: provider,
				sourceControlUrl: yield* validateSourceControlUrl(command.sourceControlUrl, provider),
			};
		}

		return {
			name,
		};
	});
