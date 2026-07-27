# PSyx Language Reference

PSyx (PseudoSyntax) is the pseudocode format used by ACI. It is intentionally minimal — it gives enough structure for a small local model to produce reliable, deterministic output, while staying fast enough to write that it does not feel like a real programming language.

---

## Design Goals

- **Fast to write**: quicker than real code; no brackets, types, or semicolons required
- **Structured enough to compile**: block boundaries are explicit so the compiler only touches what changed
- **Model-agnostic**: the vocabulary is simple enough for 7B–13B class local models

---

## File Extension

PSyx files use the `.aci` extension. VS Code will automatically apply syntax highlighting and trigger ACI compilation on save.

---

## Block Markers

Block markers are the only strict syntax in PSyx. They define boundaries between logical units of code. Order matters — blocks are compiled and stitched into the output file in the exact order they appear in the `.aci` file.

### Function Block

```
FUNC-START <name>
  ... your pseudocode ...
FUNC-END
```

- `<name>` must be a single word (no spaces). Use underscores for multi-word names.
- Maps to a function or method in the target language.
- On re-save, if only this block changed, only this function is recompiled.

### Class Block

```
CLASS-START <name>
  ... your pseudocode, including nested FUNC-START/FUNC-END blocks ...
CLASS-END
```

- The entire class body (including nested functions) is treated as a single block.
- Nested `FUNC-START`/`FUNC-END` inside a class are for human readability and are passed verbatim to the model — they are not parsed as separate tracked blocks.

### Preamble (No Marker)

Any lines outside a `FUNC-START`/`CLASS-START` block form the **preamble**. This is compiled as a single block and is the right place for:

- Import statements
- Global constants
- Module-level configuration

---

## Keywords

These are recognized and highlighted by the PSyx grammar. They are not enforced by a strict parser — they are vocabulary suggestions that the compile prompt is tuned around, making translation more reliable.

| Keyword | Intended Use |
|---|---|
| `INPUT` | Declare inputs / parameters |
| `OUTPUT` | Describe expected outputs |
| `STEP` | A single procedural step |
| `SET` / `LET` | Variable assignment |
| `IF` / `ELSE` | Conditional branching |
| `WHEN` / `THEN` | Alternative conditional phrasing |
| `LOOP` | Iteration (over a list, range, condition) |
| `IN` / `OF` | Used with LOOP for iteration targets |
| `CALL` | Invoke another function |
| `RETURN` | Return a value |
| `RAISE` | Raise an error or exception |
| `TRY` / `CATCH` / `FINALLY` | Error handling |
| `IMPORT` / `USE` / `FROM` | Declare dependencies |
| `AS` / `WITH` | Binding or context managers |
| `AND` / `OR` / `NOT` | Boolean logic |
| `TO` | Range boundaries or assignment targets |
| `ASYNC` / `AWAIT` / `YIELD` | Async and generator constructs |

---

## Comments

Use `#` for single-line comments. They are stripped before compilation.

```
# This is a comment
FUNC-START my_function
  # This comment is passed to the model as context
  INPUT value as number
  RETURN value * 2
FUNC-END
```

---

## Full Example

```
# Imports and globals
USE os
USE json
SET CONFIG_PATH = "config.json"

FUNC-START load_config
  INPUT path as string, default to CONFIG_PATH
  TRY
    STEP read file at path as text
    RETURN parsed JSON from text
  CATCH any error
    RETURN empty dict
FUNC-END

FUNC-START save_config
  INPUT config as dict, path as string
  STEP serialize config to JSON string with indentation
  STEP write string to file at path
FUNC-END

CLASS-START ConfigManager
  STEP store a config dict, initially empty

  FUNC-START load
    INPUT path as string
    SET self.config to result of CALL load_config with path
  FUNC-END

  FUNC-START get
    INPUT key as string, fallback as any
    RETURN value at key from self.config, or fallback if missing
  FUNC-END

  FUNC-START set
    INPUT key as string, value as any
    STEP update self.config at key with value
  FUNC-END

  FUNC-START save
    INPUT path as string
    CALL save_config with self.config and path
  FUNC-END
CLASS-END
```

---

## What the Compiler Does NOT Do

- **No formal grammar parser**: PSyx is not a real language with a grammar. The structure is enforced through block markers only.
- **No type system**: Types are hints in plain English, not enforced constructs.
- **No multi-file linking**: Each `.aci` file compiles to one output file. Cross-file references are written as prose and translated by the model.
- **No round-trip sync**: The output file is a build artifact. Editing it directly will not reflect back into the `.aci` file.

---

## Output File Format

The compiled output file uses internal `// ACI-BLOCK:` markers to track which code corresponds to which PSyx block. These are used on re-save to detect what changed and avoid recompiling unchanged blocks.

```python
// ACI-BLOCK: preamble:__preamble__
import os
import json
CONFIG_PATH = "config.json"
// ACI-BLOCK-END

// ACI-BLOCK: func:load_config
def load_config(path=CONFIG_PATH):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return {}
// ACI-BLOCK-END
```

> **Do not manually edit the `// ACI-BLOCK:` lines.** They will be regenerated on the next compile cycle. Edits to the code between the markers are safe but will be overwritten if the corresponding PSyx block changes.
