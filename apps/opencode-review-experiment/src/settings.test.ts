import { describe, expect, test } from "bun:test";

import { parseProviderModel } from "./settings.js";

describe("parseProviderModel", () => {
	test("splits provider/model ids", () => {
		expect(parseProviderModel("anthropic/claude-sonnet-4-5")).toEqual({
			providerID: "anthropic",
			modelID: "claude-sonnet-4-5",
		});
	});
});
