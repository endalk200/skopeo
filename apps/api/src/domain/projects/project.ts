import { type Brand, Effect, Schema } from "effect";
import { InvalidProjectInput } from "./errors.js";

export const SourceControlProvider = Schema.Literals(["github", "gitlab"]).annotate({
	description: "Supported source control hosting provider.",
	identifier: "SourceControlProvider",
});

export type SourceControlProvider = (typeof SourceControlProvider)["Type"];

/**
 * Canonical project model. The HTTP layer reuses this schema for responses, so
 * the domain type and the wire format cannot drift: dates are `DateTime.Utc`
 * in the domain and encode to ISO-8601 strings on the wire.
 */
export const Project = Schema.Struct({
	id: Schema.String,
	name: Schema.String,
	sourceControlProvider: SourceControlProvider,
	sourceControlUrl: Schema.String,
	createdAt: Schema.DateTimeUtcFromString,
	updatedAt: Schema.DateTimeUtcFromString,
	deletedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
}).annotate({
	description: "A repository-backed project configured for hosted Skopeo code review workflows.",
	identifier: "Project",
});

export type Project = (typeof Project)["Type"];

export const CreateProjectCommand = Schema.Struct({
	name: Schema.String,
	sourceControlProvider: SourceControlProvider,
	sourceControlUrl: Schema.String,
});

export type CreateProjectCommand = (typeof CreateProjectCommand)["Type"];

export const UpdateProjectCommand = Schema.Struct({
	name: Schema.optionalKey(Schema.String),
	sourceControlProvider: Schema.optionalKey(SourceControlProvider),
	sourceControlUrl: Schema.optionalKey(Schema.String),
});

export type UpdateProjectCommand = (typeof UpdateProjectCommand)["Type"];

/**
 * Branded command shapes. The brands are type-level only, but they guarantee
 * that `ProjectsRepository` can only receive values produced by
 * `validateCreateProject` / `validateUpdateProject` — the casts below are the
 * only places the brands are applied.
 */
export type ValidatedCreateProject = Brand.Branded<CreateProjectCommand, "ValidatedCreateProject">;

export type ValidatedUpdateProject = Brand.Branded<
	{
		readonly name?: string;
		readonly sourceControlProvider?: SourceControlProvider;
		readonly sourceControlUrl?: string;
	},
	"ValidatedUpdateProject"
>;

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

const parseUrl = (url: string): Effect.Effect<URL, InvalidProjectInput> =>
	Effect.try({
		try: () => new URL(url),
		catch: () => new InvalidProjectInput({ message: "Source control URL is invalid." }),
	});

const validateSourceControlUrl = Effect.fn(function* (url: string, expectedProvider: SourceControlProvider) {
	const parsed = yield* parseUrl(url);

	if (parsed.protocol !== "https:") {
		return yield* Effect.fail(new InvalidProjectInput({ message: "Source control URL must use https." }));
	}

	if (parsed.username !== "" || parsed.password !== "") {
		return yield* Effect.fail(
			new InvalidProjectInput({ message: "Source control URL must not include credentials." }),
		);
	}

	const provider = providerForHost(parsed.hostname);
	if (provider === null) {
		return yield* Effect.fail(
			new InvalidProjectInput({ message: "Source control URL must point to github.com or gitlab.com." }),
		);
	}

	if (provider !== expectedProvider) {
		return yield* Effect.fail(
			new InvalidProjectInput({ message: "Source control provider does not match the source control URL host." }),
		);
	}

	const pathSegments = parsed.pathname.split("/").filter((segment) => segment.length > 0);
	const isGithubRepository = expectedProvider === "github" && pathSegments.length === 2;
	const isGitlabRepository = expectedProvider === "gitlab" && pathSegments.length >= 2 && !pathSegments.includes("-");

	if (!isGithubRepository && !isGitlabRepository) {
		return yield* Effect.fail(
			new InvalidProjectInput({ message: "Source control URL must point to a repository path." }),
		);
	}

	const canonicalSegments =
		expectedProvider === "github" ? pathSegments.map((segment) => segment.toLowerCase()) : pathSegments;
	const repositoryName = canonicalSegments.at(-1)?.replace(/\.git$/i, "");
	if (repositoryName === undefined || repositoryName.length === 0) {
		return yield* Effect.fail(
			new InvalidProjectInput({ message: "Source control URL must point to a repository path." }),
		);
	}

	canonicalSegments[canonicalSegments.length - 1] = repositoryName;
	parsed.hostname = `${expectedProvider}.com`;
	parsed.pathname = `/${canonicalSegments.join("/")}`;
	parsed.hash = "";
	parsed.search = "";
	return parsed.toString().replace(/\/$/, "");
});

export const validateCreateProject = Effect.fn(function* (command: CreateProjectCommand) {
	const validated: CreateProjectCommand = {
		name: yield* validateProjectName(command.name),
		sourceControlProvider: command.sourceControlProvider,
		sourceControlUrl: yield* validateSourceControlUrl(command.sourceControlUrl, command.sourceControlProvider),
	};

	return validated as ValidatedCreateProject;
});

export const validateUpdateProject = Effect.fn(function* (command: UpdateProjectCommand) {
	const hasName = command.name !== undefined;
	const hasProvider = command.sourceControlProvider !== undefined;
	const hasUrl = command.sourceControlUrl !== undefined;

	if (!hasName && !hasProvider && !hasUrl) {
		return yield* Effect.fail(new InvalidProjectInput({ message: "At least one project field must be provided." }));
	}

	// Invariant: sourceControlProvider and sourceControlUrl always travel
	// together, because the URL host is validated against the provider.
	if (hasProvider !== hasUrl) {
		return yield* Effect.fail(
			new InvalidProjectInput({
				message: "sourceControlProvider and sourceControlUrl must be updated together.",
			}),
		);
	}

	const changes: {
		name?: string;
		sourceControlProvider?: SourceControlProvider;
		sourceControlUrl?: string;
	} = {};

	if (command.name !== undefined) {
		changes.name = yield* validateProjectName(command.name);
	}

	if (command.sourceControlProvider !== undefined && command.sourceControlUrl !== undefined) {
		changes.sourceControlProvider = command.sourceControlProvider;
		changes.sourceControlUrl = yield* validateSourceControlUrl(
			command.sourceControlUrl,
			command.sourceControlProvider,
		);
	}

	return changes as ValidatedUpdateProject;
});
