import { describe, it, expect } from "vitest";
import { buildTree, buildCategoryTree, getSelectedRules, getSelectedCategoryIds } from "../tree-prompt.js";
import type { DiscoveredSource, RuleFile, TreeNode } from "../types.js";

const makeRule = (name: string, path: string): RuleFile => ({
	path,
	name,
	description: `${name} description`,
	body: `# ${name}`,
	rawContent: `# ${name}`,
	source: "agents-repo",
	type: "rule",
	hasPlaceholders: false,
});

const makeSource = (id: string, rules: RuleFile[]): DiscoveredSource => ({
	id: id as DiscoveredSource["id"],
	label: `${id} (${rules.length} files)`,
	rules,
});

describe("buildTree", () => {
	it("creates root nodes for each source", () => {
		const sources = [
			makeSource("agents-repo", [makeRule("approach", "/rules/approach.mdc")]),
			makeSource("cursor", [makeRule("coding", "/.cursor/rules/coding.mdc")]),
		];

		const tree = buildTree(sources);
		expect(tree).toHaveLength(2);
		expect(tree[0]!.isDirectory).toBe(true);
		expect(tree[0]!.id).toBe("source:agents-repo");
		expect(tree[1]!.id).toBe("source:cursor");
	});

	it("creates children for each rule", () => {
		const sources = [
			makeSource("agents-repo", [
				makeRule("approach", "/rules/approach.mdc"),
				makeRule("coding", "/rules/coding.mdc"),
			]),
		];

		const tree = buildTree(sources);
		expect(tree[0]!.children).toHaveLength(2);
		expect(tree[0]!.children![0]!.label).toBe("approach");
		expect(tree[0]!.children![1]!.label).toBe("coding");
	});

	it("defaults sources to collapsed and all nodes to selected", () => {
		const sources = [makeSource("agents-repo", [makeRule("rule", "/rules/rule.mdc")])];

		const tree = buildTree(sources);
		expect(tree[0]!.expanded).toBe(false);
		expect(tree[0]!.selected).toBe(true);
		expect(tree[0]!.children![0]!.selected).toBe(true);
	});

	it("attaches ruleFile and hint to leaf nodes", () => {
		const rule = makeRule("approach", "/rules/approach.mdc");
		const sources = [makeSource("agents-repo", [rule])];

		const tree = buildTree(sources);
		expect(tree[0]!.children![0]!.ruleFile).toBe(rule);
		expect(tree[0]!.children![0]!.hint).toBe("approach description");
	});

	it("handles empty sources", () => {
		const tree = buildTree([]);
		expect(tree).toHaveLength(0);
	});

	it("creates intermediate directory nodes for subdirectories", () => {
		const sources = [
			makeSource("agents-repo", [
				makeRule("approach", "/rules/approach.mdc"),
				makeRule("unit", "/rules/testing/unit.mdc"),
				makeRule("integration", "/rules/testing/integration.mdc"),
			]),
		];

		const tree = buildTree(sources);
		const root = tree[0]!;
		// Root should have 2 children: "approach" leaf + "testing" directory
		expect(root.children).toHaveLength(2);

		const leaf = root.children!.find((c) => !c.isDirectory);
		expect(leaf!.label).toBe("approach");

		const dir = root.children!.find((c) => c.isDirectory);
		expect(dir!.label).toBe("testing");
		expect(dir!.expanded).toBe(false);
		expect(dir!.children).toHaveLength(2);
		expect(dir!.children![0]!.label).toBe("unit");
		expect(dir!.children![1]!.label).toBe("integration");
	});
});

describe("getSelectedRules", () => {
	it("returns all rules when all selected", () => {
		const rule1 = makeRule("a", "/a.mdc");
		const rule2 = makeRule("b", "/b.mdc");

		const tree: TreeNode[] = [
			{
				id: "source:test",
				label: "test",
				isDirectory: true,
				expanded: true,
				selected: true,
				children: [
					{
						id: "/a.mdc",
						label: "a",
						isDirectory: false,
						expanded: true,
						selected: true,
						ruleFile: rule1,
					},
					{
						id: "/b.mdc",
						label: "b",
						isDirectory: false,
						expanded: true,
						selected: true,
						ruleFile: rule2,
					},
				],
			},
		];

		const selected = getSelectedRules(tree);
		expect(selected).toHaveLength(2);
		expect(selected).toContain(rule1);
		expect(selected).toContain(rule2);
	});

	it("returns only selected rules", () => {
		const rule1 = makeRule("a", "/a.mdc");
		const rule2 = makeRule("b", "/b.mdc");

		const tree: TreeNode[] = [
			{
				id: "source:test",
				label: "test",
				isDirectory: true,
				expanded: true,
				selected: true,
				children: [
					{
						id: "/a.mdc",
						label: "a",
						isDirectory: false,
						expanded: true,
						selected: true,
						ruleFile: rule1,
					},
					{
						id: "/b.mdc",
						label: "b",
						isDirectory: false,
						expanded: true,
						selected: false,
						ruleFile: rule2,
					},
				],
			},
		];

		const selected = getSelectedRules(tree);
		expect(selected).toHaveLength(1);
		expect(selected[0]).toBe(rule1);
	});

	it("returns empty array when none selected", () => {
		const tree: TreeNode[] = [
			{
				id: "source:test",
				label: "test",
				isDirectory: true,
				expanded: true,
				selected: false,
				children: [
					{
						id: "/a.mdc",
						label: "a",
						isDirectory: false,
						expanded: true,
						selected: false,
					},
				],
			},
		];

		const selected = getSelectedRules(tree);
		expect(selected).toHaveLength(0);
	});

	it("handles nested directories and empty tree", () => {
		const rule = makeRule("deep", "/deep.mdc");

		const tree: TreeNode[] = [
			{
				id: "root",
				label: "root",
				isDirectory: true,
				expanded: true,
				selected: true,
				children: [
					{
						id: "sub",
						label: "sub",
						isDirectory: true,
						expanded: true,
						selected: true,
						children: [
							{
								id: "/deep.mdc",
								label: "deep",
								isDirectory: false,
								expanded: true,
								selected: true,
								ruleFile: rule,
							},
						],
					},
				],
			},
		];

		const selected = getSelectedRules(tree);
		expect(selected).toHaveLength(1);
		expect(selected[0]).toBe(rule);

		// Empty tree
		expect(getSelectedRules([])).toHaveLength(0);
	});
});

describe("buildCategoryTree", () => {
	it("returns one node per category with no children and selected true", () => {
		const tree = buildCategoryTree([
			{ id: "rules", label: "Rules" },
			{ id: "skills", label: "Skills", hint: "Optional hint" },
		]);
		expect(tree).toHaveLength(2);
		expect(tree[0]).toEqual({
			id: "rules",
			label: "Rules",
			hint: undefined,
			isDirectory: false,
			expanded: false,
			selected: true,
		});
		expect(tree[1]!.hint).toBe("Optional hint");
		expect(tree[1]!.ruleFile).toBeUndefined();
	});
});

describe("getSelectedCategoryIds", () => {
	it("returns ids of selected leaf nodes", () => {
		const tree: TreeNode[] = [
			{ id: "rules", label: "Rules", isDirectory: false, expanded: false, selected: true },
			{ id: "skills", label: "Skills", isDirectory: false, expanded: false, selected: false },
			{ id: "agents", label: "Agents", isDirectory: false, expanded: false, selected: true },
		];
		expect(getSelectedCategoryIds(tree)).toEqual(["rules", "agents"]);
	});

	it("works with output of buildCategoryTree", () => {
		const tree = buildCategoryTree([
			{ id: "a", label: "A" },
			{ id: "b", label: "B" },
		]);
		tree[1]!.selected = false;
		expect(getSelectedCategoryIds(tree)).toEqual(["a"]);
	});

	it("returns empty array when none selected or tree empty", () => {
		const tree = buildCategoryTree([{ id: "x", label: "X" }]);
		tree[0]!.selected = false;
		expect(getSelectedCategoryIds(tree)).toEqual([]);
		expect(getSelectedCategoryIds([])).toEqual([]);
	});
});
