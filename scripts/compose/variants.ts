import { readdir, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join, resolve, dirname, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { TOOL_IDS, type ToolId } from "../shared/types.js";
import {
  TOOL_REGISTRY,
  TOOL_VARIABLES,
  resolvePlaceholders,
  formatMarkdown,
} from "../shared/formats.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "../..");

/**
 * Walk a directory recursively and return all file paths.
 * Skips _prefixed and .prefixed directories.
 */
const walkFiles = async (dir: string): Promise<string[]> => {
  const files: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walkFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
};

/** Get the appropriate extension for a tool's rule files */
const getToolExtension = (toolId: ToolId, originalExt: string): string => {
  const config = TOOL_REGISTRY[toolId];
  if (!config) return originalExt;

  // Tools with specific extensions
  if (config.extension) return config.extension;

  // Tools without extensions (zed, aider) — use .md
  return ".md";
};

/** Generate a README for a tool's coding-tools directory */
const generateReadme = (toolId: ToolId): string => {
  const config = TOOL_REGISTRY[toolId];
  if (!config) return "";

  const name = config.name;
  let copyTo = "";

  if (config.directories[0]) {
    copyTo = `Copy the contents of this directory to \`${config.directories[0]}\` in your project.`;
  } else if (config.singleFiles[0]) {
    copyTo = `Concatenate the contents and save as \`${config.singleFiles[0]}\` in your project.`;
  }

  return `# ${name} Rules\n\nPre-processed rules with ${name}-specific paths and references resolved.\n\n${copyTo}\n`;
};

/** Strip frontmatter for tools that don't use it */
const processContent = (
  content: string,
  toolId: ToolId,
  hasFrontmatter: boolean,
): string => {
  let body = content;

  // Strip frontmatter for tools that don't use it
  if (!TOOL_REGISTRY[toolId]?.hasFrontmatter && hasFrontmatter) {
    const parsed = matter(content);
    body = parsed.content.trim();
  }

  // Resolve placeholders
  body = resolvePlaceholders(body, toolId);

  return body;
};

/**
 * Generate coding-tools/ directories for all tools.
 * Each tool gets a subdirectory with pre-processed rule files.
 */
export const generateVariants = async (
  rulesDir: string = join(ROOT_DIR, "rules"),
  skillsDir: string = join(ROOT_DIR, "skills"),
  outputDir: string = join(ROOT_DIR, "coding-tools"),
  toolIds: readonly ToolId[] = TOOL_IDS,
  format: boolean = true,
): Promise<{ toolId: ToolId; fileCount: number }[]> => {
  const results: { toolId: ToolId; fileCount: number }[] = [];

  // Collect all source rule files
  const ruleFiles = await walkFiles(rulesDir);
  const skillFiles = await walkFiles(skillsDir);

  for (const toolId of toolIds) {
    const toolDir = join(outputDir, toolId);

    // Clean and recreate
    await rm(toolDir, { recursive: true, force: true });
    await mkdir(toolDir, { recursive: true });

    let fileCount = 0;

    // Process rules
    for (const filePath of ruleFiles) {
      const content = await readFile(filePath, "utf-8");
      const originalExt = extname(filePath);
      const hasFrontmatter = content.startsWith("---");
      const name = basename(filePath, originalExt);
      const newExt = getToolExtension(toolId, originalExt);
      const processed = processContent(content, toolId, hasFrontmatter);

      // For tools with frontmatter, reconstruct it
      let finalContent: string;
      if (TOOL_REGISTRY[toolId]?.hasFrontmatter && hasFrontmatter) {
        const parsed = matter(content);
        // Resolve placeholders in frontmatter values too
        const resolvedData: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(
          parsed.data as Record<string, unknown>,
        )) {
          resolvedData[key] =
            typeof value === "string"
              ? resolvePlaceholders(value, toolId)
              : value;
        }
        finalContent = matter.stringify(
          resolvePlaceholders(parsed.content.trim(), toolId),
          resolvedData,
        );
      } else {
        finalContent = processed;
      }

      const outPath = join(toolDir, `${name}${newExt}`);
      await writeFile(
        outPath,
        format ? await formatMarkdown(finalContent, outPath) : finalContent,
        "utf-8",
      );
      fileCount++;
    }

    // Process skills (as plain markdown for all tools)
    for (const filePath of skillFiles) {
      const content = await readFile(filePath, "utf-8");
      const relativePath = filePath.replace(skillsDir + "/", "");
      const name = relativePath.replace(/\//g, "-").replace(/\.md$/, "");
      const newExt = getToolExtension(toolId, ".md");
      const processed = resolvePlaceholders(content, toolId);

      const outPath = join(toolDir, `${name}${newExt}`);
      await writeFile(
        outPath,
        format ? await formatMarkdown(processed, outPath) : processed,
        "utf-8",
      );
      fileCount++;
    }

    // Write README
    const readmePath = join(toolDir, "README.md");
    const readmeContent = generateReadme(toolId);
    await writeFile(
      readmePath,
      format ? await formatMarkdown(readmeContent, readmePath) : readmeContent,
      "utf-8",
    );

    results.push({ toolId, fileCount });
  }

  return results;
};

// When run directly (e.g., `tsx scripts/compose/variants.ts`)
const isMain = process.argv[1]?.includes("variants");
if (isMain) {
  console.log("Generating coding-tools/ variants...");
  const results = await generateVariants();
  for (const { toolId, fileCount } of results) {
    console.log(`  ${toolId}: ${fileCount} files`);
  }
  console.log("Done!");
}
