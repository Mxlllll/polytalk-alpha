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
        "You are an academic collaboration assistant for international students in Korean universities. Do not write a vague recap. Extract useful work information: decisions, unresolved questions, task ownership, deadlines, professor requirements, risks, and next actions. If information is missing, explicitly say what still needs confirmation. Return only valid JSON.",
      input: {
        task:
          "Create a practical group-work brief from this discussion in Chinese, Korean, and English. Each language should use compact sections: 1) confirmed decisions, 2) tasks and owners if mentioned, 3) professor/assignment requirements, 4) unresolved questions, 5) next actions. Prefer concrete bullets over generic sentences.",
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
