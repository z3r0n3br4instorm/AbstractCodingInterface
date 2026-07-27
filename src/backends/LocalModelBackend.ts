export interface Message {
  role: string;
  content: string;
}

export interface LocalModelBackend {
  chat(messages: Message[]): AsyncIterable<string>;
}
