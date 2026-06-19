import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function renderUserPrompt(template: string, target: string) {
	const [status, diff] = await Promise.all([git(["status", "--short"], target), git(["diff", "--stat"], target)]);
	return interpolate(template, {
		target,
		git_status: status.trim() || "No git status output.",
		git_diff_stat: diff.trim() || "No local git diff stat.",
	});
}

function interpolate(template: string, values: Record<string, string>) {
	return template.replace(/\{\{([a-z_]+)\}\}/g, (match, key: string) => values[key] ?? match);
}

async function git(args: string[], cwd: string) {
	try {
		const result = await execFileAsync("git", args, {
			cwd,
			maxBuffer: 1024 * 1024,
		});
		return result.stdout;
	} catch (error) {
		if (isExecError(error)) {
			return error.stderr || error.stdout || error.message;
		}
		throw error;
	}
}

function isExecError(error: unknown): error is Error & { stdout?: string; stderr?: string } {
	return error instanceof Error;
}
