import { describe, it, expect } from "vitest"
import {
  openRouterResponseSchema,
  optimizedOutputSchema,
  ruleFrontmatterSchema,
  decomposeResponseSchema,
} from "../schemas.js"

describe("openRouterResponseSchema", () => {
  it("accepts a valid response", () => {
    const valid = {
      id: "gen-123",
      choices: [
        {
          message: { content: "Hello world" },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    }
    const result = openRouterResponseSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it("accepts response without usage", () => {
    const valid = {
      id: "gen-123",
      choices: [
        {
          message: { content: "Hello" },
          finish_reason: null,
        },
      ],
    }
    const result = openRouterResponseSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it("rejects response missing id", () => {
    const invalid = {
      choices: [{ message: { content: "Hello" }, finish_reason: "stop" }],
    }
    const result = openRouterResponseSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it("rejects response with missing message content", () => {
    const invalid = {
      id: "gen-123",
      choices: [{ message: {}, finish_reason: "stop" }],
    }
    const result = openRouterResponseSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })
})

describe("optimizedOutputSchema", () => {
  it("accepts valid markdown with headings", () => {
    const valid = "# My Rules\n\n## Approach\n\nPlan first. This is long enough to pass the minimum length requirement."
    const result = optimizedOutputSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it("rejects output shorter than 50 chars", () => {
    const result = optimizedOutputSchema.safeParse("# Short")
    expect(result.success).toBe(false)
  })

  it("rejects output without headings", () => {
    const noHeadings = "This is a long enough string but it has no markdown headings at all in the entire content."
    const result = optimizedOutputSchema.safeParse(noHeadings)
    expect(result.success).toBe(false)
  })

  it("rejects output that looks like JSON", () => {
    const jsonLike = '# Rules\n\n```json\n{"key": "value"}\n```\nThis is long enough to pass.'
    const result = optimizedOutputSchema.safeParse(jsonLike)
    expect(result.success).toBe(false)
  })
})

describe("ruleFrontmatterSchema", () => {
  it("accepts valid frontmatter", () => {
    const valid = {
      description: "My rule",
      alwaysApply: true,
    }
    const result = ruleFrontmatterSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it("accepts frontmatter with globs as string", () => {
    const valid = {
      description: "File pattern",
      globs: "**/*.ts",
    }
    const result = ruleFrontmatterSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it("accepts frontmatter with globs as array", () => {
    const valid = {
      description: "Multiple patterns",
      globs: ["**/*.ts", "**/*.tsx"],
    }
    const result = ruleFrontmatterSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it("accepts empty object", () => {
    const result = ruleFrontmatterSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it("rejects alwaysApply as string", () => {
    const invalid = { alwaysApply: "yes" }
    const result = ruleFrontmatterSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })
})

describe("decomposeResponseSchema", () => {
  it("accepts valid decompose response with headings", () => {
    const valid = [
      {
        name: "coding-conventions",
        description: "Code style and naming conventions",
        headings: ["Coding Conventions"],
      },
      {
        name: "testing-strategy",
        description: "Testing approach and tools",
        headings: ["Testing"],
      },
    ]
    const result = decomposeResponseSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it("accepts multiple headings in one rule", () => {
    const valid = [
      {
        name: "technology",
        description: "Technology stack and tooling",
        headings: ["Technology Preferences", "Tooling", "Backend & Data"],
      },
    ]
    const result = decomposeResponseSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it("accepts __preamble__ as a heading", () => {
    const valid = [
      {
        name: "overview",
        description: "Project overview and preamble",
        headings: ["__preamble__"],
      },
    ]
    const result = decomposeResponseSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it("rejects empty headings array", () => {
    const invalid = [
      {
        name: "coding",
        description: "Code style rules",
        headings: [],
      },
    ]
    const result = decomposeResponseSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it("rejects invalid names and short descriptions", () => {
    // Non-kebab-case
    expect(
      decomposeResponseSchema.safeParse([
        {
          name: "CodingConventions",
          description: "Code style",
          headings: ["Coding"],
        },
      ]).success,
    ).toBe(false)

    // Underscores
    expect(
      decomposeResponseSchema.safeParse([
        {
          name: "coding_conventions",
          description: "Code style",
          headings: ["Coding"],
        },
      ]).success,
    ).toBe(false)

    // Short description
    expect(
      decomposeResponseSchema.safeParse([{ name: "coding", description: "Hi", headings: ["Coding"] }]).success,
    ).toBe(false)
  })

  it("accepts empty array", () => {
    const result = decomposeResponseSchema.safeParse([])
    expect(result.success).toBe(true)
  })

  it("accepts valid directory field", () => {
    const valid = [
      {
        name: "unit-tests",
        description: "Unit testing conventions",
        headings: ["Unit Tests"],
        directory: "testing",
      },
    ]
    const result = decomposeResponseSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it("accepts nested directory path", () => {
    const valid = [
      {
        name: "cloudflare",
        description: "Cloudflare deployment rules",
        headings: ["Cloudflare"],
        directory: "infrastructure/deploy",
      },
    ]
    const result = decomposeResponseSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it("directory field is optional and defaults to undefined", () => {
    const result = decomposeResponseSchema.safeParse([
      {
        name: "approach",
        description: "General approach rules",
        headings: ["Approach"],
      },
    ])
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data[0]!.directory).toBeUndefined()
    }
  })

  it("rejects invalid directory values", () => {
    const base = {
      name: "test",
      description: "Test rules",
      headings: ["Test"],
    }

    // Uppercase
    expect(decomposeResponseSchema.safeParse([{ ...base, directory: "Testing" }]).success).toBe(false)
    // Underscores
    expect(decomposeResponseSchema.safeParse([{ ...base, directory: "my_tests" }]).success).toBe(false)
    // Trailing slash
    expect(decomposeResponseSchema.safeParse([{ ...base, directory: "testing/" }]).success).toBe(false)
  })

  it("rejects response missing headings field", () => {
    const invalid = [
      {
        name: "coding",
        description: "Code style rules",
        content: "## Coding\n\nRules here.",
      },
    ]
    const result = decomposeResponseSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })
})
