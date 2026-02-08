---
title: "tree-prompt.test.ts"
created: 2026-02-08
modified: 2026-02-08
---

# tree-prompt.test.ts — 9 tests

**Source**: `scripts/shared/__tests__/tree-prompt.test.ts`
**Module under test**: `scripts/shared/tree-prompt.ts`

Tests the data model behind the interactive tree multiselect prompt. Only the pure data functions are tested — `buildTree()` and `getSelectedRules()`. The interactive `treeMultiSelect()` function (which reads from stdin) is not unit tested.

## `buildTree` — 5 tests

Constructs a `TreeNode[]` hierarchy from `DiscoveredSource[]`. Each source becomes a directory node; each rule becomes a leaf node.

| Test                                     | What it checks                                                       |
| ---------------------------------------- | -------------------------------------------------------------------- |
| creates root nodes for each source       | Two sources → two root directory nodes with `isDirectory: true`      |
| creates children for each rule           | Source with 2 rules → directory node with 2 children                 |
| defaults to selected and expanded        | All nodes start with `selected: true` and `expanded: true`           |
| attaches ruleFile and hint to leaf nodes | Each leaf has a `ruleFile` reference and `hint` from the description |
| handles empty sources                    | Empty input `[]` → empty tree `[]`                                   |

## `getSelectedRules` — 4 tests

Recursively walks a `TreeNode[]` tree and collects `RuleFile` objects from selected leaf nodes.

| Test                              | Tree state                          | Expected                                |
| --------------------------------- | ----------------------------------- | --------------------------------------- |
| all selected                      | Both leaves `selected: true`        | Both `RuleFile`s returned               |
| partial selection                 | One selected, one not               | Only the selected one                   |
| none selected                     | All leaves `selected: false`        | Empty array                             |
| nested directories and empty tree | Leaf inside nested dir + empty `[]` | Found via recursion; empty returns `[]` |
