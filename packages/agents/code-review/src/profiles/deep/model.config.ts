import { openai } from "@ai-sdk/openai";
import type { ReviewProfile } from "../types.js";

export const deepModelConfig: Pick<
	ReviewProfile,
	"modelId" | "reasoningEffort" | "temperature" | "stepBudget" | "makeModel"
> = {
	modelId: "gpt-5.5" as const,
	reasoningEffort: "medium" as const,
	stepBudget: 40,
	makeModel: () => openai("gpt-5.5"),
};
