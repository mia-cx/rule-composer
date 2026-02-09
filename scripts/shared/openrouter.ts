import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openRouterResponseSchema, optimizedOutputSchema } from "./schemas.js";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-sonnet-4";

/** Message format for the LLM API */
export interface LLMMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

/** Get API key from environment */
export const getApiKey = (): string | null => {
	return process.env["OPENROUTER_API_KEY"] ?? null;
};

/**
 * Resolve prompt .md files relative to the package root.
 * Works both in dev (tsx) and published (dist/) contexts.
 */
export const resolvePromptPath = (relPath: string): string => {
	const __dirname = dirname(fileURLToPath(import.meta.url));
	// Try dev path first: scripts/shared/ -> scripts/<relPath>
	const devPath = resolve(__dirname, "..", relPath);
	// Published path: dist/ -> scripts/<relPath>
	const _publishedPath = resolve(__dirname, "..", "scripts", relPath);

	// Return dev path by default (more common during development)
	return devPath;
};

/**
 * Low-level LLM API call. Sends messages to OpenRouter and returns
 * the raw message content string. No domain-specific validation.
 */
export const callLLM = async (
	messages: LLMMessage[],
	apiKey: string,
): Promise<{ content: string | null; error?: string }> => {
	try {
		const response = await fetch(OPENROUTER_API_URL, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
				"HTTP-Referer": "https://github.com/mia-cx/agents",
				"X-Title": "rule-composer",
			},
			body: JSON.stringify({
				model: DEFAULT_MODEL,
				messages,
				temperature: 0.3,
				max_tokens: 4096,
			}),
		});

		if (!response.ok) {
			const text = await response.text();
			return { content: null, error: `API error ${response.status}: ${text}` };
		}

		const json = await response.json();
		const parsed = openRouterResponseSchema.safeParse(json);

		if (!parsed.success) {
			return {
				content: null,
				error: `Invalid API response: ${parsed.error.message}`,
			};
		}

		const messageContent = parsed.data.choices[0]?.message.content;
		if (!messageContent) {
			return { content: null, error: "Empty response from API" };
		}

		return { content: messageContent };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { content: null, error: `API call failed: ${message}` };
	}
};

/**
 * Call OpenRouter API for rule optimization (compose flow).
 * Reads a system prompt from a file, sends it with the content,
 * and validates the output as markdown.
 */
export const optimize = async (
	content: string,
	apiKey: string,
	promptPath: string,
): Promise<{ optimized: string | null; error?: string }> => {
	let systemPrompt: string;
	try {
		systemPrompt = await readFile(promptPath, "utf-8");
	} catch {
		return {
			optimized: null,
			error: `Failed to read prompt file: ${promptPath}`,
		};
	}

	const result = await callLLM(
		[
			{ role: "system", content: systemPrompt },
			{ role: "user", content },
		],
		apiKey,
	);

	if (!result.content) {
		return { optimized: null, error: result.error };
	}

	// Validate the optimized output as markdown
	const validated = optimizedOutputSchema.safeParse(result.content);
	if (!validated.success) {
		return {
			optimized: null,
			error: `Optimized output validation failed: ${validated.error.message}`,
		};
	}

	return { optimized: validated.data };
};
