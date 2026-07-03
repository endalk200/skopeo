import { opus48QuickProfile, opus48StandardProfile, opus48ThoroughProfile } from "./models/claude-opus-4-8/profiles.js";
import { gpt54QuickProfile, gpt54StandardProfile, gpt54ThoroughProfile } from "./models/gpt-5-4/profiles.js";
import { gpt55QuickProfile, gpt55StandardProfile, gpt55ThoroughProfile } from "./models/gpt-5-5/profiles.js";
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
 * 2. Add the model ID to `ReviewProfileModel` in `types.ts`.
 * 3. Register the three depth variants below — the `satisfies` clause fails
 *    compilation until every depth has an entry for the new model.
 */
const reviewProfiles = {
	quick: {
		"claude-opus-4-8": opus48QuickProfile,
		"gpt-5.4": gpt54QuickProfile,
		"gpt-5.5": gpt55QuickProfile,
	},
	standard: {
		"claude-opus-4-8": opus48StandardProfile,
		"gpt-5.4": gpt54StandardProfile,
		"gpt-5.5": gpt55StandardProfile,
	},
	thorough: {
		"claude-opus-4-8": opus48ThoroughProfile,
		"gpt-5.4": gpt54ThoroughProfile,
		"gpt-5.5": gpt55ThoroughProfile,
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
