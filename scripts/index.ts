import * as p from "@clack/prompts";
import type { ToolId } from "./shared/types.js";

const VERSION = "0.1.0";

const parseArgs = (
	argv: string[],
): {
	command?: string;
	inputPath?: string;
	output?: string;
	syncDirection?: "push" | "pull" | "diff" | "inspect";
	repo?: string;
	tool?: string;
	yes?: boolean;
	cursorDb?: boolean;
} => {
	let output: string | undefined;
	let repo: string | undefined;
	let tool: string | undefined;
	let yes = false;
	let cursorDb = false;
	const positional: string[] = [];
	for (let i = 2; i < argv.length; i++) {
		const arg = argv[i]!;
		if (arg === "--output" || arg === "-o") {
			output = argv[++i];
		} else if (arg === "--repo") {
			repo = argv[++i];
		} else if (arg === "--tool") {
			tool = argv[++i];
		} else if (arg === "--yes" || arg === "-y") {
			yes = true;
		} else if (arg === "--cursor-db") {
			cursorDb = true;
		} else if (!arg.startsWith("-")) {
			positional.push(arg);
		}
	}
	const command = positional[0];
	const syncDirection =
		command === "sync" && positional[1] && ["push", "pull", "diff", "inspect"].includes(positional[1])
			? (positional[1] as "push" | "pull" | "diff" | "inspect")
			: undefined;
	return {
		command,
		inputPath: positional[1],
		output,
		syncDirection,
		repo,
		tool,
		yes,
		cursorDb,
	};
};

const main = async (): Promise<void> => {
	const { command, inputPath, output, syncDirection, repo, tool, yes, cursorDb } = parseArgs(process.argv);

	p.intro(`rule-composer v${VERSION}`);

	switch (command) {
		case "compose": {
			const { runCompose } = await import("./compose/index.js");
			await runCompose(inputPath, output);
			break;
		}
		case "decompose": {
			const { runDecompose } = await import("./decompose/index.js");
			await runDecompose(inputPath, output);
			break;
		}
		case "sync": {
			const { runSync } = await import("./sync/index.js");
			await runSync(syncDirection, { repo, tool: tool as ToolId | undefined, yes, cursorDb });
			break;
		}
		default: {
			// No subcommand — show interactive picker
			const selected = await p.select({
				message: "What would you like to do?",
				options: [
					{
						value: "compose",
						label: "Compose — build AGENTS.md from modular rules",
					},
					{
						value: "decompose",
						label: "Decompose — split a rules file into modular rules",
					},
					{
						value: "sync",
						label: "Sync — push/pull/diff rules and skills with global config",
					},
				],
			});

			if (p.isCancel(selected)) {
				p.cancel("Operation cancelled.");
				process.exit(0);
			}

			if (selected === "compose") {
				const { runCompose } = await import("./compose/index.js");
				await runCompose(undefined, output);
			} else if (selected === "sync") {
				const { runSync } = await import("./sync/index.js");
				await runSync(undefined, { repo, tool: tool as ToolId | undefined, yes, cursorDb });
			} else {
				const { runDecompose } = await import("./decompose/index.js");
				await runDecompose(undefined, output);
			}
		}
	}

	p.outro("Done!");
};

main().catch((err) => {
	p.log.error(err instanceof Error ? err.message : String(err));
	process.exit(1);
});
