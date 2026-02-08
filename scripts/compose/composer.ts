import matter from "gray-matter";
import type { RuleFile, ToolId } from "../shared/types.js";
import { resolvePlaceholders } from "../shared/formats.js";

/** Strip YAML frontmatter from a rule's raw content and return the body */
const stripFrontmatter = (rule: RuleFile): string => {
  if (rule.rawContent.startsWith("---")) {
    const parsed = matter(rule.rawContent);
    return parsed.content.trim();
  }
  return rule.body;
};

/** Add numbered prefixes to H2 headings that aren't already numbered */
export const addSectionNumbers = (content: string): string => {
  let counter = 0;
  return content.replace(/^## (?!\d+\.\s)(.+)$/gm, (_match, heading) => {
    counter++;
    return `## ${counter}. ${heading}`;
  });
};

/** Options for compose behavior */
export interface ComposeOptions {
  /** Add numbered prefixes (1. 2. 3.) to H2 section headings */
  numbered?: boolean;
}

/** Compose selected rules into a single markdown document */
export const compose = (
  selected: RuleFile[],
  targetTool: ToolId,
  options?: ComposeOptions,
): { content: string; placeholderCount: number } => {
  let placeholderCount = 0;
  const sections: string[] = [];

  for (const rule of selected) {
    let body = stripFrontmatter(rule);

    // Count and resolve placeholders
    const matches = body.match(/\{\{\w+\}\}/g);
    if (matches) {
      placeholderCount += matches.length;
    }

    body = resolvePlaceholders(body, targetTool);
    sections.push(body);
  }

  let content = sections.join("\n\n");

  if (options?.numbered) {
    content = addSectionNumbers(content);
  }

  return { content, placeholderCount };
};

/** Rough token estimate: words * 1.3 */
export const estimateTokens = (text: string): number => {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(wordCount * 1.3);
};
