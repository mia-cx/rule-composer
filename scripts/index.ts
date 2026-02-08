import * as p from "@clack/prompts";

const VERSION = "0.1.0";

const main = async (): Promise<void> => {
  const command = process.argv[2];

  p.intro(`agent-rule-composer v${VERSION}`);

  switch (command) {
    case "compose": {
      const { runCompose } = await import("./compose/index.js");
      await runCompose();
      break;
    }
    case "decompose": {
      const { runDecompose } = await import("./decompose/index.js");
      await runDecompose();
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
        ],
      });

      if (p.isCancel(selected)) {
        p.cancel("Operation cancelled.");
        process.exit(0);
      }

      if (selected === "compose") {
        const { runCompose } = await import("./compose/index.js");
        await runCompose();
      } else {
        const { runDecompose } = await import("./decompose/index.js");
        await runDecompose();
      }
    }
  }

  p.outro("Done!");
};

main().catch((err) => {
  p.log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
