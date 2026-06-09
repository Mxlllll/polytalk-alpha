import { Language } from "./mock";

export const supportedLanguages: Language[] = ["zh", "ko", "en"];

export function isSupportedLanguage(value: unknown): value is Language {
  return typeof value === "string" && supportedLanguages.includes(value as Language);
}

export function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function safeFileName(value: string) {
  return value.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 120) || "file";
}

export function isSupportedAcademicFile(file: File) {
  const lowerName = file.name.toLowerCase();
  const type = file.type;

  return (
    type.startsWith("text/") ||
    type.startsWith("image/") ||
    type === "application/pdf" ||
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    /\.(txt|md|csv|pdf|docx|pptx|png|jpe?g|webp)$/i.test(lowerName)
  );
}

export function isSupportedPreviewFile(file: File) {
  const lowerName = file.name.toLowerCase();
  const type = file.type;

  return (
    type.startsWith("text/") ||
    type === "application/pdf" ||
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    /\.(txt|md|csv|pdf|docx|pptx)$/i.test(lowerName)
  );
}
