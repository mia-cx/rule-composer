import type { DecomposeResponse } from "../shared/schemas.js";
import type { SplitResult } from "./splitter.js";

/** Special key for content before the first H2 heading */
export const PREAMBLE_KEY = "__preamble__";

/**
 * Parse a markdown document into a map of H2 heading text to section content.
 * Preamble (content before first H2) is stored under `__preamble__`.
 */
export const parseHeadingMap = (markdown: string): Map<string, string> => {
	const lines = markdown.split("\n");
	const map = new Map<string, string>();

	let currentHeading = "";
	let currentLines: string[] = [];
	let foundFirstH2 = false;
	const preambleLines: string[] = [];

	for (const line of lines) {
		const h2Match = line.match(/^## (.+)$/);

		if (h2Match) {
			// Save previous section
			if (foundFirstH2 && currentHeading) {
				map.set(currentHeading, currentLines.join("\n").trim());
			} else if (!foundFirstH2 && preambleLines.length > 0) {
				const meaningful = preambleLines.filter((l) => l.trim() && !l.startsWith("# "));
				if (meaningful.length > 0) {
					map.set(PREAMBLE_KEY, preambleLines.join("\n").trim());
				}
			}

			foundFirstH2 = true;
			currentHeading = h2Match[1]!;
			currentLines = [line];
		} else if (foundFirstH2) {
			currentLines.push(line);
		} else {
			preambleLines.push(line);
		}
	}

	// Last section
	if (currentHeading) {
		map.set(currentHeading, currentLines.join("\n").trim());
	}

	// If no H2 was found, check preamble
	if (!foundFirstH2 && preambleLines.length > 0) {
		const meaningful = preambleLines.filter((l) => l.trim() && !l.startsWith("# "));
		if (meaningful.length > 0) {
			map.set(PREAMBLE_KEY, preambleLines.join("\n").trim());
		}
	}

	return map;
};

/** Warnings produced during reconstruction */
export interface ReconstructWarning {
	type: "unmatched-heading" | "unclaimed-section";
	rule?: string;
	heading: string;
}

/**
 * Reconstruct SplitResult[] from the source markdown using AI-provided
 * heading references. Content is always copied from the original source,
 * never from the LLM response.
 */
export const reconstructFromHeadings = (
	markdown: string,
	rules: DecomposeResponse,
): { splits: SplitResult[]; warnings: ReconstructWarning[] } => {
	const headingMap = parseHeadingMap(markdown);
	const warnings: ReconstructWarning[] = [];
	const claimedHeadings = new Set<string>();

	const splits: SplitResult[] = [];

	for (const rule of rules) {
		const sections: string[] = [];

		for (const heading of rule.headings) {
			const content = headingMap.get(heading);
			if (content) {
				sections.push(content);
				claimedHeadings.add(heading);
			} else {
				warnings.push({
					type: "unmatched-heading",
					rule: rule.name,
					heading,
				});
			}
		}

		if (sections.length > 0) {
			splits.push({
				name: rule.name,
				description: rule.description,
				content: sections.join("\n\n"),
				directory: rule.directory,
			});
		}
	}

	// Check for unclaimed sections
	for (const [heading] of headingMap) {
		if (!claimedHeadings.has(heading)) {
			warnings.push({
				type: "unclaimed-section",
				heading,
			});
		}
	}

	return { splits, warnings };
};
