import { execSync } from "node:child_process"
import { writeFileSync, unlinkSync } from "node:fs"
import { access } from "node:fs/promises"
import { randomBytes } from "node:crypto"
import { homedir, tmpdir } from "node:os"
import { join, resolve } from "node:path"
import * as p from "@clack/prompts"
import { TOOL_IDS, type ToolId } from "../shared/types.js"
import { TOOL_VARIABLES } from "../shared/formats.js"
import {
  CURSOR_KEY,
  getCursorStateDbPath,
  listItemTableKeys,
  readCursorUserRules,
  writeCursorUserRules,
  composeRepoRules,
  writeCursorUserRulesToRepo,
} from "./cursor-db.js"

export type SyncDirection = "push" | "pull" | "diff" | "inspect"

export interface SyncOptions {
  /** Repo root (default: process.cwd()) */
  repo?: string
  /** Tool id (default: cursor) */
  tool?: ToolId
  /** Skip confirmation before destructive sync */
  yes?: boolean
  /** For Cursor: sync rules to/from User Rules SQLite DB (state.vscdb) instead of ~/.cursor/rules/ */
  cursorDb?: boolean
}

export const expandTilde = (path: string): string =>
  path.startsWith("~/") ? join(homedir(), path.slice(2)) : path

/** Tools that have at least one of GLOBAL_RULES or GLOBAL_SKILLS set */
export const getToolsWithGlobalPaths = (): ToolId[] =>
  TOOL_IDS.filter((id) => {
    const v = TOOL_VARIABLES[id]
    return v && (v.GLOBAL_RULES !== "" || v.GLOBAL_SKILLS !== "")
  })

export const runSync = async (
  direction: SyncDirection | undefined,
  options: SyncOptions = {},
): Promise<void> => {
  const repoRoot = resolve(options.repo ?? process.cwd())
  const toolsWithGlobal = getToolsWithGlobalPaths()
  const toolId = (options.tool ?? "cursor") as ToolId

  if (!TOOL_IDS.includes(toolId)) {
    p.log.error(`Unknown tool: ${toolId}`)
    return
  }

  const vars = TOOL_VARIABLES[toolId]
  if (!vars) {
    p.log.error(`No config for tool: ${toolId}`)
    return
  }

  const globalRules = vars.GLOBAL_RULES ? expandTilde(vars.GLOBAL_RULES) : ""
  const globalSkills = vars.GLOBAL_SKILLS ? expandTilde(vars.GLOBAL_SKILLS) : ""

  if (!globalRules && !globalSkills) {
    p.log.error(`Tool "${toolId}" has no GLOBAL_RULES or GLOBAL_SKILLS configured.`)
    if (toolsWithGlobal.length > 0) {
      p.log.message(`Tools with global paths: ${toolsWithGlobal.join(", ")}`)
    }
    return
  }

  const repoRules = join(repoRoot, "rules")
  const repoSkills = join(repoRoot, "skills")

  const useCursorDb = toolId === "cursor" && options.cursorDb === true
  let cursorDbPath: string | null = null
  if (useCursorDb) {
    cursorDbPath = getCursorStateDbPath()
    try {
      await access(cursorDbPath)
    } catch {
      p.log.error(`Cursor state DB not found at ${cursorDbPath}. Run Cursor at least once, or omit --cursor-db to sync files to ~/.cursor/rules/ instead.`)
      return
    }
  }

  let directionToUse = direction
  if (directionToUse === undefined) {
    const optionsList = [
      { value: "push", label: "Push — repo → global config" },
      { value: "pull", label: "Pull — global config → repo" },
      { value: "diff", label: "Diff — show differences only" },
    ]
    if (useCursorDb) {
      optionsList.push({ value: "inspect", label: "Inspect — list keys in Cursor state DB (diagnostics)" })
    }
    const selected = await p.select({
      message: "Sync direction",
      options: optionsList,
    })
    if (p.isCancel(selected)) {
      p.cancel("Sync cancelled.")
      return
    }
    directionToUse = selected as SyncDirection
  }

  if (directionToUse === "inspect") {
    if (!useCursorDb || !cursorDbPath) {
      p.log.error("Inspect requires --cursor-db (and default tool cursor). Run: pnpm sync inspect --cursor-db")
      return
    }
    const keys = listItemTableKeys(cursorDbPath)
    const rulesRelated = keys.filter(
      (k) =>
        k.key.includes("aicontext") || k.key.includes("rule") || k.key.includes("context") || k.key.includes("personal"),
    )
    p.log.info(`DB: ${cursorDbPath}`)
    p.log.info(`Key we use for User Rules: "${CURSOR_KEY}"`)
    const our = keys.find((k) => k.key === CURSOR_KEY)
    if (our) {
      p.log.message(`  → Present, value length: ${our.valueLength} bytes`)
    } else {
      p.log.warn(`  → Not found in ItemTable`)
    }
    if (rulesRelated.length > 0) {
      p.log.info("Other keys that might be rules-related:")
      for (const k of rulesRelated) {
        if (k.key !== CURSOR_KEY) p.log.message(`  ${k.key} (${k.valueLength} bytes)`)
      }
    }
    p.log.message("If rules don't show in Cursor Settings, Cursor may be using cloud sync; the UI might not read this DB.")
    return
  }

  const isDestructive = directionToUse === "push" || directionToUse === "pull"
  if (isDestructive && !options.yes) {
    const confirm = await p.confirm({
      message: `Sync uses --delete. Files at the destination that don't exist at the source will be removed. Continue?`,
      initialValue: false,
    })
    if (p.isCancel(confirm) || !confirm) {
      p.cancel("Sync cancelled.")
      return
    }
  }

  if (directionToUse === "diff") {
    if (globalSkills && !useCursorDb) {
      p.log.info(`Diff skills: ${repoSkills} vs ${globalSkills}`)
      try {
        execSync(`diff -rq "${repoSkills}" "${globalSkills}"`, { stdio: "inherit" })
      } catch {
        // diff exits 1 when files differ
      }
    }
    if (useCursorDb && cursorDbPath) {
      const repoContent = await composeRepoRules(repoRules).catch(() => "")
      const dbContent = readCursorUserRules(cursorDbPath) ?? ""
      if (repoContent === dbContent) {
        p.log.info("Cursor User Rules: repo and DB match.")
      } else {
        p.log.info("Cursor User Rules: repo and DB differ.")
        const base = join(tmpdir(), `cursor-diff-${randomBytes(8).toString("hex")}`)
        const repoFile = `${base}-repo.md`
        const dbFile = `${base}-db.md`
        try {
          writeFileSync(repoFile, repoContent, "utf-8")
          writeFileSync(dbFile, dbContent, "utf-8")
          execSync(`diff "${repoFile}" "${dbFile}"`, { stdio: "inherit" })
        } catch {
          // diff exits 1 when files differ
        } finally {
          try {
            unlinkSync(repoFile)
            unlinkSync(dbFile)
          } catch {
            /* ignore */
          }
        }
      }
    } else if (globalRules) {
      p.log.info(`Diff rules: ${repoRules} vs ${globalRules}`)
      try {
        execSync(`diff -rq "${repoRules}" "${globalRules}"`, { stdio: "inherit" })
      } catch {
        // diff exits 1 when files differ
      }
    }
    return
  }

  // push or pull
  const ensureTrailingSlash = (path: string): string => (path.endsWith("/") ? path : `${path}/`)

  if (directionToUse === "push") {
    if (globalSkills) {
      p.log.info(`Pushing skills: ${repoSkills}/ → ${globalSkills}`)
      execSync(`rsync -av --delete "${ensureTrailingSlash(repoSkills)}" "${ensureTrailingSlash(globalSkills)}"`, {
        stdio: "inherit",
      })
    }
    if (useCursorDb && cursorDbPath) {
      p.log.info(`Pushing rules: ${repoRules}/ → Cursor User Rules (state.vscdb)`)
      let content: string
      try {
        content = await composeRepoRules(repoRules)
      } catch (err) {
        p.log.error(`Could not read repo rules from ${repoRules}. Ensure the directory exists and is readable.`)
        return
      }
      writeCursorUserRules(cursorDbPath, content)
    } else if (globalRules) {
      p.log.info(`Pushing rules: ${repoRules}/ → ${globalRules}`)
      execSync(`rsync -av --delete "${ensureTrailingSlash(repoRules)}" "${ensureTrailingSlash(globalRules)}"`, {
        stdio: "inherit",
      })
    }
  } else {
    if (globalSkills) {
      p.log.info(`Pulling skills: ${globalSkills} → ${repoSkills}/`)
      execSync(`rsync -av --delete "${ensureTrailingSlash(globalSkills)}" "${ensureTrailingSlash(repoSkills)}"`, {
        stdio: "inherit",
      })
    }
    if (useCursorDb && cursorDbPath) {
      p.log.info(`Pulling rules: Cursor User Rules (state.vscdb) → ${repoRules}/cursor-user-rules.md`)
      const content = readCursorUserRules(cursorDbPath)
      if (content !== null) {
        await writeCursorUserRulesToRepo(repoRules, content)
      } else {
        p.log.warn("No User Rules found in Cursor DB.")
      }
    } else if (globalRules) {
      p.log.info(`Pulling rules: ${globalRules} → ${repoRules}/`)
      execSync(`rsync -av --delete "${ensureTrailingSlash(globalRules)}" "${ensureTrailingSlash(repoRules)}"`, {
        stdio: "inherit",
      })
    }
  }
}
