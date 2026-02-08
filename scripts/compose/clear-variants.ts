import { readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "../..");
const CODING_TOOLS_DIR = join(ROOT_DIR, "coding-tools");

/**
 * Remove generated variant files under coding-tools/ (rules/, skills/, etc.)
 * but keep each tool's README.md.
 */
const main = async (): Promise<void> => {
	let entries: { name: string }[];
	try {
		entries = await readdir(CODING_TOOLS_DIR, { withFileTypes: true });
	} catch (err) {
		console.error("coding-tools/ not found or not readable:", err);
		process.exit(1);
	}

	for (const entry of entries) {
		if (entry.name.startsWith(".")) continue;
		const toolDir = join(CODING_TOOLS_DIR, entry.name);
		const children = await readdir(toolDir, { withFileTypes: true }).catch(() => []);

		for (const child of children) {
			if (child.name === "README.md") continue;
			const path = join(toolDir, child.name);
			await rm(path, { recursive: true });
			console.log(`  removed ${entry.name}/${child.name}`);
		}
	}

	console.log("Cleared variant files (READMEs kept).");
};

main();
