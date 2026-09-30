// What every AI step needs: how to reach Gemini, which models to try, and retry tuning (tests shorten it).
import type { GeminiTransport, RetryOptions } from './gemini';

export interface AiContext {
  transport: GeminiTransport;
  /** Primary model first, then fallbacks. */
  models: string[];
  retry?: Partial<RetryOptions>;
}
