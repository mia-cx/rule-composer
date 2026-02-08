/**
 * Cursor User Rules are stored in SQLite, not in ~/.cursor/rules/.
 * See: https://forum.cursor.com/t/where-are-the-global-rules-saved-in-my-filesystem/76645
 * Key: aicontext.personalContext in ItemTable (value BLOB = UTF-8 text).
 * Paths: macOS ~/Library/Application Support/Cursor/User/globalStorage/state.vscdb,
 *        Linux ~/.config/Cursor/User/globalStorage/state.vscdb,
 *        Windows %APPDATA%\\Cursor\\User\\globalStorage\\state.vscdb
 */

import Database from "better-sqlite3";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir, platform } from "node:os";

export const CURSOR_KEY = "aicontext.personalContext";

/** List all keys in ItemTable with value byte length. For diagnostics (e.g. confirm which key Cursor uses for User Rules). */
export function listItemTableKeys(dbPath: string): { key: string; valueLength: number }[] {
	const db = new Database(dbPath, { readonly: true });
	try {
		const rows = db.prepare("SELECT key, value FROM ItemTable").all() as { key: string; value: Buffer | null }[];
		return rows.map((r) => ({
			key: r.key,
			valueLength: r.value ? r.value.length : 0,
		}));
	} finally {
		db.close();
	}
}

export function getCursorStateDbPath(): string {
	const home = homedir();
	if (platform() === "darwin") {
		return join(home, "Library", "Application Support", "Cursor", "User", "globalStorage", "state.vscdb");
	}
	if (platform() === "win32") {
		const appData = process.env.APPDATA ?? join(home, "AppData", "Roaming");
		return join(appData, "Cursor", "User", "globalStorage", "state.vscdb");
	}
	return join(home, ".config", "Cursor", "User", "globalStorage", "state.vscdb");
}

/** Read User Rules content from Cursor's state.vscdb. Returns null if key missing or DB not found. */
export function readCursorUserRules(dbPath: string): string | null {
	try {
		const db = new Database(dbPath, { readonly: true });
		try {
			const row = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get(CURSOR_KEY) as
				| { value?: Buffer | string }
				| undefined;
			if (row?.value == null) return null;
			if (Buffer.isBuffer(row.value)) return row.value.toString("utf-8");
			return String(row.value);
		} finally {
			db.close();
		}
	} catch {
		return null;
	}
}

/** Write User Rules content to Cursor's state.vscdb. Uses INSERT OR REPLACE. */
export function writeCursorUserRules(dbPath: string, content: string): void {
	const db = new Database(dbPath);
	try {
		db.prepare("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)").run(
			CURSOR_KEY,
			Buffer.from(content, "utf-8"),
		);
	} finally {
		db.close();
	}
}

/** Compose repo rules dir into a single string (files sorted by name, joined by double newline). */
export async function composeRepoRules(repoRulesDir: string): Promise<string> {
	const entries = await readdir(repoRulesDir, { withFileTypes: true });
	const files = entries
		.filter((e) => e.isFile() && !e.name.startsWith("."))
		.map((e) => e.name)
		.sort();
	const parts: string[] = [];
	for (const name of files) {
		const path = join(repoRulesDir, name);
		const content = await readFile(path, "utf-8");
		parts.push(content.trimEnd());
	}
	return parts.join("\n\n");
}

/** Write DB content to a single file in repo (e.g. for pull). */
export async function writeCursorUserRulesToRepo(repoRulesDir: string, content: string): Promise<void> {
	await mkdir(repoRulesDir, { recursive: true });
	const path = join(repoRulesDir, "cursor-user-rules.md");
	await writeFile(path, content, "utf-8");
}
