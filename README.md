# ACI — Abstract Coding Interface

ACI is a VS Code extension for spec-driven local-model coding. Write high-level pseudocode in **PSyx** (`.aci` files) and a local LLM compiles it into real source code — block by block, streamed live into a persistent side-pane file.

The core idea: keep a human-readable spec as the source of truth, and let a cheap local model do the mechanical translation. Editing a single function recompiles only that function, not the whole file.

---

## Documentation

| Doc | Description |
|---|---|
| [PSyx Format](./docs/psyx-format.md) | Language reference — block markers, keywords, full example |
| [Backends](./docs/backends.md) | How to configure Ollama, llama.cpp, LM Studio, and others |
| [Architecture](./docs/architecture.md) | How ACI works internally — module breakdown and design rationale |
| [Contributing](./docs/contributing.md) | Dev setup, project structure, adding backends and keywords |

---

## Quick Start

**1. Start a local model server**

```bash
ollama serve
ollama pull qwen2.5-coder:7b
```

**2. Configure ACI** (`Ctrl+,` → search "ACI")

```json
"aci.backend": "ollama",
"aci.baseUrl": "http://localhost:11434",
"aci.model": "qwen2.5-coder:7b",
"aci.targetLanguage": "python"
```

**3. Write a `.aci` file**

```
USE os

FUNC-START greet
  INPUT name as string
  IF name is empty
    RETURN "Hello, World!"
  RETURN "Hello, " + name
FUNC-END
```

**4. Save** — ACI opens `greet.py` beside your spec and streams the compiled output live.

Edit any block, save again — only that block is recompiled and patched in. Everything else is preserved.

---

## PSyx at a Glance

```
FUNC-START <name>   →  compiles to a function
FUNC-END

CLASS-START <name>  →  compiles to a class
CLASS-END

# anything outside a marker = preamble (imports, globals)
```

Full reference: [docs/psyx-format.md](./docs/psyx-format.md)

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `aci.backend` | `ollama` | `ollama` or `openai-compatible` |
| `aci.baseUrl` | `http://localhost:11434` | Base URL of your model server |
| `aci.model` | `llama3` | Model name |
| `aci.targetLanguage` | `python` | Output language |
| `aci.compileTrigger` | `onSave` | `onSave` or `onType` |
| `aci.onTypeDebounceMs` | `800` | Debounce for onType mode |

---

## Install from VSIX

**Build the package:**
```bash
npm install
npx @vscode/vsce package
```

**Install:**
```bash
code --install-extension aci-0.1.0.vsix
```

Or: Extensions view → `...` → **Install from VSIX...**

---

## Development

```bash
npm install
# Press F5 in VS Code to launch Extension Development Host
# Or run:
npm run watch   # auto-recompile on change
```

See [docs/contributing.md](./docs/contributing.md) for the full guide.
