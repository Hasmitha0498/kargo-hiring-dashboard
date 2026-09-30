// Small helpers shared by route handlers.
import 'server-only';
import type { z } from 'zod';
import { MissingEnvError } from './env';
import { describeError, log } from './log';

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<{ data: T } | { error: Response }> {
  const raw = await request.json().catch(() => undefined);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: jsonError(`Invalid request: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'body'} ${i.message}`).join('; ')}`) };
  return { data: parsed.data };
}

/** Wraps a handler so unexpected errors become a clean JSON error (details go to logs, never to the browser). */
export function handle<A extends unknown[]>(label: string, fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (error) {
      log.error(`${label}.failed`, { error: describeError(error) });
      if (error instanceof MissingEnvError) return jsonError(error.message, 500);
      if (error instanceof Error && /Database error/.test(error.message)) return jsonError('Database error. Check the Supabase connection and try again.', 500);
      return jsonError(error instanceof Error ? error.message.slice(0, 300) : 'Unexpected error.', 500);
    }
  };
}

/** Streams progress events as newline-delimited JSON so the browser can show each stage as it happens. */
export function ndjson(run: (emit: (event: unknown) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: unknown) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The browser went away; processing continues and the saved status tells the story.
        }
      };
      try {
        await run(emit);
      } catch (error) {
        log.error('stream.failed', { error: describeError(error) });
        emit({ type: 'error', stage: 'reading', message: error instanceof Error ? error.message.slice(0, 300) : 'Unexpected error.', retryable: true });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}
