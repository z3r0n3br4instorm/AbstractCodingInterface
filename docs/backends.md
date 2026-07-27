# Backend Configuration

ACI supports any local model that exposes either an Ollama-compatible or OpenAI-compatible HTTP API. No cloud services — everything runs on your machine.

---

## Supported Backends

### Ollama

[Ollama](https://ollama.com) is the easiest way to run local models. It manages model downloads, GGUF quantization, and GPU offloading automatically.

**Install and start Ollama:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama serve
```

**Pull a model:**
```bash
ollama pull llama3
ollama pull qwen2.5-coder:7b
ollama pull deepseek-coder-v2:16b
```

**ACI Settings:**
```json
"aci.backend": "ollama",
"aci.baseUrl": "http://localhost:11434",
"aci.model": "qwen2.5-coder:7b"
```

Ollama exposes the `/api/chat` endpoint with NDJSON streaming. ACI uses this directly.

---

### OpenAI-Compatible (llama.cpp, LM Studio, vLLM, Jan)

Any server that implements the `/v1/chat/completions` endpoint with SSE streaming is supported. This covers:

- **[llama.cpp](https://github.com/ggerganov/llama.cpp)** — the original. Start with `--server` flag.
- **[LM Studio](https://lmstudio.ai)** — GUI app, enable "Local Server" in settings.
- **[vLLM](https://github.com/vllm-project/vllm)** — high-throughput server for larger models.
- **[Jan](https://jan.ai)** — desktop app with a built-in API server.

**ACI Settings:**
```json
"aci.backend": "openai-compatible",
"aci.baseUrl": "http://localhost:1234",
"aci.model": "your-model-name"
```

Adjust `baseUrl` and `model` to match your server.

---

## Choosing a Model

The model is the single biggest factor in output quality. ACI is designed for **code-focused local models** in the 7B–20B parameter range.

### Recommended Models

| Model | Size | Notes |
|---|---|---|
| `qwen2.5-coder:7b` | ~4GB VRAM | Best-in-class small coder. Strong default choice. |
| `qwen2.5-coder:14b` | ~9GB VRAM | Noticeably better on complex logic. |
| `deepseek-coder-v2:16b` | ~10GB VRAM | Excellent for multi-language projects. |
| `codellama:13b` | ~8GB VRAM | Solid, widely tested. |
| `phi3:mini` | ~2GB VRAM | Runs on CPU. Output quality varies on complex specs. |

### Tips

- **Smaller models struggle with long blocks.** Keep your PSyx blocks focused — a function should do one thing.
- **Reasoning models (DeepSeek-R1, QwQ)**: ACI explicitly tells the model to skip the thinking phase in its system prompt. If you are using a reasoning model and seeing slow output, this is expected on the first token — the model honors the instruction and jumps straight to code.
- **Temperature**: lower is better for code generation. ACI does not currently expose temperature as a setting but most backends default to a sensible value.

---

## Backend Interface (for contributors)

The backend abstraction is in [`src/backends/LocalModelBackend.ts`](../src/backends/LocalModelBackend.ts):

```typescript
export interface LocalModelBackend {
  chat(messages: Message[]): AsyncIterable<string>;
}
```

Both `OllamaBackend` and `OpenAICompatibleBackend` implement this. To add a new backend:

1. Create `src/backends/MyBackend.ts` implementing `LocalModelBackend`.
2. Register it in `BackendFactory.ts`.
3. Add the new enum value to `aci.backend` in `package.json`.

The `chat()` method must yield individual string tokens as they arrive from the model, not wait for the full response.
