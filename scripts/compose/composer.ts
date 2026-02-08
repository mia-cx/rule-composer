import matter from "gray-matter";
import { countTokens } from "gpt-tokenizer";
import type { RuleFile, ToolId } from "../shared/types.js";
import { resolvePlaceholders, quoteGlobs, formatMarkdown } from "../shared/formats.js";

/** Strip YAML frontmatter from a rule's raw content and return the body */
const stripFrontmatter = (rule: RuleFile): string => {
	if (rule.rawContent.startsWith("---")) {
		const parsed = matter(quoteGlobs(rule.rawContent));
		return parsed.content.trim();
	}
	return rule.body;
};

/** Increment all heading levels by one (# → ##, ## → ###, etc.), capping at H6 */
export const incrementHeadings = (content: string): string => {
	return content.replace(/^(#{1,5}) /gm, (_match, hashes: string) => {
		return `${hashes}# `;
	});
};

/** Inject a > [!globs] callout after the first heading for scoped rules */
export const injectGlobAnnotation = (body: string, globs?: string, alwaysApply?: boolean): string => {
	// Only annotate scoped rules (alwaysApply: false)
	if (alwaysApply !== false) return body;

	const annotation = globs ? `> [!globs] ${globs}` : `> [!globs]`;

	// Find first heading and inject after it
	const headingMatch = body.match(/^(#{1,6} .+)$/m);
	if (headingMatch) {
		return body.replace(headingMatch[0], `${headingMatch[0]}\n\n${annotation}`);
	}

	// No heading — prepend
	return `${annotation}\n\n${body}`;
};

/** Strip optional leading "N. " from heading text (e.g. "99. Rule Name" → "Rule Name"). */
const stripHeadingNumber = (heading: string): string => heading.replace(/^\d+\.\s+/, "");

/** Add sequential numbered prefixes (1., 2., 3., …) to all H2 headings by position; strips any existing N. prefix. */
export const addSectionNumbers = (content: string): string => {
	let counter = 0;
	return content.replace(/^## (.+)$/gm, (_match, heading) => {
		counter++;
		return `## ${counter}. ${stripHeadingNumber(heading)}`;
	});
};

/** Options for compose behavior */
export interface ComposeOptions {
	/** Add numbered prefixes (1. 2. 3.) to H2 section headings */
	numbered?: boolean;
	/** Increment all heading levels by one to avoid multiple H1s (default: true) */
	incrementHeadings?: boolean;
	/** Embed > [!globs] callouts for scoped rules (default: true) */
	embedGlobs?: boolean;
}

/** Compose selected rules into a single markdown document (Prettier-formatted). */
export const compose = async (
	selected: RuleFile[],
	targetTool: ToolId,
	options?: ComposeOptions,
): Promise<{ content: string; placeholderCount: number }> => {
	const shouldIncrement = options?.incrementHeadings !== false;
	const shouldEmbedGlobs = options?.embedGlobs !== false;
	let placeholderCount = 0;
	const sections: string[] = [];

	for (const rule of selected) {
		let body = stripFrontmatter(rule);

		const matches = body.match(/\{\{\w+\}\}/g);
		if (matches) {
			placeholderCount += matches.length;
		}

		body = resolvePlaceholders(body, targetTool);

		if (shouldIncrement) {
			body = incrementHeadings(body);
		}

		if (shouldEmbedGlobs) {
			body = injectGlobAnnotation(body, rule.globs, rule.alwaysApply);
		}

		sections.push(body);
	}

	let content = sections.join("\n\n");

	if (options?.numbered) {
		content = addSectionNumbers(content);
	}

	content = await formatMarkdown(content);
	return { content, placeholderCount };
};

/** OpenAI-style token count (gpt-tokenizer o200k_base). Display as ~ for other models. */
export const estimateTokens = (text: string): number => countTokens(text);
