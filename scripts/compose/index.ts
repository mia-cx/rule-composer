import * as p from "@clack/prompts";
import color from "picocolors";
import { detectTools, resolveAgentsRepo } from "../shared/scanner.js";
import {
  pickSources,
  selectRules,
  pickTargetTool,
  askOptimize,
  getApiKeyInteractive,
  showDiffPreview,
  askAcceptOptimized,
  pickOutputTargets,
} from "../shared/cli.js";
import { compose, estimateTokens } from "./composer.js";
import {
  writeAsSingleFile,
  writeAsDirectory,
  formatMarkdown,
} from "../shared/formats.js";
import { optimize, resolvePromptPath } from "../shared/openrouter.js";
import { generateVariants } from "./variants.js";

export const runCompose = async (): Promise<void> => {
  const cwd = process.cwd();

  // 1. Detect tools in CWD
  const detected = await detectTools(cwd);
  const agentsRepo = await resolveAgentsRepo(cwd);

  if (detected.length > 0) {
    p.log.info("Detected tools in CWD:");
    for (const source of detected) {
      p.log.message(`  ${source.label}`);
    }
  }

  // 2. Pick sources
  const sources = await pickSources(detected, agentsRepo);
  if (sources.length === 0) {
    p.log.error("No sources selected.");
    return;
  }

  // 3. Select individual rules via tree
  let selectedRules = await selectRules(sources);
  if (selectedRules.length === 0) {
    p.log.error("No rules selected.");
    return;
  }

  // 3.5. Optional reorder
  if (selectedRules.length > 1) {
    p.log.info("Current section order:");
    selectedRules.forEach((rule, i) => {
      p.log.message(`  ${color.dim(`${i + 1}.`)} ${rule.name}`);
    });

    const wantsReorder = await p.confirm({
      message: "Reorder sections?",
      initialValue: false,
    });

    if (p.isCancel(wantsReorder)) {
      p.cancel("Operation cancelled.");
      process.exit(0);
    }

    if (wantsReorder) {
      const defaultOrder = selectedRules.map((_, i) => i + 1).join(",");
      const orderInput = await p.text({
        message: "Enter new order (comma-separated numbers)",
        placeholder: defaultOrder,
        initialValue: defaultOrder,
        validate: (value) => {
          const indices = value.split(",").map((s) => parseInt(s.trim(), 10));
          if (indices.length !== selectedRules.length) {
            return `Expected ${selectedRules.length} numbers, got ${indices.length}`;
          }
          if (indices.some((n) => isNaN(n) || n < 1 || n > selectedRules.length)) {
            return `Numbers must be between 1 and ${selectedRules.length}`;
          }
          const unique = new Set(indices);
          if (unique.size !== indices.length) {
            return "Each number must appear exactly once";
          }
          return undefined;
        },
      });

      if (p.isCancel(orderInput)) {
        p.cancel("Operation cancelled.");
        process.exit(0);
      }

      const indices = (orderInput as string)
        .split(",")
        .map((s) => parseInt(s.trim(), 10) - 1);
      selectedRules = indices.map((i) => selectedRules[i]!);
    }
  }

  // 4. Pick target tool for placeholders
  const targetTool = await pickTargetTool(detected);

  // 4.5. Numbering toggle
  const wantsNumbering = await p.confirm({
    message: "Add numbered prefixes to section headings?",
    initialValue: true,
  });

  if (p.isCancel(wantsNumbering)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  // 5. Compose
  const { content, placeholderCount } = compose(selectedRules, targetTool, {
    numbered: !!wantsNumbering,
  });
  const tokens = estimateTokens(content);
  const lines = content.split("\n").length;

  p.log.success(
    `Composed: ${lines} lines (~${tokens} tokens)` +
      (placeholderCount > 0
        ? ` • Resolved ${placeholderCount} placeholders for ${targetTool}`
        : ""),
  );

  // 6. Optional LLM optimization
  let finalContent = content;

  const wantsOptimize = await askOptimize();
  if (wantsOptimize) {
    const apiKey = await getApiKeyInteractive();

    if (apiKey) {
      const s = p.spinner();
      s.start("Optimizing...");

      const promptPath = resolvePromptPath("compose/prompt.md");
      const result = await optimize(content, apiKey, promptPath);

      if (result.optimized) {
        s.stop("Optimization complete");

        const optimizedTokens = estimateTokens(result.optimized);
        showDiffPreview(content, result.optimized, tokens, optimizedTokens);

        const accept = await askAcceptOptimized();
        if (accept) {
          finalContent = result.optimized;
        }
      } else {
        s.stop(color.yellow(`Optimization failed: ${result.error}`));
        p.log.warn("Using raw (non-optimized) version.");
      }
    } else {
      p.log.warn("No API key provided. Skipping optimization.");
    }
  }

  // 7. Pick output targets
  const targets = await pickOutputTargets(detected, targetTool);

  // 8. Format and write to targets
  const s = p.spinner();
  s.start("Formatting & writing...");

  const formattedContent = await formatMarkdown(finalContent);

  // Format each rule for directory writes
  const formattedRules = await Promise.all(
    selectedRules.map(async (rule) => ({
      ...rule,
      body: await formatMarkdown(rule.body),
      rawContent: await formatMarkdown(rule.rawContent),
    })),
  );

  for (const target of targets) {
    if (target.kind === "single-file") {
      await writeAsSingleFile(formattedContent, target.path);
      p.log.success(`  ${target.path} (single file)`);
    } else {
      await writeAsDirectory(formattedRules, target.dir, target.tool);
      p.log.success(`  ${target.dir} (${selectedRules.length} files)`);
    }
  }

  // 9. Regenerate coding-tools/ variants
  const variantResults = await generateVariants();
  const totalTools = variantResults.length;

  s.stop(`Written to ${targets.length} target(s)`);
  p.log.info(`Regenerated coding-tools/ (${totalTools} tools)`);
};
