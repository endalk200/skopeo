import { deepModelConfig } from "./deep/model.config.js";
import { deepSystemPrompt } from "./deep/system.prompt.js";
import { buildDeepUserPrompt } from "./deep/user.prompt.js";
import { fastModelConfig } from "./fast/model.config.js";
import { fastSystemPrompt } from "./fast/system.prompt.js";
import { buildFastUserPrompt } from "./fast/user.prompt.js";
import type { ReviewProfile } from "./types.js";

export const deepProfile: ReviewProfile = {
	id: "deep",
	systemPrompt: deepSystemPrompt,
	buildUserPrompt: buildDeepUserPrompt,
	...deepModelConfig,
};

export const fastProfile: ReviewProfile = {
	id: "fast",
	systemPrompt: fastSystemPrompt,
	buildUserPrompt: buildFastUserPrompt,
	...fastModelConfig,
};

export const reviewProfiles = {
	deep: deepProfile,
	fast: fastProfile,
} as const;

export const defaultReviewProfile = deepProfile;
