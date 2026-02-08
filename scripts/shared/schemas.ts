import { z } from "zod";

/** OpenRouter API response structure */
export const openRouterResponseSchema = z.object({
	id: z.string(),
	choices: z.array(
		z.object({
			message: z.object({
				content: z.string(),
			}),
			finish_reason: z.string().nullable(),
		}),
	),
	usage: z
		.object({
			prompt_tokens: z.number(),
			completion_tokens: z.number(),
			total_tokens: z.number(),
		})
		.optional(),
});

export type OpenRouterResponse = z.infer<typeof openRouterResponseSchema>;

/** Validates that LLM-optimized output is sane markdown */
export const optimizedOutputSchema = z
	.string()
	.min(50, "Optimized output too short")
	.refine((s) => s.includes("#"), "Optimized output must contain headings")
	.refine((s) => !s.includes("```json"), "Optimized output should be markdown, not JSON");

/** .mdc frontmatter fields */
export const ruleFrontmatterSchema = z.object({
	description: z.string().optional(),
	alwaysApply: z.boolean().optional(),
	globs: z.union([z.string(), z.array(z.string())]).optional(),
});

export type RuleFrontmatter = z.infer<typeof ruleFrontmatterSchema>;

/** Decompose LLM response schema — metadata-only (no content) */
export const decomposeResponseSchema = z.array(
	z.object({
		name: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Name must be kebab-case"),
		description: z.string().min(5, "Description too short"),
		headings: z.array(z.string()).min(1, "Must reference at least one heading"),
		directory: z
			.string()
			.regex(/^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*$/, "Directory must be kebab-case path segments")
			.optional(),
	}),
);

export type DecomposeResponse = z.infer<typeof decomposeResponseSchema>;
