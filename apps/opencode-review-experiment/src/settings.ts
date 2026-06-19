import { resolve } from "node:path";

import { fromAppRoot } from "./paths.js";

const model = process.env.OPENCODE_MODEL;
const parsedModel = parseProviderModel(model);

export type ExperimentSettings = {
	baseUrl?: string;
	target: string;
	fixtureTarget: string;
	usesDefaultTarget: boolean;
	configDir: string;
	configFile?: string;
	stateDir: string;
	homeDir: string;
	artifactDir: string;
	systemPrompt: string;
	userPrompt: string;
	agent: string;
	model?: string;
	providerID?: string;
	modelID?: string;
	hostname: string;
	port: number;
	timeout: number;
	maxEvents: number;
	noReply: boolean;
	enableExampleMcp: boolean;
};

export const settings: ExperimentSettings = {
	baseUrl: process.env.OPENCODE_BASE_URL,
	target: resolve(process.env.OPENCODE_EXPERIMENT_TARGET ?? fromAppRoot(".runtime/review-target")),
	fixtureTarget: resolve(fromAppRoot("fixtures/review-target")),
	usesDefaultTarget: !process.env.OPENCODE_EXPERIMENT_TARGET,
	configDir: resolve(process.env.OPENCODE_EXPERIMENT_CONFIG_DIR ?? fromAppRoot(".opencode")),
	configFile: process.env.OPENCODE_EXPERIMENT_CONFIG ? resolve(process.env.OPENCODE_EXPERIMENT_CONFIG) : undefined,
	stateDir: resolve(process.env.OPENCODE_EXPERIMENT_STATE_DIR ?? fromAppRoot(".runtime")),
	homeDir: resolve(process.env.OPENCODE_EXPERIMENT_HOME ?? fromAppRoot(".runtime/home")),
	artifactDir: resolve(process.env.OPENCODE_EXPERIMENT_ARTIFACT_DIR ?? fromAppRoot("runs")),
	systemPrompt: resolve(process.env.OPENCODE_EXPERIMENT_SYSTEM_PROMPT ?? fromAppRoot("prompts/system.md")),
	userPrompt: resolve(process.env.OPENCODE_EXPERIMENT_USER_PROMPT ?? fromAppRoot("prompts/user.md")),
	agent: process.env.OPENCODE_AGENT ?? "code-review",
	model,
	providerID: parsedModel?.providerID ?? process.env.OPENCODE_PROVIDER_ID,
	modelID: parsedModel?.modelID ?? process.env.OPENCODE_MODEL_ID,
	hostname: process.env.OPENCODE_HOSTNAME ?? "127.0.0.1",
	port: readInteger(process.env.OPENCODE_PORT, 4096),
	timeout: readInteger(process.env.OPENCODE_START_TIMEOUT_MS, 10_000),
	maxEvents: readInteger(process.env.OPENCODE_EXPERIMENT_MAX_EVENTS, 500),
	noReply: process.env.OPENCODE_NO_REPLY === "1",
	enableExampleMcp: process.env.OPENCODE_EXAMPLE_MCP === "1",
};

export function parseProviderModel(value: string | undefined) {
	if (!value) {
		return undefined;
	}
	const [providerID, ...modelParts] = value.split("/");
	if (!providerID || modelParts.length === 0) {
		return undefined;
	}
	return {
		providerID,
		modelID: modelParts.join("/"),
	};
}

function readInteger(value: string | undefined, fallback: number) {
	if (!value) {
		return fallback;
	}
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
