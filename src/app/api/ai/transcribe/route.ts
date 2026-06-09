import { NextResponse } from "next/server";
import { Language } from "@/lib/ai/mock";

type TranscribeResponse = {
  text: string;
  language: Language;
  source: "groq";
};

const groqLanguageHints: Record<Language, string> = {
  zh: "zh",
  ko: "ko",
  en: "en",
};

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing GROQ_API_KEY." }, { status: 500 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const language = (formData.get("language") ?? "zh") as Language;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing voice file." }, { status: 400 });
  }

  const transcriptionForm = new FormData();
  transcriptionForm.append("file", file, file.name || "voice.webm");
  transcriptionForm.append("model", process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo");
  transcriptionForm.append("response_format", "json");
  transcriptionForm.append("temperature", "0");
  transcriptionForm.append("language", groqLanguageHints[language] ?? "zh");

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: transcriptionForm,
  });

  if (!response.ok) {
    const message = await response.text();
    return NextResponse.json({ error: `Groq transcription failed: ${message}` }, { status: response.status });
  }

  const data = (await response.json()) as { text?: string };
  const text = data.text?.trim();

  if (!text) {
    return NextResponse.json({ error: "No speech text detected." }, { status: 422 });
  }

  return NextResponse.json({
    text,
    language,
    source: "groq",
  } satisfies TranscribeResponse);
}
