# ACI — Abstract Coding Interface

**Spec v0.1**
**Status:** Draft / MVP planning

---

## 1. Summary

ACI is a VS Code extension for spec-driven, non-vibe agentic coding. The developer writes high-level pseudocode in a left-hand pane; a local LLM (via Ollama or llama.cpp) "compiles" it into real, working source code streamed live into a read-only right-hand pane. The pseudocode is the source of truth and the only thing the developer edits directly — the generated code is a build artifact, regenerated on demand.

The core bet: separating "design" (human + pseudocode) from "implementation" (mechanical translation) lets the translation step run on small, cheap, local models instead of a frontier model, while keeping the codebase legible and reproducible from a single readable spec.

---

## 2. Goals

- A working two-pane VS Code extension: `.aci` pseudocode file on the left, live-streamed generated code on the right.
- Pluggable local-model backend supporting both Ollama and llama.cpp (OpenAI-compatible server mode).
- Deterministic-as-possible compilation: same pseudocode → same or near-same code, not wildly different output on every run.
- Read-only generated pane with correct syntax highlighting for the target language.
- Compile-on-save as the default trigger, with live/on-type as a later stretch goal.

## 3. Non-goals (for v0.1)

- Not trying to replace Copilot/Cursor/Kiro-class tools or compete on general-purpose agentic coding.
- Not building a new general-purpose programming language — the pseudocode format starts as a constrained, documented subset of natural language, not a full grammar/parser.
- No multi-file / whole-project compilation yet — single file in, single file out.
- No cloud/frontier-model backend in v0.1 — local models only, to keep the "cheap compiler" thesis testable.
- No round-trip sync (editing generated code and reflecting it back into pseudocode) — right pane is strictly output.

---

## 4. Core Concept & Constraints

### 4.1 The pseudocode format
This is the single most important design decision in the whole project, more than the extension plumbing. It needs to be:
- Loose enough that it's genuinely faster to write than real code.
- Constrained enough that a small (7B–20B class) model can translate it into correct code without needing a human to review every line.

**v0.1 approach:** define a lightweight, documented pseudocode style (not a formal grammar) — structured blocks like `FUNCTION`, `INPUT`, `OUTPUT`, `STEP`, `IF/ELSE`, `LOOP` — with a fixed vocabulary the compile prompt is built around. Treat this as versioned and testable in its own right, independent of the extension.

### 4.2 The "compiler"
Not a real deterministic compiler — an LLM prompted with:
1. The pseudocode format spec (as a system prompt / few-shot examples).
2. The target language.
3. The current pseudocode file content.

Output should be constrained (e.g. "respond with code only, no prose, no markdown fences") so it can be piped directly into the right pane without post-processing gymnastics.

### 4.3 Full regen vs. patching
v0.1: full regeneration of the right pane on every compile. Diff/patch-based regeneration (only touching changed regions) is a v2 concern — don't build it until full regen works end-to-end and you've felt the pain (or lack of it) firsthand.

---

## 5. Architecture

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  Left pane (real file)      │        │  Right pane (virtual doc)     │
│  foo.aci                    │        │  aci-live:foo.aci.py          │
│  — user edits pseudocode    │        │  — read-only, streamed        │
└──────────────┬───────────────┘        └───────────────▲────────────┘
               │ onDidSaveTextDocument                    │ update()
               ▼                                          │
      ┌────────────────────┐        stream tokens  ┌──────┴───────┐
      │ Compile Orchestrator│ ───────────────────► │ Model Backend │
      │ (builds prompt,     │                       │ Adapter       │
      │  manages state)     │ ◄─────────────────────┤ (Ollama /     │
      └────────────────────┘        response         │  llama.cpp)   │
                                                       └───────────────┘
```

### 5.1 Components

| Component | Responsibility |
|---|---|
| **Extension host (`extension.ts`)** | Activation, command registration, wiring events to orchestrator. |
| **TextDocumentContentProvider** | Owns the virtual right-pane document; exposes `update()`; fires change events to re-render. |
| **Compile Orchestrator** | On trigger, reads left pane, builds the compile prompt, calls the backend adapter, streams chunks into the provider (debounced). |
| **Model Backend Adapter** | Common interface (`chat(messages): AsyncIterable<string>`) with concrete implementations for Ollama (`/api/generate` or `/api/chat`) and llama.cpp (`/v1/chat/completions`, OpenAI-compatible). |
| **Configuration** | VS Code settings for backend choice, base URL, model name, target language, trigger mode. |
| **Pseudocode format docs** | Bundled reference (and few-shot examples) shipped with the extension, injected into every compile prompt. |

### 5.2 Backend adapter interface

```typescript
interface LocalModelBackend {
  chat(messages: { role: string; content: string }[]): AsyncIterable<string>;
}
```

Implementations: `OllamaBackend`, `OpenAICompatibleBackend` (covers llama.cpp, LM Studio, vLLM, etc. — same interface, different base URL).

---

## 6. Data Flow (single compile cycle)

1. User edits and saves `foo.aci`.
2. `onDidSaveTextDocument` fires → Compile Orchestrator invoked.
3. Orchestrator reads full file text, wraps it with the pseudocode-format system prompt + target-language instruction.
4. Orchestrator calls the active `LocalModelBackend.chat()`.
5. Tokens stream back; orchestrator buffers and debounces (~50ms) writes into the `TextDocumentContentProvider`.
6. Provider fires `onDidChange`; VS Code re-renders the right pane.
7. On stream completion, orchestrator marks compile as "done" (status bar indicator).

---

## 7. Configuration Schema (draft)

```json
{
  "aci.backend": { "type": "string", "enum": ["ollama", "openai-compatible"], "default": "ollama" },
  "aci.baseUrl": { "type": "string", "default": "http://localhost:11434" },
  "aci.model": { "type": "string", "default": "llama3" },
  "aci.targetLanguage": { "type": "string", "default": "python" },
  "aci.compileTrigger": { "type": "string", "enum": ["onSave", "onType"], "default": "onSave" },
  "aci.onTypeDebounceMs": { "type": "number", "default": 800 }
}
```

---

## 8. MVP Scope (build order)

1. Extension scaffold (`yo code`), basic activation.
2. Ollama backend adapter, hardcoded model, plain `fetch` streaming to console — prove the network path works.
3. `TextDocumentContentProvider` + `ViewColumn.Beside` split — prove the two-pane layout works with static text.
4. Wire compile trigger (on-save) → orchestrator → backend → provider, full pipeline, one direction, no config UI.
5. Add config schema, backend switch (Ollama / OpenAI-compatible), target language.
6. Write and iterate on the pseudocode format spec as its own testable artifact (not extension code) — feed it sample `.aci` files against 2–3 candidate small models, evaluate output correctness by hand.
7. Polish: status bar compile indicator, error handling for unreachable backend, debounce tuning.

## 9. Stretch / v2

- On-type live compilation.
- Diff/patch-based regeneration instead of full rewrite.
- Multi-file pseudocode projects.
- Formalize the pseudocode format into an actual parseable grammar if small-model translation proves unreliable on the loose version.
- Marketplace packaging (`vsce package` / publish).

---

## 10. Open Questions / Risks

- **Determinism:** how much does output vary run-to-run for identical pseudocode on the same small model? This needs to be measured, not assumed, before the rest of the design is finalized.
- **Small-model ceiling:** is there a pseudocode complexity level past which small models produce unreliable code, forcing a fallback to a larger model? If so, define that fallback path early.
- **Format rigidity trade-off:** looser pseudocode = faster to write, harder to compile reliably. Tighter format = more reliable compile, closer to just writing a DSL. Where's the right point on that spectrum — needs empirical testing, not a guess.
- **Value proposition validation:** confirm the cost/legibility argument holds up against existing spec-driven tools (GitHub Spec Kit, AWS Kiro, OpenSpec) before investing heavily in the "small model as compiler" angle specifically — that's the one thing this project claims that they don't.

---

*This spec is intentionally scoped to a buildable MVP. The pseudocode format (§4.1) should be prototyped and tested against real models before writing much extension code — it determines whether the whole idea works.*
