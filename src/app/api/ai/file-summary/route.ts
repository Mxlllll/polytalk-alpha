import { NextResponse } from "next/server";
import { Language } from "@/lib/ai/mock";
import { callAiJson, languageInstruction } from "@/lib/ai/provider";
import { extractPdfTextFromBuffer } from "@/lib/server/pdf-text";

export const runtime = "nodejs";

type FileSummaryResponse = {
  extractedTextLength: number;
  mode: FileSummaryMode;
  summary: Record<Language, string>;
  source: "deepseek" | "mock";
};

type FileSummaryMode = "course" | "assignment";

const languages: Language[] = ["zh", "ko", "en"];
const ocrLanguages = process.env.OCR_LANGUAGES || "eng+kor+chi_sim";

function normalizeSummaryMode(value: unknown): FileSummaryMode {
  return value === "course" ? "course" : "assignment";
}

function stringifySummaryValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? `- ${item}` : `- ${stringifySummaryValue(item)}`))
      .join("\n")
      .trim();
  }
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${stringifySummaryValue(item)}`)
      .join("\n")
      .trim();
  }
  return String(value ?? "").trim();
}

function normalizeSummary(summary: Partial<Record<Language, unknown>>): Record<Language, string> {
  return Object.fromEntries(
    languages.map((language) => [language, stringifySummaryValue(summary[language])]),
  ) as Record<Language, string>;
}

const autoSummaryInstructions = `
You are an academic learning strategist for international students in Korean universities.
Your job is not to "briefly summarize"; your job is to help a student understand what to do or what was taught within 30 seconds.

Quality rules:
- Classify the file by content, not filename.
- Use "course" for lecture slides, class notes, textbook excerpts, conceptual material, or course screenshots.
- Use "assignment" for homework briefs, project instructions, grading rubrics, submission notices, deadlines, or professor requirements.
- Ground every useful point in the extracted file text. Do not invent deadlines, grading criteria, examples, or requirements.
- If information is missing, say "未在文件中找到" / "파일에서 찾지 못함" / "not found in the file".
- Avoid filler such as "this document discusses many aspects" or "students should study carefully".
- Prefer concrete nouns, verbs, deliverables, concepts, dates, formats, and professor requirements.
- Each section must be short, scannable, and separated with line breaks.
- Return Chinese, Korean, and English versions with the same meaning.
- Return only valid JSON.
`;

const autoSummaryTask = `
Analyze the uploaded academic file and return JSON with "mode" and "summary".

If mode is "course", each language must use exactly these sections, translated naturally into that language:
【1. 课程主题（一句话）】
One sentence explaining what this class/material is about.

【2. 核心问题】
The main question or problem the lesson is trying to solve.

【3. 关键概念（最多5个）】
Up to 5 concepts. Explain each in beginner-friendly language.

【4. 讲解逻辑（重点）】
Show the teacher/material's explanation path as 1-2-3-4. This is the most important section.

【5. 最终结论】
The most important takeaway.

【6. 一个例子（必须有）】
Give one simple example. If the file has an example, use it. If not, create a clearly labeled simple learning example based only on the concepts found.

If mode is "assignment", each language must use exactly these sections, translated naturally into that language:
【1. 任务目标】
What the student/group must produce.

【2. 具体要求】
Concrete requirements, deliverables, scope, topic rules, word/page limits, tools, language requirements, or materials.

【3. 截止/提交/格式】
Deadlines, submission channel, file format, presentation format, naming rules, and other logistics.

【4. 评分标准】
Rubric, evaluation points, percentage weights, or what the professor seems to care about.

【5. 建议分工】
Practical group-role split inferred from the assignment. If group work is not mentioned, say it may be individual.

【6. 需要确认的问题】
Only list truly missing or ambiguous points that students should ask the professor or teammates.

【7. 下一步行动】
3-5 concrete next actions students can do now.

Output constraints:
- Use the bracket headings exactly with numbers.
- Put each bullet/action on its own line.
- Do not write long paragraphs.
- Never say something is required unless the file says so.
`;

function fallbackSummary(fileName: string, reason: Record<Language, string> | string): Record<Language, string> {
  const localizedReason =
    typeof reason === "string"
      ? {
          zh: reason,
          ko: reason,
          en: reason,
        }
      : reason;

  return {
    zh: `${fileName} 已上传。${localizedReason.zh}`,
    ko: `${fileName} 파일이 업로드되었습니다. ${localizedReason.ko}`,
    en: `${fileName} was uploaded. ${localizedReason.en}`,
  };
}

function normalizeExtractedText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeXmlText(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

async function extractPptxText(buffer: Buffer) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const slides = await Promise.all(
    slideFiles.map(async (name) => {
      const xml = await zip.files[name].async("text");
      return [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) => decodeXmlText(match[1])).join(" ");
    }),
  );

  return normalizeExtractedText(slides.map((slide, index) => `[Slide ${index + 1}]\n${slide}`).join("\n\n"));
}

async function ocrImage(buffer: Buffer) {
  const { default: Tesseract } = await import("tesseract.js");
  const result = await Tesseract.recognize(buffer, ocrLanguages);
  return normalizeExtractedText(result.data.text);
}

async function extractPdfText(buffer: Buffer) {
  return normalizeExtractedText(await extractPdfTextFromBuffer(buffer, true));
}

async function extractText(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const lowerName = file.name.toLowerCase();
  const type = file.type;

  if (
    type.startsWith("text/") ||
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".md") ||
    lowerName.endsWith(".csv")
  ) {
    return normalizeExtractedText(buffer.toString("utf8"));
  }

  if (type === "application/pdf" || lowerName.endsWith(".pdf")) {
    return extractPdfText(buffer);
  }

  if (
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return normalizeExtractedText(result.value);
  }

  if (
    type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    lowerName.endsWith(".pptx")
  ) {
    return extractPptxText(buffer);
  }

  if (type.startsWith("image/")) {
    return ocrImage(buffer);
  }

  return "";
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      {
        extractedTextLength: 0,
        mode: "assignment",
        summary: fallbackSummary("File", {
          zh: "没有收到有效文件。",
          ko: "유효한 파일을 받지 못했습니다.",
          en: "No valid file was provided.",
        }),
        source: "mock",
      } satisfies FileSummaryResponse,
      { status: 400 },
    );
  }

  let extractedText = "";

  try {
    extractedText = (await extractText(file)).slice(0, 16000);
  } catch (error) {
    console.error(error);
  }

  if (!extractedText) {
    const reason = file.type.startsWith("image/")
      ? {
          zh: "当前 Alpha 已尝试 OCR，但没有从图片中识别到可总结的文字。请尽量上传清晰图片或文字型文件。",
          ko: "현재 Alpha가 OCR을 시도했지만 이미지에서 요약할 수 있는 텍스트를 인식하지 못했습니다. 선명한 이미지나 텍스트형 파일을 업로드해 주세요.",
          en: "This Alpha tried OCR but could not detect summarizable text in the image. Please upload a clearer image or a text-based file.",
        }
      : {
          zh: "当前 Alpha 已尝试文字提取和 OCR，但仍未识别到可总结的文字。旧版 .doc/.ppt、受保护文件或画质较低的扫描件可能需要换成 PDF/DOCX/PPTX 或更清晰版本。",
          ko: "현재 Alpha가 텍스트 추출과 OCR을 모두 시도했지만 요약할 수 있는 텍스트를 찾지 못했습니다. 구형 .doc/.ppt, 보호된 파일, 화질이 낮은 스캔본은 PDF/DOCX/PPTX 또는 더 선명한 파일로 바꿔 주세요.",
          en: "This Alpha tried text extraction and OCR but still could not find summarizable text. Legacy .doc/.ppt files, protected files, or low-quality scans may need a PDF/DOCX/PPTX or clearer version.",
        };

    return NextResponse.json({
      extractedTextLength: 0,
      mode: "assignment",
      summary: fallbackSummary(file.name, reason),
      source: "mock",
    } satisfies FileSummaryResponse);
  }

  try {
    const result = await callAiJson<{ mode?: FileSummaryMode; summary: Partial<Record<Language, unknown>> }>({
      instructions: autoSummaryInstructions,
      input: {
        task: autoSummaryTask,
        fileName: file.name,
        targetLanguages: languageInstruction(languages),
        extractedText,
        expectedJsonShape: { mode: "course | assignment", summary: { zh: "string", ko: "string", en: "string" } },
      },
    });

    if (result?.data.summary) {
      return NextResponse.json({
        extractedTextLength: extractedText.length,
        mode: normalizeSummaryMode(result.data.mode),
        summary: normalizeSummary(result.data.summary),
        source: result.source,
      } satisfies FileSummaryResponse);
    }
  } catch (error) {
    console.error(error);
  }

  return NextResponse.json({
    extractedTextLength: extractedText.length,
    mode: "assignment",
    summary: fallbackSummary(file.name, {
      zh: "文件文字已提取，但 AI 总结暂时失败，请稍后重试。",
      ko: "파일 텍스트는 추출했지만 AI 요약에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      en: "The file text was extracted, but AI summarization failed. Please try again later.",
    }),
    source: "mock",
  } satisfies FileSummaryResponse);
}
