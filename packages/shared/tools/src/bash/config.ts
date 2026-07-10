export const DEFAULT_BASH_TIMEOUT_MS = 30_000;
/**
 * Maximum time in milliseconds that the bash tool will wait for a command to complete.
 * This is the maximum value the agent can call the tool with. The agent will not be able to
 * call the tool with a timeout value greater than this.
 */
export const MAXIMUM_BASH_TIMEOUT_MS = 120_000;
export const BASH_FORCE_KILL_AFTER_MS = 1_000;
