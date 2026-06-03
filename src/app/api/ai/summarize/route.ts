import { NextResponse } from "next/server";
import { Language, mockDiscussionSummary } from "@/lib/ai/mock";
import { callAiJson, languageInstruction } from "@/lib/ai/provider";

type SummaryMessage = {
  senderName: string;
  originalLanguage: Language;
  originalText: string;
};

type SummarizeRequest = {
  messages: SummaryMessage[];
};

type SummarizeResponse = {
  summary: Record<Language, string>;
  source: "deepseek" | "mock";
};

const languages: Language[] = ["zh", "ko", "en"];

export async function POST(request: Request) {
  const body = (await request.json()) as SummarizeRequest;

  try {
    const result = await callAiJson<{ summary: Record<Language, string> }>({
      instructions:
        "You summarize multilingual academic group discussions for Korean university students. Be concise, concrete, and preserve action items. Return only valid JSON.",
      input: {
        task: "Summarize the discussion in Chinese, Korean, and English.",
        targetLanguages: languageInstruction(languages),
        messages: body.messages,
        expectedJsonShape: { summary: { zh: "string", ko: "string", en: "string" } },
      },
    });

    if (result?.data.summary) {
      return NextResponse.json({ summary: result.data.summary, source: result.source } satisfies SummarizeResponse);
    }
  } catch (error) {
    console.error(error);
  }

  return NextResponse.json({ summary: mockDiscussionSummary, source: "mock" } satisfies SummarizeResponse);
}
