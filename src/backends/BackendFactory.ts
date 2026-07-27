import { Configuration } from '../config/Configuration';
import { LocalModelBackend } from './LocalModelBackend';
import { OllamaBackend } from './OllamaBackend';
import { OpenAICompatibleBackend } from './OpenAICompatibleBackend';

export class BackendFactory {
  public static getBackend(): LocalModelBackend {
    const type = Configuration.backend;
    if (type === 'openai-compatible') {
      return new OpenAICompatibleBackend();
    }
    return new OllamaBackend();
  }
}
