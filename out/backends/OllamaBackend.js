"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaBackend = void 0;
const Configuration_1 = require("../config/Configuration");
class OllamaBackend {
    async *chat(messages) {
        const url = `${Configuration_1.Configuration.baseUrl}/api/chat`;
        const requestBody = {
            model: Configuration_1.Configuration.model,
            messages: messages,
            stream: true,
        };
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });
        if (!response.ok || !response.body) {
            throw new Error(`Ollama request failed: ${response.statusText}`);
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                if (!line.trim())
                    continue;
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.message?.content) {
                        yield parsed.message.content;
                    }
                }
                catch {
                }
            }
        }
    }
}
exports.OllamaBackend = OllamaBackend;
//# sourceMappingURL=OllamaBackend.js.map