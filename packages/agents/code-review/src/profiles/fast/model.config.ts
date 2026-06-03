import { openai } from "@ai-sdk/openai";
import type { ReviewProfile } from "../types.js";

export const fastModelConfig: Pick<
	ReviewProfile,
	"modelId" | "reasoningEffort" | "temperature" | "stepBudget" | "makeModel"
> = {
	modelId: "gpt-5.5" as const,
	reasoningEffort: "low" as const,
	temperature: 0.1,
	stepBudget: 20,
	makeModel: () => openai("gpt-5.5"),
};
