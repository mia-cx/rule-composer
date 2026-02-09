import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { Dirent } from "node:fs";
import { access, readdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as p from "@clack/prompts";
import { TOOL_IDS, type ToolId } from "../shared/types.js";
import { TOOL_VARIABLES } from "../shared/formats.js";
import {
	CURSOR_KEY,
	getCursorStateDbPath,
	listItemTableKeys,
	readCursorUserRules,
	writeCursorUserRules,
	composeRepoRules,
	writeCursorUserRulesToRepo,
} from "./cursor-db.js";
import { syncDir } from "./sync-dir.js";
import { treeSingleSelect } from "../shared/tree-prompt.js";
import type { TreeNode } from "../shared/types.js";

export type SyncDirection = "push" | "pull" | "diff" | "inspect";

export interface SyncOptions {
	/** Repo root (default: process.cwd()) */
	repo?: string;
	/** Tool id (default: cursor) */
	tool?: ToolId;
	/** Skip confirmation before destructive sync */
	yes?: boolean;
	/** For Cursor: sync rules to/from User Rules SQLite DB (state.vscdb) instead of ~/.cursor/rules/ */
	cursorDb?: boolean;
}

export const expandTilde = (path: string): string => (path.startsWith("~/") ? join(homedir(), path.slice(2)) : path);

export interface SyncCategory {
	id: string;
	label: string;
	repoPath: string;
	globalPath: string;
}

export interface SyncRepoPaths {
	repoRules: string;
	repoSkills: string;
	repoAgents: string;
	repoCommands: string;
}

const pathExists = async (path: string): Promise<boolean> => {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
};

const CANONICAL_SYNC_SUBDIRS = ["rules", "skills", "agents", "commands"] as const;

/** True if dir (absolute path) contains at least one of rules/, skills/, agents/, commands/. */
const hasCanonicalLayoutAt = async (dir: string): Promise<boolean> => {
	for (const sub of CANONICAL_SYNC_SUBDIRS) {
		if (await pathExists(join(dir, sub))) return true;
	}
	return false;
};

const DEFAULT_SYNC_SOURCE_MAX_DEPTH = 5;
const SKIP_DIR_NAMES = new Set(["node_modules", ".git", "vendor"]);

/**
 * Recursively find all directories under repoRoot that contain any of rules/, skills/, agents/, commands/.
 * Returns relative paths ("" for repo root, "a/b" for nested). Skips node_modules, .git, vendor; respects maxDepth.
 */
export const findSyncSourceDirs = async (
	repoRoot: string,
	maxDepth: number = DEFAULT_SYNC_SOURCE_MAX_DEPTH,
): Promise<string[]> => {
	const results: string[] = [];
	const queue: { relPath: string; depth: number }[] = [{ relPath: "", depth: 0 }];

	while (queue.length > 0) {
		const { relPath, depth } = queue.shift()!;
		const absPath = relPath ? join(repoRoot, relPath) : repoRoot;

		if (await hasCanonicalLayoutAt(absPath)) {
			results.push(relPath);
		}

		if (depth >= maxDepth) continue;

		let entries: Dirent[];
		try {
			entries = await readdir(absPath, { withFileTypes: true });
		} catch {
			continue;
		}

		const subdirs = entries
			.filter((e) => e.isDirectory() && !SKIP_DIR_NAMES.has(e.name) && !e.name.startsWith("."))
			.map((e) => e.name)
			.sort();

		for (const name of subdirs) {
			const nextRel = relPath ? `${relPath}/${name}` : name;
			queue.push({ relPath: nextRel, depth: depth + 1 });
		}
	}

	return results;
};

/** Build TreeNode[] from relative paths ("" = repo root, "a/b" = nested). Cascades path segments into a tree. */
const buildTreeFromSyncSourcePaths = (paths: string[]): TreeNode[] => {
	const repoPath = paths.find((p) => p === "");
	const otherPaths = paths.filter((p) => p !== "");

	const repoNode: TreeNode = {
		id: "repo",
		label: "Repo root (rules/, skills/, agents/, commands/)",
		isDirectory: false,
		expanded: false,
		selected: true,
	};

	if (otherPaths.length === 0) {
		return [repoNode];
	}

	// Build a tree: each path "a/b/c" -> { a: { b: { c: leaf } } }. Merge all.
	type Branch = { children?: Map<string, Branch>; id?: string };
	const root: Branch = { children: new Map() };

	const pathSet = new Set(otherPaths);
	for (const rel of otherPaths) {
		const segments = rel.split("/").filter(Boolean);
		let current = root;
		for (let i = 0; i < segments.length; i++) {
			const seg = segments[i]!;
			const pathSoFar = segments.slice(0, i + 1).join("/");
			if (!current.children!) current.children = new Map();
			let next = current.children.get(seg);
			if (!next) {
				next = pathSet.has(pathSoFar) ? { id: pathSoFar } : {};
				if (i < segments.length - 1) {
					next.children = new Map();
				}
				current.children.set(seg, next);
			}
			current = next;
		}
	}

	function branchToNodes(branch: Branch, segmentLabel: string): TreeNode[] {
		const nodes: TreeNode[] = [];
		if (branch.children && branch.children.size > 0) {
			const sorted = [...branch.children.entries()].sort(([a], [b]) => a.localeCompare(b));
			const childNodes: TreeNode[] = [];
			if (branch.id !== undefined) {
				childNodes.push({
					id: branch.id,
					label: "(this directory)",
					isDirectory: false,
					expanded: false,
					selected: false,
				});
			}
			for (const [label, child] of sorted) {
				childNodes.push(...branchToNodes(child, label));
			}
			const dirId = "dir:" + (branch.id ?? segmentLabel);
			nodes.push({
				id: dirId,
				label: segmentLabel,
				isDirectory: true,
				expanded: false,
				selected: false,
				children: childNodes,
			});
		} else if (branch.id !== undefined) {
			nodes.push({
				id: branch.id,
				label: segmentLabel,
				isDirectory: false,
				expanded: false,
				selected: false,
			});
		}
		return nodes;
	}

	const otherNodes: TreeNode[] = [];
	const sorted = [...(root.children?.entries() ?? [])].sort(([a], [b]) => a.localeCompare(b));
	for (const [label, child] of sorted) {
		otherNodes.push(...branchToNodes(child, label));
	}

	// If repo root is a sync source, show it first; then all nested branches
	if (repoPath !== undefined) {
		return [repoNode, ...otherNodes];
	}
	return otherNodes;
};

/** Build tree of sync sources: repo root + any dir that has rules/skills/agents/commands, cascaded by directory structure. */
export const buildSyncSourceTree = async (repoRoot: string): Promise<TreeNode[]> => {
	const paths = await findSyncSourceDirs(repoRoot);
	if (paths.length === 0) {
		return [
			{
				id: "repo",
				label: "Repo root (rules/, skills/, agents/, commands/)",
				isDirectory: false,
				expanded: false,
				selected: true,
			},
		];
	}

	const tree = buildTreeFromSyncSourcePaths(paths);
	// Ensure at least repo node when repo root has canonical layout
	if (tree.length === 0 || tree[0]!.id !== "repo") {
		const hasRoot = paths.includes("");
		if (hasRoot) {
			return [
				{
					id: "repo",
					label: "Repo root (rules/, skills/, agents/, commands/)",
					isDirectory: false,
					expanded: false,
					selected: true,
				},
				...tree,
			];
		}
	}
	return tree;
};

/** True if any of rules/, skills/, agents/, commands/ exist at repo root (canonical layout). */
export const hasCanonicalSyncLayout = async (repoRoot: string): Promise<boolean> => {
	const candidates = [
		join(repoRoot, "rules"),
		join(repoRoot, "skills"),
		join(repoRoot, "agents"),
		join(repoRoot, "commands"),
	];
	for (const p of candidates) {
		if (await pathExists(p)) return true;
	}
	return false;
};

/** Repo paths for canonical project-root layout (rules/, skills/, agents/, commands/). */
export const getCanonicalSyncRepoPaths = (repoRoot: string): SyncRepoPaths => ({
	repoRules: join(repoRoot, "rules"),
	repoSkills: join(repoRoot, "skills"),
	repoAgents: join(repoRoot, "agents"),
	repoCommands: join(repoRoot, "commands"),
});

/** Repo paths from tool schema (TOOL_VARIABLES RULES_DIR, SKILLS_DIR; .cursor/agents and .cursor/commands for Cursor only). */
export const getToolSyncRepoPaths = (repoRoot: string, toolId: ToolId, vars: Record<string, string>): SyncRepoPaths => {
	const trimSlash = (s: string) => s.replace(/\/+$/, "");
	return {
		repoRules: vars.RULES_DIR ? join(repoRoot, trimSlash(vars.RULES_DIR)) : "",
		repoSkills: vars.SKILLS_DIR ? join(repoRoot, trimSlash(vars.SKILLS_DIR)) : "",
		repoAgents: toolId === "cursor" && vars.GLOBAL_AGENTS ? join(repoRoot, ".cursor", "agents") : "",
		repoCommands: toolId === "cursor" && vars.GLOBAL_COMMANDS ? join(repoRoot, ".cursor", "commands") : "",
	};
};

/** Build the list of sync categories for a tool (all configured; no category prompt). Used by runSync. Only includes categories with both global path set and repo path non-empty. */
export const buildSyncCategoryList = (
	globalRules: string,
	globalSkills: string,
	globalAgents: string,
	globalCommands: string,
	useCursorDb: boolean,
	repoPaths: SyncRepoPaths,
): SyncCategory[] => {
	const list: SyncCategory[] = [];
	const { repoRules, repoSkills, repoAgents, repoCommands } = repoPaths;
	if (globalRules && !useCursorDb && repoRules) {
		list.push({ id: "rules", label: "Rules", repoPath: repoRules, globalPath: globalRules });
	}
	if (globalSkills && repoSkills) {
		list.push({ id: "skills", label: "Skills", repoPath: repoSkills, globalPath: globalSkills });
	}
	if (globalAgents && repoAgents) {
		list.push({ id: "agents", label: "Agents", repoPath: repoAgents, globalPath: globalAgents });
	}
	if (globalCommands && repoCommands) {
		list.push({ id: "commands", label: "Commands", repoPath: repoCommands, globalPath: globalCommands });
	}
	return list;
};

/** Tools that have at least one of GLOBAL_RULES, GLOBAL_SKILLS, GLOBAL_AGENTS, or GLOBAL_COMMANDS set */
export const getToolsWithGlobalPaths = (): ToolId[] =>
	TOOL_IDS.filter((id) => {
		const v = TOOL_VARIABLES[id];
		return (
			v &&
			(v.GLOBAL_RULES !== "" ||
				v.GLOBAL_SKILLS !== "" ||
				(v.GLOBAL_AGENTS !== undefined && v.GLOBAL_AGENTS !== "") ||
				(v.GLOBAL_COMMANDS !== undefined && v.GLOBAL_COMMANDS !== ""))
		);
	});

export const runSync = async (direction: SyncDirection | undefined, options: SyncOptions = {}): Promise<void> => {
	const repoRoot = resolve(options.repo ?? process.cwd());
	const toolsWithGlobal = getToolsWithGlobalPaths();
	const toolId = (options.tool ?? "cursor") as ToolId;

	if (!TOOL_IDS.includes(toolId)) {
		p.log.error(`Unknown tool: ${toolId}`);
		return;
	}

	let vars = TOOL_VARIABLES[toolId];
	if (!vars) {
		p.log.error(`No config for tool: ${toolId}`);
		return;
	}

	let globalRules = vars.GLOBAL_RULES ? expandTilde(vars.GLOBAL_RULES) : "";
	let globalSkills = vars.GLOBAL_SKILLS ? expandTilde(vars.GLOBAL_SKILLS) : "";
	let globalAgents = vars.GLOBAL_AGENTS ? expandTilde(vars.GLOBAL_AGENTS) : "";
	let globalCommands = vars.GLOBAL_COMMANDS ? expandTilde(vars.GLOBAL_COMMANDS) : "";

	if (!globalRules && !globalSkills && !globalAgents && !globalCommands) {
		p.log.error(
			`Tool "${toolId}" has no GLOBAL_RULES, GLOBAL_SKILLS, GLOBAL_AGENTS, or GLOBAL_COMMANDS configured.`,
		);
		if (toolsWithGlobal.length > 0) {
			p.log.message(`Tools with global paths: ${toolsWithGlobal.join(", ")}`);
		}
		return;
	}

	let useCursorDb = toolId === "cursor" && options.cursorDb === true;
	let cursorDbPath: string | null = null;
	if (useCursorDb) {
		cursorDbPath = getCursorStateDbPath();
		try {
			await access(cursorDbPath);
		} catch {
			p.log.error(
				`Cursor state DB not found at ${cursorDbPath}. Run Cursor at least once, or omit --cursor-db to sync files to ~/.cursor/rules/ instead.`,
			);
			return;
		}
	}

	let sourceRoot = repoRoot;
	let effectiveToolId: ToolId = toolId;

	// Source selection: repo root or any dir that has rules/skills/agents/commands (radio = one source)
	const sourceTree = await buildSyncSourceTree(repoRoot);
	if (sourceTree.length > 1 && !options.yes) {
		const picked = await treeSingleSelect({
			message: "Select source to sync",
			tree: sourceTree,
		});
		if (p.isCancel(picked) || typeof picked === "symbol" || picked === undefined) {
			p.cancel("Sync cancelled.");
			return;
		}
		const sourceId = picked;
		if (sourceId !== "repo") {
			// Selected a nested path (e.g. coding-tools/cursor, my-configs/team-a)
			sourceRoot = join(repoRoot, sourceId);
			useCursorDb = false;
			cursorDbPath = null;
		}
	}

	let repoPaths: SyncRepoPaths;
	if (sourceRoot !== repoRoot) {
		// Variant source: always canonical layout at that path
		repoPaths = getCanonicalSyncRepoPaths(sourceRoot);
	} else {
		// Repo root: prefer canonical layout if present; else use tool schema
		let useCanonicalLayout = await hasCanonicalSyncLayout(repoRoot);
		if (useCanonicalLayout && !options.yes) {
			const useRoot = await p.confirm({
				message: "Use project root layout (rules/, skills/, agents/, commands/) for sync?",
				initialValue: true,
			});
			if (p.isCancel(useRoot)) {
				p.cancel("Sync cancelled.");
				return;
			}
			useCanonicalLayout = useRoot === true;
		} else if (!useCanonicalLayout) {
			useCanonicalLayout = false;
		}
		repoPaths = useCanonicalLayout
			? getCanonicalSyncRepoPaths(repoRoot)
			: getToolSyncRepoPaths(repoRoot, effectiveToolId, vars);
	}
	const repoRules = repoPaths.repoRules;

	let directionToUse = direction;
	if (directionToUse === undefined) {
		const optionsList = [
			{ value: "push", label: "Push — repo → global config" },
			{ value: "pull", label: "Pull — global config → repo" },
			{ value: "diff", label: "Diff — show differences only" },
		];
		if (useCursorDb) {
			optionsList.push({ value: "inspect", label: "Inspect — list keys in Cursor state DB (diagnostics)" });
		}
		const selected = await p.select({
			message: "Sync direction",
			options: optionsList,
		});
		if (p.isCancel(selected)) {
			p.cancel("Sync cancelled.");
			return;
		}
		directionToUse = selected as SyncDirection;
	}

	if (directionToUse === "inspect") {
		if (!useCursorDb || !cursorDbPath) {
			p.log.error("Inspect requires --cursor-db (and default tool cursor). Run: pnpm sync inspect --cursor-db");
			return;
		}
		const keys = listItemTableKeys(cursorDbPath);
		const rulesRelated = keys.filter(
			(k) =>
				k.key.includes("aicontext") ||
				k.key.includes("rule") ||
				k.key.includes("context") ||
				k.key.includes("personal"),
		);
		p.log.info(`DB: ${cursorDbPath}`);
		p.log.info(`Key we use for User Rules: "${CURSOR_KEY}"`);
		const our = keys.find((k) => k.key === CURSOR_KEY);
		if (our) {
			p.log.message(`  → Present, value length: ${our.valueLength} bytes`);
		} else {
			p.log.warn(`  → Not found in ItemTable`);
		}
		if (rulesRelated.length > 0) {
			p.log.info("Other keys that might be rules-related:");
			for (const k of rulesRelated) {
				if (k.key !== CURSOR_KEY) p.log.message(`  ${k.key} (${k.valueLength} bytes)`);
			}
		}
		p.log.message(
			"If rules don't show in Cursor Settings, Cursor may be using cloud sync; the UI might not read this DB.",
		);
		return;
	}

	const categoryList = buildSyncCategoryList(
		globalRules,
		globalSkills,
		globalAgents,
		globalCommands,
		useCursorDb,
		repoPaths,
	);
	if (categoryList.length === 0) {
		p.log.error("No sync categories configured for this tool. Check repo layout and tool globals.");
		return;
	}

	const selectedCategories = categoryList;

	let deleteStale = false;
	if (directionToUse === "push" || directionToUse === "pull") {
		if (!options.yes) {
			const confirmDeleteStale = await p.confirm({
				message:
					"Do you want to delete stale items (items at the destination that are not present in the source)?",
				initialValue: false,
			});
			if (p.isCancel(confirmDeleteStale)) {
				p.cancel("Sync cancelled.");
				return;
			}
			deleteStale = confirmDeleteStale === true;
		}
	}

	if (directionToUse === "diff") {
		for (const cat of selectedCategories) {
			p.log.info(`Diff ${cat.label}: ${cat.repoPath} vs ${cat.globalPath}`);
			try {
				execSync(`diff -rq "${cat.repoPath}" "${cat.globalPath}"`, { stdio: "inherit" });
			} catch {
				// diff exits 1 when files differ or dir missing
			}
		}
		if (useCursorDb && cursorDbPath) {
			const repoContent = await composeRepoRules(repoRules).catch(() => "");
			const dbContent = readCursorUserRules(cursorDbPath) ?? "";
			if (repoContent === dbContent) {
				p.log.info("Cursor User Rules: repo and DB match.");
			} else {
				p.log.info("Cursor User Rules: repo and DB differ.");
				const base = join(tmpdir(), `cursor-diff-${randomBytes(8).toString("hex")}`);
				const repoFile = `${base}-repo.md`;
				const dbFile = `${base}-db.md`;
				try {
					writeFileSync(repoFile, repoContent, "utf-8");
					writeFileSync(dbFile, dbContent, "utf-8");
					execSync(`diff "${repoFile}" "${dbFile}"`, { stdio: "inherit" });
				} catch {
					// diff exits 1 when files differ
				} finally {
					try {
						unlinkSync(repoFile);
						unlinkSync(dbFile);
					} catch {
						/* ignore */
					}
				}
			}
		}
		return;
	}

	// push or pull
	if (directionToUse === "push") {
		for (const cat of selectedCategories) {
			const src = cat.repoPath;
			const dest = cat.globalPath;
			try {
				await access(src);
			} catch {
				p.log.message(`Repo ${src} not found; skipping ${cat.label} push.`);
				continue;
			}
			p.log.info(`Pushing ${cat.label}: ${src}/ → ${dest}`);
			await syncDir(src, dest, { deleteStale });
		}
		if (useCursorDb && cursorDbPath) {
			p.log.info(`Pushing rules: ${repoRules}/ → Cursor User Rules (state.vscdb)`);
			let content: string;
			try {
				content = await composeRepoRules(repoRules);
			} catch (_err) {
				p.log.error(
					`Could not read repo rules from ${repoRules}. Ensure the directory exists and is readable.`,
				);
				return;
			}
			writeCursorUserRules(cursorDbPath, content);
		}
	} else {
		for (const cat of selectedCategories) {
			const src = cat.globalPath;
			const dest = cat.repoPath;
			p.log.info(`Pulling ${cat.label}: ${src} → ${dest}/`);
			await syncDir(src, dest, { deleteStale });
		}
		if (useCursorDb && cursorDbPath) {
			p.log.info(`Pulling rules: Cursor User Rules (state.vscdb) → ${repoRules}/cursor-user-rules.md`);
			const content = readCursorUserRules(cursorDbPath);
			if (content !== null) {
				await writeCursorUserRulesToRepo(repoRules, content);
			} else {
				p.log.warn("No User Rules found in Cursor DB.");
			}
		}
	}
};
