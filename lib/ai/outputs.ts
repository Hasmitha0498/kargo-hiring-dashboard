// Interview brief + both email drafts, generated from the structured scoring output only (no CV, no identity).
import type { AiContext } from './context';
import { generateJsonWithModel } from './gemini';
import { OUTPUTS_SYSTEM, outputsUser, type OutputsInput } from './prompts';
import { outputsJsonSchema, outputsSchema, type OutputsResult } from './schemas';

export async function generateOutputs(ctx: AiContext, input: OutputsInput, logFields?: Record<string, string>): Promise<{ data: OutputsResult; model: string }> {
  return generateJsonWithModel(
    ctx.transport,
    {
      label: 'generate_outputs',
      models: ctx.models,
      system: OUTPUTS_SYSTEM,
      parts: [{ text: outputsUser(input) }],
      jsonSchema: outputsJsonSchema,
      schema: outputsSchema,
      temperature: 0.4,
      lowThinking: true,
      logFields,
    },
    ctx.retry,
  );
}
