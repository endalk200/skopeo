import type { LanguageModel } from "ai";

export type ReasoningEffort = "low" | "medium";

export type ReviewProfile = {
	readonly id: "deep" | "fast";
	readonly modelId: "gpt-5.5";
	readonly reasoningEffort: ReasoningEffort;
	readonly temperature?: number;
	readonly stepBudget: number;
	readonly systemPrompt: string;
	readonly buildUserPrompt: (changedFileSummary: string) => string;
	readonly makeModel: () => LanguageModel;
};
