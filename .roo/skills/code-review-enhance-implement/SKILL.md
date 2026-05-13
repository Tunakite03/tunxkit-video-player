---
name: code-review-enhance-implement
description: Guides step-by-step code improvement work by first reviewing and double-checking existing code, then planning enhancements or upgrades, and finally implementing validated changes. Use when the user asks to think step by step, review code, verify correctness, plan improvements, enhance features, upgrade implementation quality, refactor safely, or implement a reviewed plan.
---

# Code Review, Enhance, Implement

## When to use this skill

Use this skill when the user wants a disciplined code-improvement workflow that must happen in order:

1. Understand the request and code context.
2. Review and double-check existing implementation.
3. Plan enhancements, upgrades, refactors, or fixes.
4. Implement the plan safely.
5. Verify the result.

Typical triggers include: "think step by step", "review then improve", "double check the code", "plan enhancements", "upgrade this code", "refactor safely", or "implement after reviewing".

## When NOT to use this skill

Do not use this skill when:

- The user asks only for an explanation and explicitly does not want code changes.
- The task is a trivial one-line edit that does not require review or planning.
- The user has already provided a complete approved plan and only asks for direct implementation.
- The request is about creating or editing Agent Skills; use the skill-authoring workflow instead.

## Inputs required

Before acting, identify:

- The user goal and success criteria.
- Target files, features, or bug reports.
- Constraints such as framework, style, compatibility, performance, security, accessibility, or test requirements.
- Whether implementation is authorized. If the user only asked for review or planning, stop before editing code.

## Workflow

1. Restate the goal in one sentence.
2. Inspect relevant project context before editing:
   - Use semantic/codebase search first when exploring unfamiliar code.
   - Read only the files needed to understand the affected flow.
   - Prefer existing project patterns over introducing new abstractions.
3. Review and double-check the current code:
   - Trace data flow, state changes, side effects, and error paths.
   - Check naming, typing, boundaries, performance, security, accessibility, and user experience.
   - Look for hidden coupling, stale assumptions, duplicated logic, and missing validation.
   - Verify whether the observed issue or enhancement request is real before changing code.
4. Produce a concise plan before implementation:
   - List the exact changes in execution order.
   - Identify risks and rollback points.
   - Include tests or validation commands when available.
   - If the plan changes public APIs, data formats, or behavior, call out the compatibility impact.
5. Implement the smallest safe change that satisfies the plan:
   - Keep edits targeted and consistent with existing style.
   - Avoid unrelated cleanup unless it directly reduces risk for the requested change.
   - Preserve backwards compatibility unless the user explicitly approved a breaking change.
6. Verify the implementation:
   - Run the most relevant checks available, such as typecheck, lint, unit tests, build, or focused manual validation.
   - If a check cannot be run, explain why and provide the closest manual verification performed.
   - Re-read changed code paths to catch regressions introduced during implementation.
7. Summarize the result:
   - State what changed.
   - State what was verified.
   - Mention any remaining risks or follow-up items without asking open-ended questions.

## Review checklist

Use this checklist during the review phase:

- Does the code satisfy the user-visible behavior requested?
- Are edge cases handled explicitly?
- Are async operations, cleanup, and race conditions handled safely?
- Are errors surfaced or recovered consistently with project patterns?
- Are types accurate and narrow enough to prevent misuse?
- Are components/hooks/stores separated according to existing architecture?
- Is the implementation maintainable without over-engineering?
- Are tests or validation steps updated when behavior changes?

## Planning checklist

A good plan should include:

- Files to edit.
- Ordered implementation steps.
- Validation steps.
- Risks and assumptions.
- Any user approval needed before breaking changes or broad refactors.

## Implementation rules

- Do not skip review just because the requested change seems obvious.
- Do not implement speculative enhancements not tied to the user goal.
- Prefer incremental edits over broad rewrites.
- Keep the final answer factual: changed files, verification performed, and outcome.
