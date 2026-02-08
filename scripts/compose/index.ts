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
  const selectedRules = await selectRules(sources);
  if (selectedRules.length === 0) {
    p.log.error("No rules selected.");
    return;
  }

  // 4. Pick target tool for placeholders
  const targetTool = await pickTargetTool(detected);

  // 5. Compose
  const { content, placeholderCount } = compose(selectedRules, targetTool);
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
