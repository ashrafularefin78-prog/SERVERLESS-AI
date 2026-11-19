export type Role = "system" | "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface MemoryNote {
  id: string;
  text: string;
  addedAt: number;
}

export interface MemoryCommand {
  type: "add" | "forget" | "forget-all";
  text?: string;
}

export interface MemoryOutcome {
  memory: MemoryNote[];
  changed: boolean;
  added: MemoryNote | null;
  removed: number;
  duplicate: boolean;
  full: boolean;
}

export type Theme = "system" | "dark" | "light";

export type ThinkingEffort = "low" | "medium" | "high";

export interface EncryptedBlob {
  iv: string;
  data: string;
}

export interface MemoryVault {
  salt: string;
  verifier: EncryptedBlob;
  notes: EncryptedBlob;
}

export interface Settings {
  theme: Theme;
  mode: string;
  customInstructions: string;
  memory: MemoryNote[];
  memoryVault: MemoryVault | null;
  /** Model id to restore on start, or "" for the built-in rule engine. */
  modelId: string;
  /** How much reasoning the reply should spend: low, medium, or high. */
  effort: ThinkingEffort;
}

export interface Mode {
  id: string;
  label: string;
  hint: string;
  prompt: string;
}

export interface MessageStats {
  tokens: number;
  seconds: number;
  tokensPerSecond: number;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  streaming?: boolean;
  stopped?: boolean;
  error?: string;
  stats?: MessageStats;
  /** Document titles the reply was grounded in, when retrieval contributed. */
  sources?: string[];
}

export interface KnowledgeDoc {
  id: string;
  title: string;
  addedAt: number;
  chars: number;
  chunkCount: number;
}

export interface StoredChunk {
  id: string;
  docId: string;
  title: string;
  text: string;
  vector: Float32Array;
}

export interface KnowledgeProgress {
  phase: "download" | "embed";
  file: string;
  loaded: number;
  total: number;
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface Conversation extends ConversationSummary {
  mode: string;
  messages: Message[];
}

export type ReplyBuilder = (args: {
  prompt: string;
  messages: ChatMessage[];
  systemPrompt: string;
}) => string;

export interface DemoOptions {
  memory?: (MemoryNote | string)[];
  memoryOutcome?: MemoryOutcome | null;
  buildDemoReply?: ReplyBuilder | null;
}

export type StreamChunk =
  { text: string } | { usage: { completion_tokens: number; total_tokens: number } };

export interface ModelProgress {
  text: string;
  progress: number;
}

export interface EngineState {
  phase: "idle" | "loading" | "ready" | "generating";
  generating: boolean;
  loaded: boolean;
  mode: "builtin" | "model";
  modelId: string | null;
  progress: ModelProgress | null;
  error: string | null;
}
