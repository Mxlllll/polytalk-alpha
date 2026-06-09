import { Language, languageNames } from "./mock";

type ChatCompletionPayload = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export type AiProviderSource = "deepseek" | "mock";

const AI_TIMEOUT_MS = 18_000;

function parseJsonObject<T>(content: string): T {
  const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const rawText = (fencedMatch?.[1] ?? content).trim();
  const firstBrace = rawText.indexOf("{");
  const lastBrace = rawText.lastIndexOf("}");
  const jsonText = firstBrace >= 0 && lastBrace > firstBrace ? rawText.slice(firstBrace, lastBrace + 1) : rawText;
  return JSON.parse(jsonText) as T;
}

export async function callAiJson<T>({
  instructions,
  input,
}: {
  instructions: string;
  input: unknown;
}): Promise<{ data: T; source: AiProviderSource } | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  const response = await fetch(process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || process.env.OPENAI_MODEL || "deepseek-chat",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `${instructions}\nReturn only valid JSON. Do not wrap it in markdown.`,
        },
        {
          role: "user",
          content: JSON.stringify(input),
        },
      ],
    }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`DeepSeek request failed: ${message}`);
  }

  const payload = (await response.json()) as ChatCompletionPayload;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) return null;

  return {
    data: parseJsonObject<T>(content),
    source: "deepseek",
  };
}

export function languageInstruction(targets: Language[]) {
  return targets.map((language) => `${language}: ${languageNames[language]}`).join(", ");
}
