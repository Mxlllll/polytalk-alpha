import { NextResponse } from "next/server";
import { Language } from "@/lib/ai/mock";
import { isSupportedLanguage, safeFileName } from "@/lib/ai/validation";

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

const MAX_VOICE_BYTES = 8 * 1024 * 1024;
const supportedAudioTypes = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/ogg", "audio/x-wav"];

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing GROQ_API_KEY." }, { status: 500 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const languageValue = formData.get("language") ?? "zh";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing voice file." }, { status: 400 });
  }

  if (!isSupportedLanguage(languageValue)) {
    return NextResponse.json({ error: "Unsupported transcription language." }, { status: 400 });
  }

  if (file.size > MAX_VOICE_BYTES) {
    return NextResponse.json({ error: "Voice file is larger than 8MB." }, { status: 413 });
  }

  if (file.type && !supportedAudioTypes.includes(file.type)) {
    return NextResponse.json({ error: "Unsupported voice file type." }, { status: 415 });
  }

  const transcriptionForm = new FormData();
  transcriptionForm.append("file", file, safeFileName(file.name || "voice.webm"));
  transcriptionForm.append("model", process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo");
  transcriptionForm.append("response_format", "json");
  transcriptionForm.append("temperature", "0");
  transcriptionForm.append("language", groqLanguageHints[languageValue]);

  let response: Response;

  try {
    response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: transcriptionForm,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Voice transcription service is unavailable." }, { status: 503 });
  }

  if (!response.ok) {
    const message = (await response.text()).slice(0, 300);
    return NextResponse.json({ error: `Groq transcription failed: ${message}` }, { status: response.status });
  }

  const data = (await response.json()) as { text?: string };
  const text = data.text?.trim();

  if (!text) {
    return NextResponse.json({ error: "No speech text detected." }, { status: 422 });
  }

  return NextResponse.json({
    text,
    language: languageValue,
    source: "groq",
  } satisfies TranscribeResponse);
}
