import { Prompt, isCancel } from "@clack/core";
import color from "picocolors";
import type { TreeNode, RuleFile, DiscoveredSource } from "./types.js";

const S_CHECKBOX_ACTIVE = color.green("■");
const S_CHECKBOX_INACTIVE = color.dim("□");
const S_CHECKBOX_PARTIAL = color.yellow("◧");
const S_RADIO_ACTIVE = color.green("●");

const S_BAR = "│";
const S_CONNECTOR = "├";
const S_CONNECTOR_END = "└";
const S_EXPAND = color.dim("▸");
const S_COLLAPSE = color.dim("▾");

const S_BAR_H = "─";

/** Find the longest common directory prefix among a set of absolute paths */
const commonPrefix = (paths: string[]): string => {
	if (paths.length === 0) return "";
	if (paths.length === 1) {
		const parts = paths[0]!.split("/");
		return parts.slice(0, -1).join("/") + "/";
	}
	const split = paths.map((p) => p.split("/"));
	const first = split[0]!;
	let i = 0;
	while (i < first.length) {
		const seg = first[i];
		if (split.every((s) => s[i] === seg)) {
			i++;
		} else {
			break;
		}
	}
	return first.slice(0, i).join("/") + "/";
};

/** Insert a rule into the tree at the correct nested position */
const insertRule = (children: TreeNode[], segments: string[], rule: RuleFile): void => {
	if (segments.length === 1) {
		// Leaf — add directly
		children.push({
			id: rule.path,
			label: rule.name,
			hint: rule.description || undefined,
			isDirectory: false,
			expanded: false,
			selected: true,
			ruleFile: rule,
		});
		return;
	}

	// Intermediate directory — find or create
	const dirName = segments[0]!;
	let dirNode = children.find((c) => c.isDirectory && c.label === dirName);

	if (!dirNode) {
		dirNode = {
			id: `dir:${dirName}:${rule.path}`,
			label: dirName,
			isDirectory: true,
			expanded: false,
			selected: true,
			children: [],
		};
		children.push(dirNode);
	}

	insertRule(dirNode.children!, segments.slice(1), rule);
};

/** Build tree nodes from discovered sources */
export const buildTree = (sources: DiscoveredSource[]): TreeNode[] => {
	const roots: TreeNode[] = [];

	for (const source of sources) {
		const paths = source.rules.map((r) => r.path);
		const prefix = commonPrefix(paths);

		const children: TreeNode[] = [];

		for (const rule of source.rules) {
			const relative = rule.path.startsWith(prefix) ? rule.path.slice(prefix.length) : rule.path;
			const segments = relative.split("/").filter(Boolean);
			insertRule(children, segments, rule);
		}

		roots.push({
			id: `source:${source.id}`,
			label: source.label,
			isDirectory: true,
			expanded: false,
			selected: true,
			children,
		});
	}

	return roots;
};

/** Get all visible (non-collapsed) nodes in order */
const getVisibleNodes = (nodes: TreeNode[], depth = 0): Array<{ node: TreeNode; depth: number }> => {
	const result: Array<{ node: TreeNode; depth: number }> = [];

	for (const node of nodes) {
		result.push({ node, depth });
		if (node.isDirectory && node.expanded && node.children) {
			result.push(...getVisibleNodes(node.children, depth + 1));
		}
	}

	return result;
};

/** Count selected leaf nodes */
const countSelected = (nodes: TreeNode[]): number => {
	let count = 0;
	for (const node of nodes) {
		if (node.isDirectory && node.children) {
			count += countSelected(node.children);
		} else if (node.selected) {
			count++;
		}
	}
	return count;
};

/** Count total leaf nodes */
const countTotal = (nodes: TreeNode[]): number => {
	let count = 0;
	for (const node of nodes) {
		if (node.isDirectory && node.children) {
			count += countTotal(node.children);
		} else {
			count++;
		}
	}
	return count;
};

/** Get selection state of a directory */
const getDirectoryState = (node: TreeNode): "all" | "none" | "partial" => {
	if (!node.children || node.children.length === 0) return "none";

	let allSelected = true;
	let noneSelected = true;

	for (const child of node.children) {
		if (child.isDirectory) {
			const state = getDirectoryState(child);
			if (state !== "all") allSelected = false;
			if (state !== "none") noneSelected = false;
		} else {
			if (child.selected) noneSelected = false;
			else allSelected = false;
		}
	}

	if (allSelected) return "all";
	if (noneSelected) return "none";
	return "partial";
};

/** Toggle all children of a directory */
const toggleDirectory = (node: TreeNode, selected: boolean): void => {
	if (node.children) {
		for (const child of node.children) {
			if (child.isDirectory) {
				toggleDirectory(child, selected);
			} else {
				child.selected = selected;
			}
		}
	}
	node.selected = selected;
};

/** Toggle all nodes */
const toggleAll = (nodes: TreeNode[], selected: boolean): void => {
	for (const node of nodes) {
		if (node.isDirectory) {
			toggleDirectory(node, selected);
		} else {
			node.selected = selected;
		}
	}
};

/** Get all selected RuleFiles from the tree */
export const getSelectedRules = (nodes: TreeNode[]): RuleFile[] => {
	const rules: RuleFile[] = [];

	for (const node of nodes) {
		if (node.isDirectory && node.children) {
			rules.push(...getSelectedRules(node.children));
		} else if (node.selected && node.ruleFile) {
			rules.push(node.ruleFile);
		}
	}

	return rules;
};

/** Render a single tree node line */
const renderNode = (node: TreeNode, depth: number, isCursor: boolean, isLast: boolean): string => {
	const indent = "  ".repeat(depth);
	const connector = depth === 0 ? "" : isLast ? `${S_CONNECTOR_END}${S_BAR_H} ` : `${S_CONNECTOR}${S_BAR_H} `;

	let checkbox: string;
	if (node.isDirectory) {
		const state = getDirectoryState(node);
		checkbox = state === "all" ? S_CHECKBOX_ACTIVE : state === "partial" ? S_CHECKBOX_PARTIAL : S_CHECKBOX_INACTIVE;
	} else {
		checkbox = node.selected ? S_CHECKBOX_ACTIVE : S_CHECKBOX_INACTIVE;
	}

	const expandIcon = node.isDirectory ? (node.expanded ? S_COLLAPSE : S_EXPAND) : " ";

	const cursor = isCursor ? S_RADIO_ACTIVE : " ";
	const label = isCursor ? color.underline(node.label) : node.label;
	const hint = isCursor && node.hint ? color.dim(` — ${node.hint}`) : "";

	const childCount = node.isDirectory && node.children ? color.dim(` (${node.children.length})`) : "";

	return `${indent}${connector}${cursor} ${checkbox} ${expandIcon} ${label}${childCount}${hint}`;
};

export interface TreeMultiSelectOptions {
	message: string;
	tree: TreeNode[];
}

/**
 * Custom tree multiselect prompt built on @clack/core.
 *
 * Keybindings:
 * - Up/Down: Navigate visible items
 * - Left: Collapse directory, or move to parent (if on item or collapsed group)
 * - Right: Expand directory
 * - Space: Toggle selection (directory = toggle all children)
 * - a: Toggle all
 * - Enter: Confirm
 */
export const treeMultiSelect = async (opts: TreeMultiSelectOptions): Promise<RuleFile[] | symbol> => {
	const { message, tree } = opts;
	let cursorIndex = 0;

	return new Promise<RuleFile[] | symbol>((resolve) => {
		const prompt = new Prompt({
			input: process.stdin,
			output: process.stdout,
			render() {
				const visible = getVisibleNodes(tree);
				const total = countTotal(tree);
				const selected = countSelected(tree);

				const title = `${color.gray(S_BAR)}\n${color.green("?")} ${color.bold(message)} ${color.dim(`(${selected}/${total} selected)`)}`;

				const lines = visible.map(({ node, depth }, i) => {
					const siblings = depth === 0 ? tree : visible.filter((v) => v.depth === depth).map((v) => v.node);
					const nodeIdx = siblings.indexOf(node);
					const isLast = nodeIdx === siblings.length - 1;
					return renderNode(node, depth, i === cursorIndex, isLast);
				});

				const hint = color.dim(
					"↑/↓ navigate • space toggle • ←/→ collapse/expand • a toggle all • enter confirm",
				);

				return `${title}\n${lines.join("\n")}\n${color.gray(S_BAR)}\n${hint}`;
			},
		});

		const handleKey = (key: string) => {
			const visible = getVisibleNodes(tree);
			const current = visible[cursorIndex];

			switch (key) {
				case "up":
				case "k": {
					cursorIndex = Math.max(0, cursorIndex - 1);
					break;
				}
				case "down":
				case "j": {
					cursorIndex = Math.min(visible.length - 1, cursorIndex + 1);
					break;
				}
				case "left": {
					if (!current) break;
					if (current.node.isDirectory && current.node.expanded) {
						current.node.expanded = false;
					} else if (current.depth > 0) {
						// Navigate to parent: leaf item or collapsed directory
						const parentDepth = current.depth - 1;
						for (let j = cursorIndex - 1; j >= 0; j--) {
							if (visible[j]!.depth === parentDepth) {
								cursorIndex = j;
								break;
							}
						}
					}
					break;
				}
				case "right": {
					if (!current) break;
					if (current.node.isDirectory && !current.node.expanded) {
						current.node.expanded = true;
					}
					break;
				}
				case "space": {
					if (!current) break;
					if (current.node.isDirectory) {
						const state = getDirectoryState(current.node);
						toggleDirectory(current.node, state !== "all");
					} else {
						current.node.selected = !current.node.selected;
					}
					break;
				}
				case "a": {
					const allSelected = countSelected(tree) === countTotal(tree);
					toggleAll(tree, !allSelected);
					break;
				}
			}
		};

		// Wire up stdin for key handling
		const stdin = process.stdin;
		stdin.setRawMode?.(true);
		stdin.resume();

		const onData = (data: Buffer) => {
			const str = data.toString();

			// Ctrl+C
			if (str === "\x03") {
				stdin.setRawMode?.(false);
				stdin.removeListener("data", onData);
				resolve(Symbol("cancel"));
				return;
			}

			// Enter
			if (str === "\r" || str === "\n") {
				stdin.setRawMode?.(false);
				stdin.removeListener("data", onData);
				// Clear and show final state
				process.stdout.write("\x1B[2J\x1B[H");
				const selected = getSelectedRules(tree);
				resolve(selected);
				return;
			}

			// Arrow keys
			if (str === "\x1B[A") handleKey("up");
			else if (str === "\x1B[B") handleKey("down");
			else if (str === "\x1B[D") handleKey("left");
			else if (str === "\x1B[C") handleKey("right");
			else if (str === " ") handleKey("space");
			else if (str === "a") handleKey("a");
			else if (str === "k") handleKey("k");
			else if (str === "j") handleKey("j");

			// Re-render
			const visible = getVisibleNodes(tree);
			const total = countTotal(tree);
			const selected = countSelected(tree);

			const title = `${color.gray(S_BAR)}\n${color.green("?")} ${color.bold(opts.message)} ${color.dim(`(${selected}/${total} selected)`)}`;

			const lines = visible.map(({ node, depth }, i) => {
				const siblings = depth === 0 ? tree : visible.filter((v) => v.depth === depth).map((v) => v.node);
				const nodeIdx = siblings.indexOf(node);
				const isLast = nodeIdx === siblings.length - 1;
				return renderNode(node, depth, i === cursorIndex, isLast);
			});

			const hint = color.dim("↑/↓ navigate • space toggle • ←/→ collapse/expand • a toggle all • enter confirm");

			// Move cursor to top and clear
			process.stdout.write("\x1B[2J\x1B[H");
			process.stdout.write(`${title}\n${lines.join("\n")}\n${color.gray(S_BAR)}\n${hint}`);
		};

		stdin.on("data", onData);

		// Initial render
		const visible = getVisibleNodes(tree);
		const total = countTotal(tree);
		const selected = countSelected(tree);

		const title = `${color.gray(S_BAR)}\n${color.green("?")} ${color.bold(opts.message)} ${color.dim(`(${selected}/${total} selected)`)}`;

		const lines = visible.map(({ node, depth }, i) => {
			const siblings = depth === 0 ? tree : visible.filter((v) => v.depth === depth).map((v) => v.node);
			const nodeIdx = siblings.indexOf(node);
			const isLast = nodeIdx === siblings.length - 1;
			return renderNode(node, depth, i === cursorIndex, isLast);
		});

		const hint = color.dim("↑/↓ navigate • space toggle • ←/→ collapse/expand • a toggle all • enter confirm");

		process.stdout.write(`${title}\n${lines.join("\n")}\n${color.gray(S_BAR)}\n${hint}`);
	});
};
