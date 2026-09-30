import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../env';

let client: SupabaseClient | null = null;

/** Server-side Supabase client using the service role key. Never import this from a client component. */
export function db(): SupabaseClient {
  client ??= createClient(env.supabaseUrl(), env.supabaseServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  });
  return client;
}

export class DbError extends Error {
  constructor(context: string, message: string) {
    super(`Database error (${context}): ${message}`);
    this.name = 'DbError';
  }
}

/** Unwraps a Supabase response, turning an error into a DbError with context. */
export function must<T>(context: string, res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new DbError(context, res.error.message);
  return res.data as T;
}
