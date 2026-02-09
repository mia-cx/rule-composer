import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFile, readdir, mkdir, rm, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { splitByHeadings } from "../../decompose/splitter.js";
import { extractProseDescription, buildRawContent } from "../../decompose/index.js";
import { reconstructFromHeadings } from "../../decompose/matcher.js";
import { extractSectionMetadata } from "../formats.js";
import { readRule, writeAsDirectory } from "../formats.js";
import { resolveHashToRelative } from "../link-resolution.js";
import { compose, estimateTokens } from "../../compose/composer.js";
import type { RuleFile } from "../types.js";
import type { DecomposeResponse } from "../schemas.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures");
const INPUT_FILE = join(FIXTURES, "input", "AGENTS.md");
const DECOMPOSE_EXPECTED = join(FIXTURES, "decompose-expected");
const COMPOSE_EXPECTED = join(FIXTURES, "compose-expected");

/** Read input fixture */
const getInput = async () => readFile(INPUT_FILE, "utf-8");

/** Read a golden file */
const readGolden = async (dir: string, file: string) => readFile(join(dir, file), "utf-8");

/** Golden decompose rules: use decompose-expected/rules/ if present, else flat decompose-expected/ (legacy). */
const getGoldenRulesDir = async () => {
	const withRules = join(DECOMPOSE_EXPECTED, "rules");
	try {
		await access(withRules);
		return withRules;
	} catch {
		return DECOMPOSE_EXPECTED;
	}
};

describe("decompose integration", () => {
	const tmpDir = join(tmpdir(), "arc-integration-decompose");

	beforeAll(async () => {
		await rm(tmpDir, { recursive: true, force: true });
		await mkdir(tmpDir, { recursive: true });
	});

	afterAll(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	it("splits the sample AGENTS.md into expected sections and each split contains its heading", async () => {
		const input = await getInput();
		const splits = splitByHeadings(input);

		expect(splits).toHaveLength(5);
		expect(splits.map((s) => s.name)).toEqual([
			"preamble",
			"approach",
			"coding-conventions",
			"technology-preferences",
			"communication",
		]);
		expect(splits[1]!.content).toContain("## Approach");
		expect(splits[2]!.content).toContain("## Coding Conventions");
		expect(splits[3]!.content).toContain("## Technology Preferences");
		expect(splits[4]!.content).toContain("## Communication");
	});

	it("extracts prose descriptions for prose sections, empty for table sections", async () => {
		const input = await getInput();
		const splits = splitByHeadings(input);

		// preamble starts with prose
		expect(extractProseDescription(splits[0]!.content)).toContain("These rules define conventions");

		// approach starts with prose
		expect(extractProseDescription(splits[1]!.content)).toContain("Plan first");

		// coding-conventions starts with prose
		expect(extractProseDescription(splits[2]!.content)).toContain("Use consistent patterns");

		// technology-preferences starts with a table
		expect(extractProseDescription(splits[3]!.content)).toBe("");

		// communication starts with prose
		expect(extractProseDescription(splits[4]!.content)).toContain("Be concise");
	});

	it("buildRawContent generates correct frontmatter based on content type", async () => {
		const input = await getInput();
		const splits = splitByHeadings(input);

		// Prose section gets description
		const proseRaw = buildRawContent(splits[1]!.content, "Plan first.", true);
		expect(proseRaw).toContain("alwaysApply: true");
		expect(proseRaw).toContain("description:");

		// Table section omits description
		const tableRaw = buildRawContent(splits[3]!.content, "", true);
		expect(tableRaw).toContain("alwaysApply: true");
		expect(tableRaw).not.toContain("description:");
	});

	it("writeAsDirectory produces files matching golden fixtures", async () => {
		const input = await getInput();
		const splits = splitByHeadings(input);

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

		await writeAsDirectory(ruleFiles, tmpDir, "cursor");

		// Compare each file against golden (written to tmpDir/rules/ in canonical layout; golden in decompose-expected/rules/ or flat legacy)
		const goldenRulesDir = await getGoldenRulesDir();
		const expectedFiles = (await readdir(goldenRulesDir)).filter((f) => f.endsWith(".mdc"));
		const rulesDir = join(tmpDir, "rules");

		for (const file of expectedFiles) {
			const actual = await readFile(join(rulesDir, file), "utf-8");
			const expected = await readFile(join(goldenRulesDir, file), "utf-8");
			expect(actual).toBe(expected);
		}
	});
});

describe("compose integration", () => {
	let rules: RuleFile[];

	beforeAll(async () => {
		const goldenRulesDir = await getGoldenRulesDir();
		const files = (await readdir(goldenRulesDir)).filter((f) => f.endsWith(".mdc"));
		rules = [];
		for (const file of files) {
			const rule = await readRule(join(goldenRulesDir, file), "cursor");
			rules.push(rule);
		}
	});

	it("compose matches golden output for cursor and claude", async () => {
		const cursorResult = await compose(rules, "cursor");
		expect(cursorResult.content).toBe(await readGolden(COMPOSE_EXPECTED, "AGENTS.md"));
		const claudeResult = await compose(rules, "claude");
		expect(claudeResult.content).toBe(await readGolden(COMPOSE_EXPECTED, "claude.md"));
	});

	it("tool-specific compose output: cursor strips frontmatter and resolves placeholders; claude removes empty-value lines", async () => {
		const cursorResult = await compose(rules, "cursor");
		expect(cursorResult.content.startsWith("---")).toBe(false);
		expect(cursorResult.content).toContain(".cursor/rules/");
		expect(cursorResult.content).not.toContain("{{RULES_DIR}}");

		const claudeResult = await compose(rules, "claude");
		expect(claudeResult.content).toContain("Claude Code");
		expect(claudeResult.content).not.toContain("{{TOOL_NAME}}");
		expect(claudeResult.content).not.toContain("{{SKILLS_DIR}}");
		expect(claudeResult.content).not.toContain("reusable workflows");
	});

	it("reports placeholder count and reasonable token estimate", async () => {
		const result = await compose(rules, "cursor");
		expect(result.placeholderCount).toBeGreaterThan(0);

		const tokens = estimateTokens(result.content);
		expect(tokens).toBeGreaterThan(0);
		// OpenAI-style tokens; may exceed char count for symbol-heavy content
		expect(tokens).toBeLessThanOrEqual(Math.max(result.content.length * 2, 1));
	});
});

describe("reconstruct integration", () => {
	it("reconstructs all sections with no unmatched warnings", async () => {
		const input = await getInput();

		const metadata: DecomposeResponse = [
			{
				name: "approach",
				description: "General approach to tasks",
				headings: ["Approach"],
			},
			{
				name: "coding-conventions",
				description: "Code style and patterns",
				headings: ["Coding Conventions"],
			},
			{
				name: "technology-preferences",
				description: "Technology stack choices",
				headings: ["Technology Preferences"],
			},
			{
				name: "communication",
				description: "Communication style guidelines",
				headings: ["Communication"],
			},
		];

		const { splits, warnings } = reconstructFromHeadings(input, metadata);

		expect(splits).toHaveLength(4);
		const unmatched = warnings.filter((w) => w.type === "unmatched-heading");
		expect(unmatched).toHaveLength(0);
	});

	it("cross-heading grouping merges sections", async () => {
		const input = await getInput();

		const metadata: DecomposeResponse = [
			{
				name: "code-and-style",
				description: "Coding and communication rules",
				headings: ["Coding Conventions", "Communication"],
			},
		];

		const { splits } = reconstructFromHeadings(input, metadata);

		expect(splits).toHaveLength(1);
		expect(splits[0]!.content).toContain("## Coding Conventions");
		expect(splits[0]!.content).toContain("## Communication");
		expect(splits[0]!.content).toContain("kebab-case");
		expect(splits[0]!.content).toContain("Be concise");
	});

	it("includes preamble via __preamble__", async () => {
		const input = await getInput();

		const metadata: DecomposeResponse = [
			{
				name: "overview",
				description: "Project overview and intro",
				headings: ["__preamble__"],
			},
		];

		const { splits } = reconstructFromHeadings(input, metadata);

		expect(splits).toHaveLength(1);
		expect(splits[0]!.content).toContain("Sample Project Rules");
	});

	it("warns about unclaimed sections", async () => {
		const input = await getInput();

		// Only claim Approach — everything else is unclaimed
		const metadata: DecomposeResponse = [
			{
				name: "approach",
				description: "General approach to tasks",
				headings: ["Approach"],
			},
		];

		const { warnings } = reconstructFromHeadings(input, metadata);

		const unclaimed = warnings.filter((w) => w.type === "unclaimed-section");
		expect(unclaimed.length).toBeGreaterThanOrEqual(3);
		expect(unclaimed.map((w) => w.heading)).toContain("Coding Conventions");
		expect(unclaimed.map((w) => w.heading)).toContain("Technology Preferences");
		expect(unclaimed.map((w) => w.heading)).toContain("Communication");
	});

	it("passes directory field through to splits", async () => {
		const input = await getInput();

		const metadata: DecomposeResponse = [
			{
				name: "approach",
				description: "General approach to tasks",
				headings: ["Approach"],
				directory: "core",
			},
		];

		const { splits } = reconstructFromHeadings(input, metadata);

		expect(splits[0]!.directory).toBe("core");
	});
});

describe("link resolution round-trip", () => {
	const tmpDir = join(tmpdir(), "arc-integration-link-roundtrip");

	beforeAll(async () => {
		await rm(tmpDir, { recursive: true, force: true });
		await mkdir(tmpDir, { recursive: true });
	});

	afterAll(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	it("compose → decompose → compose preserves link semantics (relative ↔ hash)", async () => {
		// 1. Start with rules that have relative links
		const rulesWithLinks: RuleFile[] = [
			{
				path: "",
				name: "01-approach",
				description: "Plan first",
				body: "## Approach\n\nPlan first.",
				rawContent: "---\ndescription: Plan first\n---\n\n## Approach\n\nPlan first.",
				source: "cursor",
				type: "rule",
				hasPlaceholders: false,
			},
			{
				path: "",
				name: "02-conventions",
				description: "Coding conventions",
				body: "## Conventions\n\nUse early returns.",
				rawContent: "---\ndescription: Coding conventions\n---\n\n## Conventions\n\nUse early returns.",
				source: "cursor",
				type: "rule",
				hasPlaceholders: false,
			},
			{
				path: "",
				name: "03-rules-and-skills",
				description: "Rules and skills",
				body: "## Rules and Skills\n\nSee [Approach](./01-approach.mdc) and [Conventions](./02-conventions.mdc).",
				rawContent:
					"---\ndescription: Rules and skills\n---\n\n## Rules and Skills\n\nSee [Approach](./01-approach.mdc) and [Conventions](./02-conventions.mdc).",
				source: "cursor",
				type: "rule",
				hasPlaceholders: false,
			},
		];

		// 2. Compose → hash links in output (incrementHeadings: false so splitByHeadings sees H2)
		const { content: composed } = await compose(rulesWithLinks, "cursor", {
			numbered: true,
			incrementHeadings: false,
		});
		expect(composed).toContain("[Approach](#1-approach)");
		expect(composed).toContain("[Conventions](#2-conventions)");
		expect(composed).not.toContain("./01-approach.mdc");

		// 3. Decompose (split) → apply hash→relative
		const splits = splitByHeadings(composed);
		const ext = ".mdc";
		const sectionMap = new Map<number, string>();
		splits.forEach((split, i) => {
			const prefix = `${String(i + 1).padStart(2, "0")}-`;
			sectionMap.set(i + 1, `${prefix}${split.name}${ext}`);
		});

		const ruleFiles: RuleFile[] = splits.map((split) => {
			const {
				content: cleaned,
				description: metaDesc,
				globs,
				alwaysApply,
			} = extractSectionMetadata(split.content);
			const cleanContent = resolveHashToRelative(cleaned, sectionMap);
			const description = metaDesc ?? extractProseDescription(cleanContent);
			const rawContent = buildRawContent(cleanContent, description, true, { globs, alwaysApply });
			return {
				path: "",
				name: split.name,
				description,
				body: cleanContent,
				rawContent,
				source: "cursor" as const,
				type: "rule" as const,
				hasPlaceholders: /\{\{\w+\}\}/.test(cleanContent),
			};
		});

		// 4. Verify decomposed content has relative links
		const rulesSection = ruleFiles.find((r) => r.name === "rules-and-skills");
		expect(rulesSection).toBeDefined();
		expect(rulesSection!.body).toContain("[Approach](./01-approach.mdc)");
		expect(rulesSection!.body).toContain("[Conventions](./02-conventions.mdc)");

		// 5. Write decomposed files, read back, compose → hash links restored
		// (readRule yields rule.name from filename, e.g. "01-approach", so sectionMap matches link targets)
		await writeAsDirectory(ruleFiles, tmpDir, "cursor", { numbered: true });
		const rulesOutDir = join(tmpDir, "rules");
		const decomposedFiles = (await readdir(rulesOutDir)).filter((f) => f.endsWith(".mdc"));
		const rulesFromDisk: RuleFile[] = [];
		for (const file of decomposedFiles.sort()) {
			rulesFromDisk.push(await readRule(join(rulesOutDir, file), "cursor"));
		}

		const { content: recomposed } = await compose(rulesFromDisk, "cursor", {
			numbered: true,
			incrementHeadings: false,
		});
		expect(recomposed).toContain("[Approach](#1-approach)");
		expect(recomposed).toContain("[Conventions](#2-conventions)");
	});
});
