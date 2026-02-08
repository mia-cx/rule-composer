export interface SplitResult {
	name: string;
	description: string;
	content: string;
	/** Optional subdirectory for grouping (AI-assisted only) */
	directory?: string;
}

/** Strip a leading number prefix (e.g. "1. " or "03. ") from a heading */
export const stripHeadingNumber = (heading: string): string => {
	return heading.replace(/^\d+\.\s+/, "");
};

/**
 * Split a markdown document on H2 (##) boundaries.
 * Each H2 section becomes a separate rule.
 * H3+ subsections stay with their parent H2.
 * Numbered prefixes (e.g. "## 1. Approach") are stripped from both
 * the filename and the content heading.
 */
export const splitByHeadings = (markdown: string): SplitResult[] => {
	const lines = markdown.split("\n");
	const sections: SplitResult[] = [];

	let currentName = "";
	let currentLines: string[] = [];
	let foundFirstH2 = false;

	// Collect any preamble (content before first H2) as its own section
	const preambleLines: string[] = [];

	for (const line of lines) {
		const h2Match = line.match(/^## (.+)$/);

		if (h2Match) {
			// Save previous section
			if (foundFirstH2 && currentName) {
				sections.push(finishSection(currentName, currentLines));
			} else if (!foundFirstH2 && preambleLines.length > 0) {
				// Check if preamble has meaningful content (not just blank lines / H1)
				const meaningfulPreamble = preambleLines.filter((l) => l.trim() && !l.startsWith("# "));
				if (meaningfulPreamble.length > 0) {
					sections.push(finishSection("preamble", preambleLines));
				}
			}

			foundFirstH2 = true;
			const rawHeading = h2Match[1]!;
			const strippedHeading = stripHeadingNumber(rawHeading);
			currentName = toKebabCase(strippedHeading);
			// Store the heading line with the number stripped
			currentLines = [`## ${strippedHeading}`];
		} else if (foundFirstH2) {
			currentLines.push(line);
		} else {
			preambleLines.push(line);
		}
	}

	// Don't forget the last section
	if (currentName) {
		sections.push(finishSection(currentName, currentLines));
	}

	// If no H2 was ever found, check preamble for meaningful content
	if (!foundFirstH2 && preambleLines.length > 0) {
		const meaningfulPreamble = preambleLines.filter((l) => l.trim() && !l.startsWith("# "));
		if (meaningfulPreamble.length > 0) {
			sections.push(finishSection("preamble", preambleLines));
		}
	}

	return sections;
};

/** Convert heading text to kebab-case file name */
const toKebabCase = (text: string): string => {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
};

/** Finalize a section into a SplitResult */
const finishSection = (name: string, lines: string[]): SplitResult => {
	const content = lines.join("\n").trim();

	// Extract description: first non-heading, non-empty line
	const descLine = lines.find((l) => l.trim() && !l.startsWith("#") && !l.startsWith("---"));
	const description = descLine ? descLine.trim().slice(0, 120) : `Rules from the "${name}" section`;

	return { name, description, content };
};
