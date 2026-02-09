import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface SyncDirOptions {
	/** If true, remove paths in dest that are not present in source */
	deleteStale: boolean;
}

/** Recursively list all relative paths under dir (files and dirs). */
const listRelativePaths = async (dir: string, prefix = ""): Promise<string[]> => {
	const entries = await readdir(dir, { withFileTypes: true });
	const paths: string[] = [];
	for (const e of entries) {
		const rel = prefix ? `${prefix}/${e.name}` : e.name;
		paths.push(rel);
		if (e.isDirectory()) {
			paths.push(...(await listRelativePaths(join(dir, e.name), rel)));
		}
	}
	return paths;
};

/** Recursively copy source into dest (single walk). */
const copyRecursive = async (src: string, dest: string, rel: string): Promise<void> => {
	const srcPath = join(src, rel);
	const destPath = join(dest, rel);
	const s = await stat(srcPath);
	if (s.isDirectory()) {
		await mkdir(destPath, { recursive: true });
		const entries = await readdir(srcPath, { withFileTypes: true });
		for (const e of entries) {
			const childRel = rel ? `${rel}/${e.name}` : e.name;
			await copyRecursive(src, dest, childRel);
		}
	} else {
		await mkdir(join(destPath, ".."), { recursive: true });
		const data = await readFile(srcPath);
		await writeFile(destPath, data);
	}
};

/** Remove from dest any path whose relative path is not in allowedSet. */
const removeStale = async (destDir: string, allowedSet: Set<string>, prefix: string): Promise<void> => {
	const entries = await readdir(destDir, { withFileTypes: true });
	for (const e of entries) {
		const rel = prefix ? `${prefix}/${e.name}` : e.name;
		const full = join(destDir, e.name);
		if (e.isDirectory()) {
			await removeStale(full, allowedSet, rel);
			if (!allowedSet.has(rel)) {
				await rm(full, { recursive: true, force: true });
			}
		} else {
			if (!allowedSet.has(rel)) {
				await rm(full);
			}
		}
	}
};

/**
 * Sync sourceDir to destDir: recursively copy all files/dirs, then optionally remove
 * destination entries that are not present in source.
 * If sourceDir does not exist, does nothing (caller should log/skip as needed).
 */
export const syncDir = async (sourceDir: string, destDir: string, options: SyncDirOptions): Promise<void> => {
	const { deleteStale } = options;
	const sourceExists = await stat(sourceDir).then(
		(s) => s.isDirectory(),
		() => false,
	);
	if (!sourceExists) return;

	await mkdir(destDir, { recursive: true });
	const topEntries = await readdir(sourceDir, { withFileTypes: true });
	for (const e of topEntries) {
		const rel = e.name;
		await copyRecursive(sourceDir, destDir, rel);
	}

	if (!deleteStale) return;
	const sourcePaths = new Set(await listRelativePaths(sourceDir));
	await removeStale(destDir, sourcePaths, "");
};
