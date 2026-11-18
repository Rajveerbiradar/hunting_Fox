---
inclusion: always
---

# Hunting Fox: read this before any change

The whole project (what it does, stack, env vars, database, how a search runs, design rules, copy rules, prompts) is in CLAUDE.md:

#[[file:CLAUDE.md]]

Rules for every change:

- Follow the design rules and copy rules in CLAUDE.md exactly (blue gradient only on one main button, grey sub text, no yellow/orange/pink, plain student words).
- Every prompt in `prompts/` keeps the same structure: `*SYSTEM PROMPT: ...*` title, purpose, INPUTS, step-by-step WORKFLOW, output rules, CRITICAL RULES, TONE, BAD vs GOOD, OUTPUT FORMAT (exact JSON). Never shorten a prompt to a few lines.
- AI never invents facts about a student. Unconfirmed skills become questions, never resume lines.
- Before every commit: `npx tsc --noEmit && npm run lint && npm run build` must pass.
- New table or column: new numbered file in `supabase/migrations/`, plus a line in CLAUDE.md, and tell Rajveer to run it in Supabase.
- Update CLAUDE.md in the same commit whenever behaviour it describes changes.
- Commit to `main` and push; Vercel deploys automatically.
