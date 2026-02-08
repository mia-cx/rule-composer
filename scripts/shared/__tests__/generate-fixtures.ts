/**
 * Generate golden fixture files for integration tests.
 *
 * Reads the sample AGENTS.md from fixtures/input/,
 * runs it through the decompose and compose pipelines,
 * and writes the outputs to fixtures/decompose-expected/ and fixtures/compose-expected/.
 *
 * Run with: pnpm tsx scripts/__tests__/generate-fixtures.ts
 */

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rm, mkdir, readdir } from "node:fs/promises";
import { splitByHeadings } from "../../decompose/splitter.js";
import { extractProseDescription, buildRawContent } from "../../decompose/index.js";
import { writeAsDirectory, writeAsSingleFile, readRule } from "../formats.js";
import { compose } from "../../compose/composer.js";
import type { RuleFile } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");
const INPUT_DIR = join(FIXTURES_DIR, "input");
const DECOMPOSE_DIR = join(FIXTURES_DIR, "decompose-expected");
const COMPOSE_DIR = join(FIXTURES_DIR, "compose-expected");

const main = async () => {
	console.log("Reading input AGENTS.md...");
	const inputContent = await readFile(join(INPUT_DIR, "AGENTS.md"), "utf-8");

	// 1. Decompose: split by headings
	const splits = splitByHeadings(inputContent);
	console.log(`Split into ${splits.length} sections: ${splits.map((s) => s.name).join(", ")}`);

	// 2. Build RuleFiles with frontmatter (cursor format)
	const ruleFiles: RuleFile[] = splits.map((split) => {
		const description = extractProseDescription(split.content);
		const rawContent = buildRawContent(split.content, description, true);

		return {
			path: "",
			name: split.name,
			description,
			body: split.content,
			rawContent,
			source: "cursor" as const,
			type: "rule" as const,
			hasPlaceholders: /\{\{\w+\}\}/.test(split.content),
		};
	});

	// 3. Write decompose expected output (cursor format with frontmatter)
	await rm(DECOMPOSE_DIR, { recursive: true, force: true });
	await mkdir(DECOMPOSE_DIR, { recursive: true });
	await writeAsDirectory(ruleFiles, DECOMPOSE_DIR, "cursor");

	const decomposeFiles = await readdir(DECOMPOSE_DIR);
	console.log(`Wrote ${decomposeFiles.length} files to decompose-expected/: ${decomposeFiles.join(", ")}`);

	// 4. Read back the written rule files (to get the exact content writeAsDirectory produced)
	const readBackRules: RuleFile[] = [];
	for (const file of decomposeFiles.filter((f) => f.endsWith(".mdc"))) {
		const rule = await readRule(join(DECOMPOSE_DIR, file), "cursor");
		readBackRules.push(rule);
	}

	// 5. Compose for cursor target
	await rm(COMPOSE_DIR, { recursive: true, force: true });
	await mkdir(COMPOSE_DIR, { recursive: true });

	const cursorResult = await compose(readBackRules, "cursor");
	await writeAsSingleFile(cursorResult.content, join(COMPOSE_DIR, "AGENTS.md"));
	console.log(`Wrote compose-expected/AGENTS.md (cursor, ${cursorResult.placeholderCount} placeholders resolved)`);

	// 6. Compose for claude target
	const claudeResult = await compose(readBackRules, "claude");
	await writeAsSingleFile(claudeResult.content, join(COMPOSE_DIR, "claude.md"));
	console.log(`Wrote compose-expected/claude.md (claude, ${claudeResult.placeholderCount} placeholders resolved)`);

	console.log("Done! Golden fixtures generated.");
};

main().catch((err) => {
	console.error("Failed to generate fixtures:", err);
	process.exit(1);
});
