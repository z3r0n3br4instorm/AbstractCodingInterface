# Architecture

This document describes how ACI works internally — how the pieces connect, where the important decisions live, and why certain trade-offs were made.

---

## Overview

```
.aci file (PSyx pseudocode)
        │
        │ onDidSaveTextDocument
        ▼
┌─────────────────────┐
│  CompileOrchestrator │
│  - parse PSyx blocks │
│  - diff vs. last run │
│  - compile changed   │
└────────┬────────────┘
         │ messages[]
         ▼
┌─────────────────────┐     token stream     ┌──────────────────┐
│  LocalModelBackend  │ ───────────────────► │  OutputAssembler  │
│  (Ollama / OpenAI)  │                      │  - merge blocks   │
└─────────────────────┘                      │  - write to editor│
                                              └──────────────────┘
                                                       │
                                                       ▼
                                              foo.py (real file)
                                              streamed live, side pane
```

---

## Module Breakdown

### `src/extension.ts`

The VS Code extension entry point. Responsible for:
- Creating the status bar item used during compilation.
- Registering the `onDidSaveTextDocument` and `onDidChangeTextDocument` event listeners.
- Registering the `aci.compile` manual command.
- Wiring everything to a single `CompileOrchestrator` instance.

It deliberately contains no business logic. All compilation behavior lives in the orchestrator.

---

### `src/config/Configuration.ts`

A thin, typed wrapper over `vscode.workspace.getConfiguration('aci')`. Every setting is read through this class, keeping the rest of the codebase decoupled from the VS Code configuration API.

Values are read on-demand (not cached), so changes to settings in VS Code's UI are reflected immediately on the next compile without restarting the extension.

---

### `src/psyx/PsyxParser.ts`

Parses a raw `.aci` file into an ordered array of `PsyxBlock` objects:

```typescript
interface PsyxBlock {
  kind: 'func' | 'class' | 'preamble';
  name: string;
  body: string;
  index: number;
}
```

The parser is a simple line-by-line state machine. It does not use a formal grammar or tokenizer. This is intentional: PSyx is not a real language and the parser only needs to identify block boundaries, not parse expressions.

`blocksChanged(prev, next)` compares two arrays of blocks (keyed by `kind:name`) and returns only the blocks whose body has changed since the last run. This is the mechanism that avoids recompiling unchanged functions.

---

### `src/psyx/OutputAssembler.ts`

Handles the serialization and deserialization of the compiled output file. The output file format uses inline markers:

```
// ACI-BLOCK: func:my_function
<compiled code>
// ACI-BLOCK-END
```

**`serializeOutput(blocks)`**: converts an ordered list of `CompiledBlock` objects into the marked output string.

**`deserializeOutput(source)`**: reads the markers back from an existing output file, reconstructing the block list for comparison on the next save.

**`mergeBlocks(existing, incoming, freshCode)`**: stitches together the final output. For each PSyx block in order:
- If `freshCode` contains a newly compiled version → use it.
- If the existing file has a previous compiled version → preserve it unchanged.
- If neither exists (new block, still compiling) → emit an empty placeholder.

This merge is what allows live streaming into the editor mid-compilation: the file is valid and complete at every point during the stream, with older blocks already present and the streaming block filling in.

---

### `src/core/CompileOrchestrator.ts`

The main engine. On each compile cycle:

1. Parse the `.aci` document with `PsyxParser`.
2. Try to open the existing output file and deserialize its blocks.
3. Compute which blocks changed using `blocksChanged`.
4. Open the output file in `ViewColumn.Beside`.
5. For each changed block (in order):
   - Show `$(sync~spin) ACI: Compiling <name> (i/n)` in the status bar.
   - Send a focused single-block prompt to the backend.
   - Stream tokens into `freshCode` map as they arrive.
   - Every 50ms, call `mergeBlocks` + `serializeOutput` + `editor.edit()` to push the current partial state live to the editor.
6. After all blocks finish, do a final `editor.edit()` with `undoStopAfter: true` so the whole compilation is one undoable action.
7. Save the file.

The orchestrator also manages a `compiling` set to prevent concurrent compilations of the same file (e.g., rapid saves), and clears it in a `finally` block to avoid deadlocks on error.

---

### `src/backends/`

#### `LocalModelBackend.ts` (interface)
```typescript
interface LocalModelBackend {
  chat(messages: Message[]): AsyncIterable<string>;
}
```

The single method yields individual token strings as they arrive from the model. The orchestrator is completely decoupled from how the HTTP transport works.

#### `OllamaBackend.ts`
Calls `POST /api/chat` with `{ stream: true }`. Parses the Ollama NDJSON format: each line is a complete JSON object with `message.content`. Uses a line buffer to handle chunks that don't align on newline boundaries.

#### `OpenAICompatibleBackend.ts`
Calls `POST /v1/chat/completions` with `{ stream: true }`. Parses Server-Sent Events (SSE): each `data: {...}` line is a delta. Uses the same line buffering technique. Handles the `[DONE]` sentinel.

#### `BackendFactory.ts`
Simple factory: reads `aci.backend` from configuration and returns the appropriate concrete implementation.

---

## Key Design Decisions

### Why block-level compilation instead of whole-file diff?

Diff-based approaches ask the model to output a structured diff format (e.g., `<<<< ==== >>>>`). Small local models are unreliable at this: they hallucinate markers, misalign indentation, or produce no output at all. Block-level compilation sidesteps the problem entirely — each model call is a simple full-translation of a small focused piece of pseudocode. The stitching is done deterministically in code.

### Why no formal grammar for PSyx?

Writing a formal grammar (ANTLR, PEG, etc.) would over-constrain the format early and make it harder to iterate on what vocabulary works best with small models. The block markers (`FUNC-START`, `CLASS-START`) are the only truly structural element. Everything else is natural-language prose that the model interprets, and the right vocabulary should be discovered empirically by testing against real models.

### Why streaming into a real file instead of a virtual document?

Virtual documents (the `aci-live:` scheme) don't participate in VS Code's normal file system, which means no LSP, no git tracking, and no persistence across reloads. Real files sitting next to the `.aci` source are immediately usable — you can import them, run them, commit them, and get full IDE support.

### Why a status bar item instead of `withProgress`?

`vscode.window.withProgress` blocks the extension host's microtask queue, which prevents `editor.edit()` calls from resolving during the progress callback. A status bar item has no such restriction and allows true concurrent streaming into the editor.
