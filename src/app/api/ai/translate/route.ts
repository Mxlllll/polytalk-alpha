import { NextResponse } from "next/server";
import { buildMockTranslations, Language, supportedLanguages } from "@/lib/ai/mock";
import { callAiJson, languageInstruction } from "@/lib/ai/provider";

type TranslateRequest = {
  text: string;
  sourceLanguage: Language;
};

type TranslateResponse = {
  translations: Partial<Record<Language, string>>;
  source: "deepseek" | "mock";
};

const languages = supportedLanguages;

function hasAllTargets(translations: Partial<Record<Language, string>>, targets: Language[]) {
  return targets.every((language) => translations[language]?.trim());
}

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
      const translations = { ...result.data.translations };

      if (!hasAllTargets(translations, targets)) {
        const missingTargets = targets.filter((language) => !translations[language]?.trim());
        const retry = await callAiJson<{ translations: Partial<Record<Language, string>> }>({
          instructions:
            "You are a translation engine for Korean university group work. Translate naturally, preserve academic politeness, and return only valid JSON. You must include every requested target language key.",
          input: {
            task: "Translate the message into the missing target languages.",
            sourceLanguage: body.sourceLanguage,
            targetLanguages: languageInstruction(missingTargets),
            text: body.text,
            expectedJsonShape: { translations: Object.fromEntries(missingTargets.map((language) => [language, "string"])) },
          },
        });

        Object.assign(translations, retry?.data.translations);
      }

      if (!hasAllTargets(translations, targets)) {
        throw new Error("AI translation response missed target language keys");
      }

      return NextResponse.json({
        translations,
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
