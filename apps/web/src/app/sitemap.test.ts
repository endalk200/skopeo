import { describe, expect, it } from "vitest";
import { site } from "@/config/site";
import sitemap from "./sitemap";

describe("sitemap", () => {
	it("uses only source-backed stable metadata", () => {
		expect(sitemap()).toEqual([
			{
				url: site.url,
				changeFrequency: "weekly",
				priority: 1,
			},
		]);
	});
});
