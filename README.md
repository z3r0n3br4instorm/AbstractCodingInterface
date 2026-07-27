<div align="center">
  <img src="Public/logo.png" alt="ACI Logo" width="600" />
</div>

# ACI — Abstract Coding Interface

> **Linux & macOS — install in one line:**
> ```bash
> curl -fsSL https://raw.githubusercontent.com/z3r0n3br4instorm/AbstractCodingInterface/main/install.sh | bash
> ```

ACI is a VS Code extension for spec-driven local-model coding. Write high-level pseudocode in **PSyx** (`.aci` files) and a local LLM compiles it into real source code — block by block, streamed live into a persistent side-pane file.

The core idea: keep a human-readable spec as the source of truth, and let a cheap local model do the mechanical translation. Editing a single function recompiles only that function, not the whole file.

---

### Key Features
- **Real-time Compilation**: Write pseudocode in `.aci` files and watch it seamlessly translate into real code (Python, JS, TS, Go, Rust, Java, C++, Ruby, PHP).
- **Target Language Agnostic**: One PSyx file can be compiled into any language simply by changing the target configuration.
- **Incremental Diff Compilation**: Only changed blocks are sent to the LLM and updated in the output file, avoiding the context bloat of full-file generation.
- **Positional Code Patching**: Add relative markers like `AFTER-BLOCK-main` in `.aci` files to seamlessly inject new snippets into existing codebases.
- **Make PSyx Compatible**: Transform existing source code into PSyx-compatible projects instantly by annotating it with ACI block comments.
- **Top Bar Integration**: Easy access buttons directly in the editor tab bar for Compilation and Compatibility actions.
- **Local Model Support**: Integrates seamlessly with Ollama (`llama3`, `qwen`, `phi3`) for offline, zero-latency coding or any OpenAI-compatible API.

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

```text
IMPORT-BLK-START
  ... explicit import requirements ...
IMPORT-BLK-END

FUNC-START <name>
  ... pseudocode ...
FUNC-END

CLASS-START <name>
  ... pseudocode ...
CLASS-END

FUNC-MAIN
  ... main program logic ...
FUNC-END

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

## Install

### One-liner (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/z3r0n3br4instorm/AbstractCodingInterface/main/install.sh | bash
```

Automatically downloads the latest release from GitHub and installs it via the `code` CLI.

### Build from source

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
