import { LocalModelBackend, Message } from './LocalModelBackend';
import { Configuration } from '../config/Configuration';

export class OpenAICompatibleBackend implements LocalModelBackend {
  async *chat(messages: Message[]): AsyncIterable<string> {
    const url = `${Configuration.baseUrl}/v1/chat/completions`;
    const requestBody = {
      model: Configuration.model,
      messages: messages,
      stream: true,
      temperature: Configuration.temperature
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok || !response.body) {
      throw new Error(`OpenAI-compatible request failed: ${response.statusText}`);
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
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            return;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.choices?.[0]?.delta?.content) {
              yield parsed.choices[0].delta.content;
            }
          } catch {
          }
        }
      }
    }
  }
}
