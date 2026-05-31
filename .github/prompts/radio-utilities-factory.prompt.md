---
description: "Scaffold a new Radio Horizont utility module (agent role, topic source, filter, or pipeline stage) following the existing radio-horizont architecture."
name: "Build Radio Utilities Factory"
argument-hint: "Describe the utility to add (e.g. 'a guest-voice agent', 'a trending news topic source', 'a profanity filter stage')"
agent: "agent"
tools: [read_file, create_file, replace_string_in_file, semantic_search]
---

You are extending **Radio Horizont** — an AI-powered science and history radio station.

## Project layout (read before editing)

- [radio-horizont/agents.js](../../radio-horizont/agents.js) — multi-agent pipeline: `topicPicker → chiefEditor → researchAgent → audioAgent → safetyAgent`
- [radio-horizont/topic-factory.js](../../radio-horizont/topic-factory.js) — live category pool: seed → GPT generation → scoring → retirement
- [radio-horizont/topics.js](../../radio-horizont/topics.js) — seed categories + `nextCategory()` export
- [radio-horizont/tts.js](../../radio-horizont/tts.js) — text-to-speech synthesis
- [radio-horizont/server.js](../../radio-horizont/server.js) — Express server + segment queue

## Task

Build the utility described in the argument.

### Rules

1. **Read the relevant files first** before writing any code. Understand existing patterns.
2. **Match the coding style**: CommonJS (`'use strict'`, `require`/`module.exports`), no TypeScript, descriptive section comments (`// ── Section ──`).
3. **OpenAI calls** must use the shared `chat()` helper pattern from `agents.js` (system prompt + user content, configurable temperature, optional `jsonMode`).
4. **TopicFactory extensions** must preserve the pool contract: every item is `{ category: string, score: number, usageCount: number }`, and the `_pool`, `_used`, `_generating` internals stay intact.
5. **New pipeline stages** must accept a string and return a string (or a JSON object for terminal stages like `safetyAgent`).
6. **Wire it up**: if the new module needs to be called from `server.js`, `topics.js`, or `agents.js`, add the `require` and call site — don't leave it disconnected.
7. **No new dependencies** unless strictly necessary. Reuse `openai` (already installed).
8. **Environment variables**: API keys come from `process.env` via `dotenv` — never hardcode secrets.

### Output

- Create the new file(s) under `radio-horizont/`.
- Show exactly which lines to add in any existing file that needs wiring.
- Briefly describe how to test the new utility (e.g., `node radio-horizont/<file>.js`).
