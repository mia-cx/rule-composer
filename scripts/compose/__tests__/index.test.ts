import { describe, it, expect } from "vitest";
import { buildComposeSources } from "../index.js";
import type { DiscoveredSource } from "../../shared/types.js";

const makeSource = (id: string, ruleCount: number): DiscoveredSource => ({
	id: id as DiscoveredSource["id"],
	label: `${id} (${ruleCount} files)`,
	rules: Array.from({ length: ruleCount }, (_, i) => ({
		path: `/${id}/rule-${i}.md`,
		name: `rule-${i}`,
		description: "",
		body: "",
		rawContent: "",
		source: id as DiscoveredSource["id"],
		type: "rule" as const,
		hasPlaceholders: false,
	})),
});

describe("buildComposeSources", () => {
	it("returns only detected when hasInputPath is true (path provided)", () => {
		const detected = [makeSource("cursor", 2)];
		const agentsRepo = makeSource("agents-repo", 3);
		const sources = buildComposeSources(detected, agentsRepo, null, true);
		expect(sources).toHaveLength(1);
		expect(sources[0]!.id).toBe("cursor");
	});

	it("returns detected plus agents-repo when no input path and agentsRepo present", () => {
		const detected = [makeSource("cursor", 2), makeSource("claude", 1)];
		const agentsRepo = makeSource("agents-repo", 5);
		const sources = buildComposeSources(detected, agentsRepo, null, false);
		expect(sources).toHaveLength(3);
		expect(sources.map((s) => s.id)).toEqual(["cursor", "claude", "agents-repo"]);
	});

	it("returns detected plus agents-repo plus bundled when no input path and all present", () => {
		const detected = [makeSource("cursor", 2)];
		const agentsRepo = makeSource("agents-repo", 3);
		const bundled = makeSource("bundled", 10);
		const sources = buildComposeSources(detected, agentsRepo, bundled, false);
		expect(sources).toHaveLength(3);
		expect(sources.map((s) => s.id)).toEqual(["cursor", "agents-repo", "bundled"]);
	});

	it("does not duplicate bundled when agentsRepo is bundled (tier-3 fallback)", () => {
		const agentsRepo = makeSource("bundled", 5);
		const bundled = makeSource("bundled", 5);
		const sources = buildComposeSources([], agentsRepo, bundled, false);
		expect(sources).toHaveLength(1);
		expect(sources[0]!.id).toBe("bundled");
	});

	it("returns only detected when no input path and no agentsRepo or bundled", () => {
		const detected = [makeSource("cursor", 2)];
		const sources = buildComposeSources(detected, null, null, false);
		expect(sources).toHaveLength(1);
		expect(sources[0]!.id).toBe("cursor");
	});

	it("returns empty when detected empty and no agentsRepo or bundled", () => {
		const sources = buildComposeSources([], null, null, false);
		expect(sources).toHaveLength(0);
	});

	it("returns only agents-repo when detected empty but agentsRepo present (no input path)", () => {
		const agentsRepo = makeSource("agents-repo", 1);
		const sources = buildComposeSources([], agentsRepo, null, false);
		expect(sources).toHaveLength(1);
		expect(sources[0]!.id).toBe("agents-repo");
	});

	it("returns only bundled when detected empty but bundled present (no agentsRepo)", () => {
		const bundled = makeSource("bundled", 1);
		const sources = buildComposeSources([], null, bundled, false);
		expect(sources).toHaveLength(1);
		expect(sources[0]!.id).toBe("bundled");
	});
});
