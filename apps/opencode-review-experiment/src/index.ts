#!/usr/bin/env bun
import { readFile } from "node:fs/promises";

import {
	buildToolOverrides,
	collectEvents,
	createExperimentConfig,
	createRuntime,
	inspectRuntime,
	normalizeResult,
	type ReviewArtifact,
	readText,
	renderHumanResult,
	serializeUnknown,
	summarizeArtifact,
	writeArtifact,
} from "./opencode.js";
import { renderUserPrompt } from "./prompts.js";
import { settings } from "./settings.js";

const command = process.argv[2] ?? "inspect";

switch (command) {
	case "inspect":
		await inspect();
		break;
	case "review":
		await review();
		break;
	case "replay":
		await replay(process.argv[3]);
		break;
	default:
		console.log(`Unknown command: ${command}

Use one of:
  bun run inspect
  bun run review
  bun run src/index.ts replay runs/<artifact>.json
`);
}

async function inspect() {
	const systemPrompt = await readText(settings.systemPrompt);
	const config = createExperimentConfig(settings, systemPrompt);
	const runtime = await createRuntime(settings, config);

	try {
		console.log(
			renderHumanResult({
				serverUrl: runtime.serverUrl,
				target: settings.target,
				configDir: settings.configDir,
				inspection: await inspectRuntime(runtime.client, settings),
			}),
		);
	} finally {
		runtime.close();
	}
}

async function review() {
	const systemPrompt = await readText(settings.systemPrompt);
	const userTemplate = await readText(settings.userPrompt);
	const userPrompt = await renderUserPrompt(userTemplate, settings.target);
	const tools = buildToolOverrides();
	const config = createExperimentConfig(settings, systemPrompt);
	const runtime = await createRuntime(settings, config);
	const artifact: ReviewArtifact = {
		schemaVersion: 1,
		createdAt: new Date().toISOString(),
		sdkPackage: "@opencode-ai/sdk",
		sdkVersion: "0.0.0-beta-202606160953",
		serverUrl: runtime.serverUrl,
		target: settings.target,
		configDir: settings.configDir,
		request: {
			agent: settings.agent,
			model: settings.model,
			providerID: settings.providerID,
			modelID: settings.modelID,
			noReply: settings.noReply,
			tools,
			systemPromptPath: settings.systemPrompt,
			userPromptPath: settings.userPrompt,
		},
		inspection: {},
		events: [],
		eventTypeCounts: {},
	};

	try {
		artifact.inspection = await inspectRuntime(runtime.client, settings);
		const sessionResult = await runtime.client.session.create(
			{
				directory: settings.target,
				title: "OpenCode SDK review experiment",
				agent: settings.agent,
				model:
					settings.providerID && settings.modelID
						? { providerID: settings.providerID, id: settings.modelID }
						: undefined,
				metadata: {
					experiment: "opencode-review-experiment",
					target: settings.target,
				},
			},
			{ throwOnError: true },
		);
		const session = sessionResult.data;
		artifact.session = session;

		if (!isRecord(session) || typeof session.id !== "string") {
			throw new Error("OpenCode returned a session without an id");
		}

		const controller = new AbortController();
		const eventTask = collectEvents(
			runtime.client,
			settings.target,
			session.id,
			controller.signal,
			settings.maxEvents,
		);

		try {
			const promptResult = await runtime.client.session.prompt(
				{
					sessionID: session.id,
					directory: settings.target,
					agent: settings.agent,
					model:
						settings.providerID && settings.modelID
							? { providerID: settings.providerID, modelID: settings.modelID }
							: undefined,
					noReply: settings.noReply,
					system: systemPrompt,
					tools,
					parts: [{ type: "text", text: userPrompt }],
				},
				{ throwOnError: true },
			);
			artifact.promptResult = normalizeResult(promptResult);
		} catch (error) {
			artifact.promptResult = {
				ok: false,
				error: serializeUnknown(error),
			};
			artifact.error = error instanceof Error ? error.message : String(error);
		} finally {
			await new Promise((resolve) => setTimeout(resolve, 250));
			controller.abort();
			artifact.events = await eventTask;
			artifact.eventTypeCounts = countEventTypes(artifact.events);
		}

		artifact.messages = await runtime.client.session
			.messages({ sessionID: session.id, directory: settings.target })
			.then(normalizeResult);
		artifact.diff = await runtime.client.session
			.diff({ sessionID: session.id, directory: settings.target })
			.then(normalizeResult);
	} finally {
		runtime.close();
	}

	const artifactPath = await writeArtifact(settings.artifactDir, artifact);
	console.log(
		renderHumanResult({
			artifactPath,
			...summarizeArtifact(artifact),
		}),
	);

	if (artifact.error) {
		process.exitCode = 1;
	}
}

async function replay(artifactPath: string | undefined) {
	if (!artifactPath) {
		throw new Error("replay expects the artifact path as its only argument");
	}

	const artifact = JSON.parse(await readFile(artifactPath, "utf8")) as ReviewArtifact;
	console.log(
		renderHumanResult({
			artifactPath,
			createdAt: artifact.createdAt,
			target: artifact.target,
			request: artifact.request,
			summary: summarizeArtifact(artifact),
			eventTypeCounts: artifact.eventTypeCounts,
		}),
	);
}

function countEventTypes(events: Array<{ type?: string }>) {
	const counts: Record<string, number> = {};
	for (const event of events) {
		const type = event.type ?? "unknown";
		counts[type] = (counts[type] ?? 0) + 1;
	}
	return counts;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
