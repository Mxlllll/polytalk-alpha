import { NextResponse } from "next/server";
import { extractPdfTextFromBuffer } from "@/lib/server/pdf-text";

export const runtime = "nodejs";

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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
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

  return normalizeWhitespace(slides.join("\n"));
}

async function extractPdfText(buffer: Buffer) {
  return normalizeWhitespace(await extractPdfTextFromBuffer(buffer));
}

async function extractText(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const lowerName = file.name.toLowerCase();
  const type = file.type;

  if (type.startsWith("text/") || /\.(txt|md|csv)$/i.test(lowerName)) {
    return normalizeWhitespace(buffer.toString("utf8"));
  }

  if (type === "application/pdf" || lowerName.endsWith(".pdf")) {
    return extractPdfText(buffer);
  }

  if (type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || lowerName.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return normalizeWhitespace(result.value);
  }

  if (type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" || lowerName.endsWith(".pptx")) {
    return extractPptxText(buffer);
  }

  return "";
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No valid file was provided." }, { status: 400 });
  }

  try {
    const text = (await extractText(file)).slice(0, 6000);
    return NextResponse.json({
      fileName: file.name,
      previewText: text,
      extractedTextLength: text.length,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        fileName: file.name,
        previewText: "",
        extractedTextLength: 0,
        error: "File preview failed.",
        debug: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
