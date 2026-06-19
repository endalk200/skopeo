import { describe, expect, test } from "bun:test";

import { type ReviewArtifact, summarizeArtifact } from "./opencode.js";

describe("summarizeArtifact", () => {
	test("counts tool and text events", () => {
		const summary = summarizeArtifact({
			promptResult: { ok: true },
			messages: { ok: true, status: 200 },
			events: [
				{ type: "session.next.tool.called", tool: "grep", raw: {} },
				{ type: "session.next.tool.success", tool: "grep", raw: {} },
				{ type: "session.next.text.delta", delta: "hello", raw: {} },
			],
		} satisfies Pick<ReviewArtifact, "events" | "messages" | "promptResult" | "error">);

		expect(summary.ok).toBe(true);
		expect(summary.toolCallCount).toBe(2);
		expect(summary.toolNames).toEqual(["grep"]);
		expect(summary.textEventCount).toBe(1);
	});
});
