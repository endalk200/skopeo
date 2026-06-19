export default {
	description: "Return context about the current OpenCode review session and worktree.",
	args: {},
	async execute(_args: Record<string, never>, context: Record<string, unknown>) {
		return JSON.stringify(
			{
				agent: context.agent,
				sessionID: context.sessionID,
				messageID: context.messageID,
				directory: context.directory,
				worktree: context.worktree,
			},
			null,
			2,
		);
	},
};
