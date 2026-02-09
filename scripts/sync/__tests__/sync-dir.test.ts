import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { syncDir } from "../sync-dir.js";

const base = join(tmpdir(), "arc-test-sync-dir");

describe("syncDir", () => {
	beforeAll(async () => {
		await mkdir(base, { recursive: true });
	});
	afterAll(async () => {
		await rm(base, { recursive: true, force: true });
	});

	it("recursively copies files and directories", async () => {
		const src = join(base, "copy-src");
		const dest = join(base, "copy-dest");
		await rm(dest, { recursive: true, force: true }).catch(() => {});
		await mkdir(join(src, "sub"), { recursive: true });
		await writeFile(join(src, "a.txt"), "a", "utf-8");
		await writeFile(join(src, "sub", "b.txt"), "b", "utf-8");

		await syncDir(src, dest, { deleteStale: false });

		expect(await readFile(join(dest, "a.txt"), "utf-8")).toBe("a");
		expect(await readFile(join(dest, "sub", "b.txt"), "utf-8")).toBe("b");
	});

	it("with deleteStale removes extra file in dest", async () => {
		const src = join(base, "stale-src");
		const dest = join(base, "stale-dest");
		await mkdir(src, { recursive: true });
		await mkdir(dest, { recursive: true });
		await writeFile(join(src, "keep.txt"), "keep", "utf-8");
		await writeFile(join(dest, "keep.txt"), "old", "utf-8");
		await writeFile(join(dest, "extra.txt"), "extra", "utf-8");

		await syncDir(src, dest, { deleteStale: true });

		expect(await readFile(join(dest, "keep.txt"), "utf-8")).toBe("keep");
		await expect(readFile(join(dest, "extra.txt"), "utf-8")).rejects.toThrow();
	});

	it("with deleteStale removes extra directory in dest", async () => {
		const src = join(base, "stale-dir-src");
		const dest = join(base, "stale-dir-dest");
		await mkdir(src, { recursive: true });
		await mkdir(join(dest, "extra-dir"), { recursive: true });
		await writeFile(join(dest, "extra-dir", "f.txt"), "x", "utf-8");

		await syncDir(src, dest, { deleteStale: true });

		const entries = await readdir(dest);
		expect(entries).toHaveLength(0);
	});

	it("with deleteStale false leaves extra file in dest", async () => {
		const src = join(base, "no-stale-src");
		const dest = join(base, "no-stale-dest");
		await mkdir(src, { recursive: true });
		await mkdir(dest, { recursive: true });
		await writeFile(join(src, "a.txt"), "a", "utf-8");
		await writeFile(join(dest, "extra.txt"), "extra", "utf-8");

		await syncDir(src, dest, { deleteStale: false });

		expect(await readFile(join(dest, "a.txt"), "utf-8")).toBe("a");
		expect(await readFile(join(dest, "extra.txt"), "utf-8")).toBe("extra");
	});

	it("does nothing when source does not exist", async () => {
		const src = join(base, "nonexistent-source-xyz");
		const dest = join(base, "nonexistent-dest-xyz");
		await rm(dest, { recursive: true, force: true }).catch(() => {});

		await syncDir(src, dest, { deleteStale: true });

		await expect(readdir(dest)).rejects.toThrow();
	});
});
