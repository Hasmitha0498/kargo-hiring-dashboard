import 'server-only';
import { env } from '../env';
import type { AiContext } from './context';
import { createGeminiTransport } from './gemini';

let cached: AiContext | null = null;

/** The production AI context, built from environment variables. */
export function defaultAiContext(): AiContext {
  if (!cached) {
    const primary = env.geminiModel();
    const fallback = env.geminiFallbackModel();
    cached = { transport: createGeminiTransport(env.geminiApiKey()), models: [...new Set([primary, fallback])] };
  }
  return cached;
}
