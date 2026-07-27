import { LocalModelBackend, Message } from './LocalModelBackend';
import { Configuration } from '../config/Configuration';

export class OllamaBackend implements LocalModelBackend {
  async *chat(messages: Message[]): AsyncIterable<string> {
    const url = `${Configuration.baseUrl}/api/chat`;
    const requestBody = {
      model: Configuration.model,
      messages: messages,
      stream: true,
      options: {
        temperature: Configuration.temperature
      }
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
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.message?.content) {
            yield parsed.message.content;
          }
        } catch {
        }
      }
    }
  }
}
