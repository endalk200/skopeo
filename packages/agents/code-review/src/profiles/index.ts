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
 * Narrows a configured model string to a Review Profile model. The set of
 * models is code-defined (ADR 0007); Skopeo Configuration only picks one.
 * `Object.hasOwn` keeps inherited keys like "toString" from passing.
 */
const isReviewProfileModel = (value: string): value is ReviewProfileModel =>
	Object.hasOwn(reviewProfiles.standard, value);

/**
 * Resolves the Default Review Profile from Skopeo Configuration's `[review]`
 * selection. Returns `undefined` when the configured model has no
 * code-defined Review Profile — semantic validation and the run-time
 * ModelProviderService both surface that as an unknown-model error.
 */
const resolveReviewProfile = (selection: {
	readonly depth: ReviewDepth;
	readonly model: string;
}): ReviewProfile | undefined =>
	isReviewProfileModel(selection.model) ? reviewProfiles[selection.depth][selection.model] : undefined;

export type { ReviewDepth, ReviewProfile, ReviewProfileChatParams, ReviewProfileModel };
export { isReviewProfileModel, resolveReviewProfile, reviewProfiles };
