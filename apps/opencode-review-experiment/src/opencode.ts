import { execFile } from "node:child_process";
import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { inspect, promisify } from "node:util";

import {
	type Config,
	createOpencodeClient,
	createOpencodeServer,
	type Event,
	type OpencodeClient,
} from "@opencode-ai/sdk/v2";

import type { ExperimentSettings } from "./settings.js";

const execFileAsync = promisify(execFile);

export type Runtime = {
	client: OpencodeClient;
	serverUrl: string;
	close: () => void;
};

export type RequestResult<T = unknown> = {
	ok: boolean;
	status?: number;
	data?: T;
	error?: unknown;
};

export type EventSummary = {
	id?: string;
	type?: string;
	sessionID?: string;
	messageID?: string;
	tool?: string;
	delta?: string;
	text?: string;
	raw: unknown;
};

export type ReviewArtifact = {
	schemaVersion: 1;
	createdAt: string;
	sdkPackage: "@opencode-ai/sdk";
	sdkVersion: "0.0.0-beta-202606160953";
	serverUrl: string;
	target: string;
	configDir: string;
	request: {
		agent: string;
		model?: string;
		providerID?: string;
		modelID?: string;
		noReply: boolean;
		tools: Record<string, boolean>;
		systemPromptPath: string;
		userPromptPath: string;
	};
	inspection: Record<string, RequestResult>;
	session?: unknown;
	promptResult?: RequestResult;
	messages?: RequestResult;
	diff?: RequestResult;
	events: EventSummary[];
	eventTypeCounts: Record<string, number>;
	error?: string;
};

export async function createRuntime(settings: ExperimentSettings, config: Config): Promise<Runtime> {
	await prepareTarget(settings);
	await mkdir(settings.stateDir, { recursive: true });
	await mkdir(settings.homeDir, { recursive: true });
	process.env.HOME = settings.homeDir;
	process.env.OPENCODE_CONFIG_DIR = settings.configDir;
	if (settings.configFile) {
		process.env.OPENCODE_CONFIG = settings.configFile;
	} else {
		delete process.env.OPENCODE_CONFIG;
	}
	process.env.XDG_CONFIG_HOME = join(settings.stateDir, "config");
	process.env.XDG_DATA_HOME = join(settings.stateDir, "data");
	process.env.XDG_CACHE_HOME = join(settings.stateDir, "cache");

	if (settings.baseUrl) {
		return {
			client: createOpencodeClient({
				baseUrl: settings.baseUrl,
				directory: settings.target,
			}),
			serverUrl: settings.baseUrl,
			close() {},
		};
	}

	const previousCwd = process.cwd();
	let server: Awaited<ReturnType<typeof createOpencodeServer>>;
	try {
		process.chdir(settings.target);
		server = await createOpencodeServer({
			hostname: settings.hostname,
			port: settings.port,
			timeout: settings.timeout,
			config,
		});
	} finally {
		process.chdir(previousCwd);
	}

	return {
		client: createOpencodeClient({
			baseUrl: server.url,
			directory: settings.target,
		}),
		serverUrl: server.url,
		close: server.close,
	};
}

async function prepareTarget(settings: ExperimentSettings) {
	if (!settings.usesDefaultTarget) {
		return;
	}

	await mkdir(settings.target, { recursive: true });
	await cp(settings.fixtureTarget, settings.target, {
		force: true,
		recursive: true,
	});

	try {
		await stat(join(settings.target, ".git"));
	} catch {
		await execFileAsync("git", ["init"], {
			cwd: settings.target,
		});
	}
}

export function createExperimentConfig(settings: ExperimentSettings, systemPrompt: string): Config {
	const permission = {
		read: "allow",
		glob: "allow",
		grep: "allow",
		list: "allow",
		skill: {
			"*": "allow",
		},
		edit: "deny",
		bash: {
			"*": "ask",
			"git diff*": "allow",
			"git status*": "allow",
			"git show*": "allow",
			"rg *": "allow",
		},
		question: "allow",
		todowrite: "allow",
		webfetch: "ask",
		websearch: "ask",
		review_context: "allow",
		"mcp_everything_*": settings.enableExampleMcp ? "allow" : "deny",
	} satisfies NonNullable<Config["permission"]>;

	const config: Config = {
		$schema: "https://opencode.ai/config.json",
		logLevel: "DEBUG",
		autoupdate: false,
		share: "disabled",
		snapshot: false,
		model: settings.model,
		default_agent: settings.agent,
		skills: {
			paths: [join(settings.configDir, "skills")],
		},
		permission,
		agent: {
			[settings.agent]: {
				description: "Reviews a code change and reports concrete Review Findings without editing files.",
				mode: "primary",
				model: settings.model,
				prompt: systemPrompt,
				temperature: 0.1,
				steps: 16,
				permission,
			},
			"review-researcher": {
				description: "Read-only helper for searching code, loading skills, and gathering context for a review.",
				mode: "subagent",
				prompt: "Gather repository context for code review. Do not edit files. Prefer read, grep, glob, skill, and review_context.",
				permission,
			},
		},
		tools: buildToolOverrides(),
		mcp: {
			mcp_everything: {
				type: "local",
				command: ["bun", "x", "@modelcontextprotocol/server-everything"],
				enabled: settings.enableExampleMcp,
				timeout: 5_000,
			},
		},
	};

	return config;
}

export function buildToolOverrides(): Record<string, boolean> {
	return {
		apply_patch: false,
		edit: false,
		write: false,
		bash: false,
		read: true,
		grep: true,
		glob: true,
		list: true,
		skill: true,
		todowrite: true,
		review_context: true,
	};
}

export async function safeCall<T>(callback: () => Promise<unknown>): Promise<RequestResult<T>> {
	try {
		const result = await callback();
		return normalizeResult<T>(result);
	} catch (error) {
		return {
			ok: false,
			error: serializeUnknown(error),
		};
	}
}

export function normalizeResult<T>(result: unknown): RequestResult<T> {
	if (isRecord(result) && "error" in result && result.error !== undefined) {
		return {
			ok: false,
			status: extractStatus(result),
			error: serializeUnknown(result.error),
		};
	}

	if (isRecord(result) && "data" in result) {
		return {
			ok: true,
			status: extractStatus(result),
			data: result.data as T,
		};
	}

	return {
		ok: true,
		data: result as T,
	};
}

export async function inspectRuntime(client: OpencodeClient, settings: ExperimentSettings) {
	const inspection: Record<string, RequestResult> = {
		"global.health": await safeCall(() => client.global.health()),
		"config.get": mapResult(
			await safeCall(() => client.config.get({ directory: settings.target })),
			summarizeConfig,
		),
		"config.providers": mapResult(
			await safeCall(() => client.config.providers({ directory: settings.target })),
			summarizeProviders,
		),
		"provider.list": mapResult(
			await safeCall(() => client.provider.list({ directory: settings.target })),
			summarizeProviderList,
		),
		"app.agents": mapResult(
			await safeCall(() => client.app.agents({ directory: settings.target })),
			summarizeNamedList,
		),
		"app.skills": mapResult(
			await safeCall(() => client.app.skills({ directory: settings.target })),
			summarizeNamedList,
		),
		"tool.ids": await safeCall(() => client.tool.ids({ directory: settings.target })),
		"mcp.status": await safeCall(() => client.mcp.status({ directory: settings.target })),
		"file.status": await safeCall(() => client.file.status({ directory: settings.target })),
	};

	if (settings.providerID && settings.modelID) {
		inspection["tool.list"] = await safeCall(() =>
			client.tool.list({
				directory: settings.target,
				provider: settings.providerID as string,
				model: settings.modelID as string,
			}),
		);
	}

	return inspection;
}

function mapResult(result: RequestResult, map: (data: unknown) => unknown): RequestResult {
	if (!result.ok) {
		return result;
	}
	return {
		...result,
		data: map(result.data),
	};
}

function summarizeConfig(data: unknown) {
	if (!isRecord(data)) {
		return data;
	}
	return {
		model: data.model,
		default_agent: data.default_agent,
		share: data.share,
		snapshot: data.snapshot,
		agentNames: isRecord(data.agent) ? Object.keys(data.agent) : [],
		providerNames: isRecord(data.provider) ? Object.keys(data.provider) : [],
		mcpNames: isRecord(data.mcp) ? Object.keys(data.mcp) : [],
		permissionKeys: isRecord(data.permission) ? Object.keys(data.permission) : [],
		toolOverrides: isRecord(data.tools) ? data.tools : undefined,
	};
}

function summarizeProviders(data: unknown) {
	if (!isRecord(data)) {
		return data;
	}
	const providers = Array.isArray(data.providers) ? data.providers : [];
	return {
		defaultProviderCount: isRecord(data.default) ? Object.keys(data.default).length : undefined,
		providerCount: providers.length,
		providers: providers.slice(0, 20).map((provider) => summarizeProvider(provider)),
	};
}

function summarizeProviderList(data: unknown) {
	if (!isRecord(data)) {
		return data;
	}
	const providers = Array.isArray(data.providers) ? data.providers : Array.isArray(data.all) ? data.all : [];
	return {
		connected: data.connected,
		defaultProviderCount: isRecord(data.default) ? Object.keys(data.default).length : undefined,
		providerCount: providers.length,
		providers: providers.slice(0, 20).map((provider) => summarizeProvider(provider)),
	};
}

function summarizeProvider(provider: unknown) {
	if (!isRecord(provider)) {
		return provider;
	}
	return {
		id: provider.id,
		name: provider.name,
		source: provider.source,
		modelCount: isRecord(provider.models) ? Object.keys(provider.models).length : undefined,
	};
}

function summarizeNamedList(data: unknown) {
	if (!Array.isArray(data)) {
		return data;
	}
	return data.map((item) => {
		if (!isRecord(item)) {
			return item;
		}
		return {
			name: item.name,
			id: item.id,
			description: item.description,
			mode: item.mode,
		};
	});
}

export async function collectEvents(
	client: OpencodeClient,
	target: string,
	sessionID: string,
	signal: AbortSignal,
	maxEvents: number,
) {
	const events: EventSummary[] = [];

	try {
		const subscription = await client.event.subscribe({ directory: target }, { signal });
		for await (const event of subscription.stream) {
			if (isSessionEvent(event, sessionID)) {
				events.push(summarizeEvent(event as Event));
			}
			if (events.length >= maxEvents) {
				break;
			}
		}
	} catch (error) {
		if (!signal.aborted) {
			events.push({
				type: "event.collector.error",
				raw: serializeUnknown(error),
			});
		}
	}

	return events;
}

export function summarizeEvent(event: Event): EventSummary {
	const eventRecord = event as unknown as Record<string, unknown>;
	const properties = isRecord(eventRecord.properties) ? eventRecord.properties : {};
	return {
		id: typeof event.id === "string" ? event.id : undefined,
		type: typeof event.type === "string" ? event.type : undefined,
		sessionID: typeof properties.sessionID === "string" ? properties.sessionID : undefined,
		messageID: typeof properties.messageID === "string" ? properties.messageID : undefined,
		tool:
			typeof properties.tool === "string"
				? properties.tool
				: typeof properties.name === "string"
					? properties.name
					: undefined,
		delta: typeof properties.delta === "string" ? properties.delta : undefined,
		text: typeof properties.text === "string" ? properties.text : undefined,
		raw: event,
	};
}

export function summarizeArtifact(artifact: Pick<ReviewArtifact, "events" | "messages" | "promptResult" | "error">) {
	const toolCalls = artifact.events.filter((event) => event.type?.includes("tool"));
	const textDeltas = artifact.events.filter((event) => event.type?.includes("text"));
	return {
		ok: artifact.promptResult?.ok === true && !artifact.error,
		error: artifact.error,
		eventCount: artifact.events.length,
		toolCallCount: toolCalls.length,
		toolNames: Array.from(new Set(toolCalls.map((event) => event.tool).filter((tool): tool is string => !!tool))),
		textEventCount: textDeltas.length,
		messageStatus: artifact.messages?.status,
	};
}

export async function readText(path: string) {
	return readFile(path, "utf8");
}

export async function writeArtifact(artifactDir: string, artifact: ReviewArtifact) {
	await mkdir(artifactDir, { recursive: true });
	const timestamp = artifact.createdAt.replaceAll(":", "-").replaceAll(".", "-");
	const path = join(artifactDir, `review-${timestamp}.json`);
	await writeFile(path, `${JSON.stringify(artifact, null, 2)}\n`);
	return path;
}

export function renderHumanResult(value: unknown) {
	return inspect(value, {
		colors: true,
		depth: 8,
		maxArrayLength: 50,
	});
}

function isSessionEvent(event: unknown, sessionID: string) {
	if (!isRecord(event)) {
		return false;
	}
	const properties = event.properties;
	if (!isRecord(properties)) {
		return false;
	}
	return properties.sessionID === sessionID;
}

function extractStatus(result: Record<string, unknown>) {
	const response = result.response;
	if (isRecord(response) && typeof response.status === "number") {
		return response.status;
	}
	return undefined;
}

export function serializeUnknown(error: unknown) {
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			stack: error.stack,
		};
	}
	return error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
