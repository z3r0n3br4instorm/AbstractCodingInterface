# Contributing

This guide covers everything needed to work on ACI locally: building, running, and testing the extension.

---

## Prerequisites

- [Node.js](https://nodejs.org) 18 or later
- [VS Code](https://code.visualstudio.com) 1.90 or later
- A running local model backend (Ollama recommended — see [backends.md](./backends.md))
- TypeScript knowledge for modifying the extension source

---

## Setup

```bash
git clone <your-fork-url>
cd ACI
npm install
```

---

## Development Workflow

### Run in Extension Development Host

Press **F5** in VS Code with the ACI project open. This:
1. Compiles the TypeScript via `tsc -p ./`.
2. Launches a new VS Code window with your extension active.
3. Any changes to `src/` require running `npm run compile` again and reloading the extension host (`Ctrl+Shift+P` → "Developer: Reload Window").

### Watch Mode

```bash
npm run watch
```

Keeps `tsc` running in watch mode. After any source change, just reload the extension host — no manual compile step needed.

---

## Project Structure

```
ACI/
├── src/
│   ├── extension.ts              # Extension entry point
│   ├── config/
│   │   └── Configuration.ts     # Settings accessor
│   ├── core/
│   │   └── CompileOrchestrator.ts  # Main compilation engine
│   ├── psyx/
│   │   ├── PsyxParser.ts        # .aci block parser
│   │   └── OutputAssembler.ts   # Output file serializer/merger
│   └── backends/
│       ├── LocalModelBackend.ts  # Shared interface
│       ├── OllamaBackend.ts
│       ├── OpenAICompatibleBackend.ts
│       └── BackendFactory.ts
├── syntaxes/
│   └── aci.tmLanguage.json      # PSyx syntax highlighting grammar
├── docs/
│   ├── psyx-format.md           # PSyx language reference
│   ├── backends.md              # Backend configuration guide
│   ├── architecture.md          # Internal architecture notes
│   └── contributing.md          # This file
├── specs/
│   └── aci-spec.md              # Original product spec
├── language-configuration.json  # Bracket/comment config for .aci
├── package.json
└── tsconfig.json
```

---

## Adding a New Backend

1. Create `src/backends/MyBackend.ts`:
   ```typescript
   import { LocalModelBackend, Message } from './LocalModelBackend';

   export class MyBackend implements LocalModelBackend {
     async *chat(messages: Message[]): AsyncIterable<string> {
       // yield individual token strings as they stream in
     }
   }
   ```
2. Register it in `BackendFactory.ts`:
   ```typescript
   if (type === 'my-backend') return new MyBackend();
   ```
3. Add the enum value to `package.json` under `aci.backend.enum`.

---

## Adding PSyx Keywords

Keywords are defined in two places:

1. **`syntaxes/aci.tmLanguage.json`** — controls syntax highlighting. Add new keywords to the `keywords` pattern's `match` regex.
2. **`src/core/CompileOrchestrator.ts`** — the `buildSystemPrompt()` function. Update the system prompt to mention new keywords so the model knows how to translate them.

---

## Packaging

```bash
npx @vscode/vsce package
```

Produces `aci-<version>.vsix`. Install with:

```bash
code --install-extension aci-0.1.0.vsix
```

---

## Linting

```bash
npm run lint
```

Uses `@typescript-eslint`. Fix errors before committing.
