import * as OPUS_4_8_PROFILES from "./models/claude-opus-4-8/profiles.js";
import * as GPT_5_2_PROFILES from "./models/gpt-5-2/profiles.js";
import * as GPT_5_4_PROFILES from "./models/gpt-5-4/profiles.js";
import * as GPT_5_5_PROFILES from "./models/gpt-5-5/profiles.js";
import type { ReviewDepth, ReviewProfile, ReviewProfileChatParams, ReviewProfileModel } from "./types.js";

/**
 * Every tuned Review Profile, indexed by Review Depth and model.
 *
 * Prompts and reasoning configuration are tuned per model, so switching model
 * within a depth swaps the whole bundle — never mix one model's prompts with
 * another model's reasoning settings.
 *
 * Adding a model:
 *
 * 1. Create `models/<model-id>/` by copying the closest existing model folder.
 *    Each model folder is self-contained, with exactly two files:
 *    `prompts.ts` (how we talk to the model, informed by the vendor's
 *    prompting guidance) and `profiles.ts` (reasoning tuning per Review Depth
 *    and the vendor chat call). Do not share prompts or tuning between model
 *    folders — models drift independently as they are evaluated.
 * 2. Every model module exports the same `ReviewProfileModule` shape — plain
 *    `quick` / `standard` / `thorough` bindings asserted with `satisfies` —
 *    so a copied folder needs no export renaming and a missing depth fails
 *    compilation inside the module itself.
 * 3. Add the model ID to `ReviewProfileModel` in `types.ts`.
 * 4. Import the module as `<MODEL_ID>_PROFILES` and register its three depth
 *    variants below — the registry `satisfies` clause fails compilation until
 *    every depth has an entry for the new model.
 */
const reviewProfiles = {
	quick: {
		"claude-opus-4-8": OPUS_4_8_PROFILES.quick,
		"gpt-5.2": GPT_5_2_PROFILES.quick,
		"gpt-5.4": GPT_5_4_PROFILES.quick,
		"gpt-5.5": GPT_5_5_PROFILES.quick,
	},
	standard: {
		"claude-opus-4-8": OPUS_4_8_PROFILES.standard,
		"gpt-5.2": GPT_5_2_PROFILES.standard,
		"gpt-5.4": GPT_5_4_PROFILES.standard,
		"gpt-5.5": GPT_5_5_PROFILES.standard,
	},
	thorough: {
		"claude-opus-4-8": OPUS_4_8_PROFILES.thorough,
		"gpt-5.2": GPT_5_2_PROFILES.thorough,
		"gpt-5.4": GPT_5_4_PROFILES.thorough,
		"gpt-5.5": GPT_5_5_PROFILES.thorough,
	},
} as const satisfies Record<ReviewDepth, Record<ReviewProfileModel, ReviewProfile>>;

/**
 * The Review Profile used by the Code Review Agent.
 *
 * Switching profiles is a deliberate manual code change: edit this one
 * assignment, e.g. `reviewProfiles.thorough["claude-opus-4-8"]`.
 */
const activeReviewProfile: ReviewProfile = reviewProfiles.standard["gpt-5.5"];

export type { ReviewDepth, ReviewProfile, ReviewProfileChatParams, ReviewProfileModel };
export { activeReviewProfile, reviewProfiles };
