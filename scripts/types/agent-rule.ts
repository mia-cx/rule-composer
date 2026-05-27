export type AgentRule = Rule | Skill | Subagent | Command;

/** Category id → human-readable description (for docs/UI). */
export const RULE_CATEGORIES: { [key: string]: string } = {
	identity: "Who is the agent, high-level project overview 'what is this codebase?', etc.",
	workflow: "How to work, task management, step-by-step instructions, etc.",
	structure: "Workspace shape, file structure, tooling, etc.",
	"code-guidelines": "How to write code, style, naming, patterns, etc.",
	quality: "Formatting, linting, testing (how to write tests), etc.",
	documentation: "How and where to document the codebase.",
	"domain-knowledge": "Project-specific knowledge, features, patterns and capabilities.",
	meta: "Rules about rules, when and how to create and use them, and other AI-tooling context.",
}

interface BaseRule {
	name: string;
	description: string;
	body: string;
	category: keyof typeof RULE_CATEGORIES;
}

interface Rule extends BaseRule {
	type: "rule";
	alwaysApply: boolean;
	globs: string;
}

interface Skill extends BaseRule {
	type: "skill";
}

interface Subagent extends BaseRule {
	type: "agent";
	model: "string";
}

interface Command extends BaseRule {
	type: "command";
}
