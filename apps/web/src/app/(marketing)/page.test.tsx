import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { assert, describe, it } from "vitest";
import Page from "./page";

describe("marketing page", () => {
	it("renders the product message and structured data", () => {
		const html = renderToStaticMarkup(createElement(Page));

		assert.include(html, "A code review agent");
		assert.include(html, 'type="application/ld+json"');
		assert.include(html, '"name":"Skopeo"');
	});
});
