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
const sectionKeys = [
  "confirmed_decisions",
  "tasks_and_owners",
  "professor_requirements",
  "unresolved_questions",
  "next_actions",
] as const;

type SectionKey = (typeof sectionKeys)[number];

const sectionLabels: Record<Language, Record<SectionKey, string>> = {
  zh: {
    confirmed_decisions: "【1. 本次讨论结论】",
    tasks_and_owners: "【2. 分工与负责人】",
    professor_requirements: "【3. 教授/作业要求】",
    unresolved_questions: "【4. 还没解决的问题】",
    next_actions: "【5. 下一步行动】",
  },
  ko: {
    confirmed_decisions: "【1. 이번 논의 결론】",
    tasks_and_owners: "【2. 역할과 담당자】",
    professor_requirements: "【3. 교수님/과제 요구사항】",
    unresolved_questions: "【4. 아직 해결되지 않은 질문】",
    next_actions: "【5. 다음 행동】",
  },
  en: {
    confirmed_decisions: "【1. Discussion Decisions】",
    tasks_and_owners: "【2. Tasks And Owners】",
    professor_requirements: "【3. Professor / Assignment Requirements】",
    unresolved_questions: "【4. Unresolved Questions】",
    next_actions: "【5. Next Actions】",
  },
};

const missingLine: Record<Language, string> = {
  zh: "- 未确认",
  ko: "- 미확인",
  en: "- not confirmed",
};

const evidenceLabel: Record<Language, string> = {
  zh: "依据",
  ko: "근거",
  en: "evidence",
};

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

function normalizeForGrounding(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function isGroundedEvidence(evidence: string, transcript: string) {
  const normalizedEvidence = normalizeForGrounding(evidence);
  if (normalizedEvidence.length < 8) return false;
  return normalizeForGrounding(transcript).includes(normalizedEvidence);
}

function localizedItemText(record: Record<string, unknown>, language: Language) {
  return stringifySummaryValue(record[language] ?? record.text ?? record.summary ?? record.action);
}

function groundedItemText(item: unknown, transcript: string, language: Language) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;

  const record = item as Record<string, unknown>;
  const text = localizedItemText(record, language);
  const evidence = stringifySummaryValue(record.evidence ?? record.source_quote ?? record.source);

  if (!text || !isGroundedEvidence(evidence, transcript)) return null;
  return `- ${text}\n  ${evidenceLabel[language]}：${evidence}`;
}

function groundedSectionText(value: unknown, transcript: string, language: Language) {
  const items = Array.isArray(value) ? value : [value];
  const groundedItems = items
    .map((item) => groundedItemText(item, transcript, language))
    .filter((item): item is string => Boolean(item));

  return groundedItems.length ? groundedItems.join("\n") : missingLine[language];
}

function normalizeSummary(summary: Partial<Record<Language, unknown>>, transcript: string): Record<Language, string> {
  const summaryRecord = summary as Record<string, unknown>;
  const isCanonicalSummary = sectionKeys.some((key) => key in summaryRecord);

  return Object.fromEntries(
    languages.map((language) => {
      if (isCanonicalSummary) {
        const text = sectionKeys
          .map((key) => `${sectionLabels[language][key]}\n${groundedSectionText(summaryRecord[key], transcript, language)}`)
          .join("\n\n");
        return [language, text];
      }

      const value = summary[language];

      if (value && typeof value === "object" && !Array.isArray(value)) {
        const text = sectionKeys
          .map((key) => {
            const sectionValue = (value as Record<string, unknown>)[key];
            return `${sectionLabels[language][key]}\n${groundedSectionText(sectionValue, transcript, language)}`;
          })
          .join("\n\n");
        return [language, text];
      }

      return [
        language,
        sectionKeys.map((key) => `${sectionLabels[language][key]}\n${missingLine[language]}`).join("\n\n"),
      ];
    }),
  ) as Record<Language, string>;
}

const discussionSummaryInstructions = `
You are an academic collaboration strategist for multilingual student groups in Korean universities.
Your job is to turn messy chat messages into a practical after-discussion brief.

Quality rules:
- Do not write a vague recap.
- Extract only information that helps students know what was decided, what remains unclear, and what to do next.
- Preserve sender names when assigning tasks.
- If ownership, deadline, professor requirement, or submission format was not mentioned, say it was not confirmed.
- Do not invent facts.
- Use only the provided transcript. Do not use outside assumptions, common classroom patterns, or examples from other projects.
- Before writing any requirement, deadline, number, owner, or deliverable, verify that it appears clearly in the transcript.
- Prefer concrete bullets over generic sentences.
- Return Chinese, Korean, and English versions with the same meaning.
- Return only valid JSON.
`;

const discussionSummaryTask = `
Create a structured discussion recap in Chinese, Korean, and English.

Use these sections:
confirmed_decisions:
List decisions that were actually confirmed. If nothing was confirmed, say so clearly.

tasks_and_owners:
List each task and owner if mentioned. If owners are missing, list suggested roles but mark them as "待确认".

professor_requirements:
Extract requirements, deadlines, formats, grading criteria, or submission rules mentioned in chat. If none, say "未确认".

unresolved_questions:
List unresolved questions or ambiguity that the group should confirm.

next_actions:
Give 3-5 concrete next actions. Start each action with a verb.

Output constraints:
- Do not include empty polite filler.
- If the chat does not mention a detail, write "未确认" / "미확인" / "not confirmed" instead of guessing.

JSON constraints:
- Return summary as one object with these exact keys: confirmed_decisions, tasks_and_owners, professor_requirements, unresolved_questions, next_actions.
- Each key must be an array of objects.
- Each object must have:
  - zh: Chinese bullet. It must be a direct restatement of the evidence, not a guess or broad interpretation.
  - ko: Korean bullet. It must have the same meaning as zh.
  - en: English bullet. It must have the same meaning as zh.
  - evidence: an exact short quote copied from the transcript that supports the bullet.
- The evidence field must not be translated or paraphrased.
- If the evidence only supports part of the sentence, remove the unsupported part from text.
- If a section has no grounded evidence, return an empty array for that section.
`;

function discussionTranscript(messages: SummaryMessage[]) {
  return messages
    .map((message, index) => {
      const text = message.originalText.replace(/\s+/g, " ").trim();
      return `${index + 1}. ${message.senderName} [${message.originalLanguage}]: ${text}`;
    })
    .join("\n");
}

export async function POST(request: Request) {
  const body = (await request.json()) as SummarizeRequest;
  const transcript = discussionTranscript(body.messages ?? []);

  try {
    const result = await callAiJson<{ summary: Partial<Record<Language, unknown>> }>({
      instructions: discussionSummaryInstructions,
      input: {
        task: discussionSummaryTask,
        targetLanguages: languageInstruction(languages),
        transcript,
        expectedJsonShape: {
          summary: {
            confirmed_decisions: [{ zh: "Chinese bullet", ko: "Korean bullet", en: "English bullet", evidence: "exact transcript quote" }],
            tasks_and_owners: [{ zh: "Chinese bullet", ko: "Korean bullet", en: "English bullet", evidence: "exact transcript quote" }],
            professor_requirements: [{ zh: "Chinese bullet", ko: "Korean bullet", en: "English bullet", evidence: "exact transcript quote" }],
            unresolved_questions: [{ zh: "Chinese bullet", ko: "Korean bullet", en: "English bullet", evidence: "exact transcript quote" }],
            next_actions: [{ zh: "Chinese bullet", ko: "Korean bullet", en: "English bullet", evidence: "exact transcript quote" }],
          },
        },
      },
    });

    if (result?.data.summary) {
      return NextResponse.json({
        summary: normalizeSummary(result.data.summary, transcript),
        source: result.source,
      } satisfies SummarizeResponse);
    }
  } catch (error) {
    console.error(error);
  }

  return NextResponse.json({ summary: mockDiscussionSummary, source: "mock" } satisfies SummarizeResponse);
}
