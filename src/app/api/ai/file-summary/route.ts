import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import JSZip from "jszip";
import Tesseract from "tesseract.js";
import { Language } from "@/lib/ai/mock";
import { callAiJson, languageInstruction } from "@/lib/ai/provider";

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
const ocrMaxPdfPages = Number(process.env.OCR_MAX_PDF_PAGES || 3);

function normalizeSummaryMode(value: unknown): FileSummaryMode {
  return value === "course" ? "course" : "assignment";
}

const autoSummaryInstructions =
  "You are an academic learning assistant for international students in Korean universities. First classify the uploaded file as course or assignment. Use course for lecture slides, class notes, textbook excerpts, course screenshots, or conceptual teaching material. Use assignment for homework briefs, project requirements, submission instructions, grading rubrics, deadlines, or professor task notices. Then write the summary in Chinese, Korean, and English. Do not produce vague generic summaries. Keep sections short, useful, and beginner-friendly. Preserve clear line breaks between every section. Return only valid JSON.";

const autoSummaryTask =
  "Analyze this uploaded academic file. Return JSON with mode and summary. mode must be either course or assignment. If mode is course, each language must strictly use: 【1. 课程主题（一句话）】, 【2. 核心问题】, 【3. 关键概念（最多5个）】, 【4. 讲解逻辑（重点）】, 【5. 最终结论】, 【6. 一个例子（必须有）】. If mode is assignment, each language must use compact sections: 【1. 任务目标】, 【2. 具体要求】, 【3. 截止/提交/格式】, 【4. 评分标准】, 【5. 建议分工】, 【6. 需要确认的问题】, 【7. 下一步行动】. If a field is not present, say not found instead of inventing. Use new lines between sections and avoid long paragraphs.";

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

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
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

  return normalizeWhitespace(slides.join("\n"));
}

async function ocrImage(buffer: Buffer) {
  const result = await Tesseract.recognize(buffer, ocrLanguages);
  return normalizeWhitespace(result.data.text);
}

async function extractPdfText(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = normalizeWhitespace(result.text);
    if (text) return text;

    const screenshots = await parser.getScreenshot({
      first: ocrMaxPdfPages,
      imageBuffer: true,
      imageDataUrl: false,
      scale: 2,
    });

    const pageTexts = [];
    for (const page of screenshots.pages) {
      if (page.data) {
        pageTexts.push(await ocrImage(Buffer.from(page.data)));
      }
    }

    return normalizeWhitespace(pageTexts.join("\n"));
  } finally {
    await parser.destroy();
  }
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
    return normalizeWhitespace(buffer.toString("utf8"));
  }

  if (type === "application/pdf" || lowerName.endsWith(".pdf")) {
    return extractPdfText(buffer);
  }

  if (
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return normalizeWhitespace(result.value);
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
    const result = await callAiJson<{ mode?: FileSummaryMode; summary: Record<Language, string> }>({
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
        summary: result.data.summary,
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
