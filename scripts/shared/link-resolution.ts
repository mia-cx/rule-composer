/**
 * Link resolution for compose (relative → hash) and decompose (hash → relative).
 * Transforms cross-references so they work in both composed single-file output
 * and decomposed modular rules.
 */

/** Match markdown links to rule files: [text](./NN-slug.ext) or [text](NN-slug.ext) */
const RELATIVE_LINK_RE = /\[([^\]]+)\]\((\.\/)?(\d{2})-([a-z0-9-]+)\.(mdc|md)\)/gi;

/** Match markdown hash links: [text](#N-slug) or [text](#N. Title) */
const HASH_LINK_RE = /\[([^\]]+)\]\(#(\d+)[-.]([^)]+)\)/g;

/**
 * Resolve relative rule links to hash anchors for composed single-file output.
 * Map key = rule basename (e.g. "06-rules-and-skills"), value = section number (1-based).
 */
export const resolveRelativeToHash = (content: string, sectionMap: Map<string, number>): string => {
	return content.replace(RELATIVE_LINK_RE, (_, text, prefix, nn, slug, ext) => {
		const ruleName = `${nn}-${slug}`;
		const sectionNum = sectionMap.get(ruleName);
		if (sectionNum === undefined) return `[${text}](${prefix ?? ""}${nn}-${slug}.${ext})`;
		const hashSlug = `${sectionNum}-${slug}`;
		return `[${text}](#${hashSlug})`;
	});
};

/**
 * Resolve hash anchors to relative rule links for decomposed modular output.
 * Map key = section number (1-based), value = output filename including extension
 * (e.g. "06-rules-and-skills.mdc").
 */
export const resolveHashToRelative = (content: string, sectionMap: Map<number, string>): string => {
	return content.replace(HASH_LINK_RE, (_, text, nStr, slugOrTitle) => {
		const sectionNum = parseInt(nStr, 10);
		const filename = sectionMap.get(sectionNum);
		if (!filename) return `[${text}](#${nStr}-${slugOrTitle})`;
		return `[${text}](./${filename})`;
	});
};
