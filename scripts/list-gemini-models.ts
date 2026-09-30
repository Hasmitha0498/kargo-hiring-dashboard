// Lists the Gemini models this API key can use (to pick GEMINI_MODEL). Usage: npm run gemini:models
import { GoogleGenAI } from '@google/genai';

const key = process.env.GEMINI_API_KEY;
if (!key) throw new Error('Set GEMINI_API_KEY in .env.local');
const ai = new GoogleGenAI({ apiKey: key });
const pager = await ai.models.list();
for await (const m of pager) {
  if (m.supportedActions?.includes('generateContent')) console.log(m.name?.replace('models/', ''), '-', m.displayName);
}
