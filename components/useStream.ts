'use client';
// Reads a newline-delimited JSON progress stream from the pipeline routes.
import type { ProgressEvent } from '@/lib/pipeline/process';

export async function readProgress(res: Response, onEvent: (e: ProgressEvent) => void): Promise<void> {
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    onEvent({ type: 'error', stage: 'reading', message: body.error ?? `Request failed (${res.status}).`, retryable: res.status >= 500 });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let ended = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        const event = JSON.parse(line) as ProgressEvent;
        if (event.type === 'complete' || event.type === 'error') ended = true;
        onEvent(event);
      }
    }
  } catch {
    // connection dropped
  }
  if (!ended) onEvent({ type: 'error', stage: 'reading', message: 'Connection lost before processing finished. The candidate is saved; open it and press Retry if it did not complete.', retryable: true });
}
