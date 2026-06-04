import { NextResponse } from "next/server";
import { buildMockTranslations, Language } from "@/lib/ai/mock";
import { callAiJson, languageInstruction } from "@/lib/ai/provider";

type TranslateRequest = {
  text: string;
  sourceLanguage: Language;
};

type TranslateResponse = {
  translations: Partial<Record<Language, string>>;
  source: "deepseek" | "mock";
};

const languages: Language[] = ["zh", "ko", "en"];

export async function POST(request: Request) {
  const body = (await request.json()) as TranslateRequest;
  const targets = languages.filter((language) => language !== body.sourceLanguage);

  try {
    const result = await callAiJson<{ translations: Partial<Record<Language, string>> }>({
      instructions:
        "You are a translation engine for Korean university group work. Translate naturally, preserve academic politeness, and return only valid JSON.",
      input: {
        task: "Translate the message into the target languages.",
        sourceLanguage: body.sourceLanguage,
        targetLanguages: languageInstruction(targets),
        text: body.text,
        expectedJsonShape: { translations: Object.fromEntries(targets.map((language) => [language, "string"])) },
      },
    });

    if (result?.data.translations) {
      return NextResponse.json({
        translations: result.data.translations,
        source: result.source,
      } satisfies TranslateResponse);
    }
  } catch (error) {
    console.error(error);
  }

  return NextResponse.json({
    translations: buildMockTranslations(body.sourceLanguage),
    source: "mock",
  } satisfies TranslateResponse);
}
