export type Language = "zh" | "ko" | "en";

export const languageNames: Record<Language, string> = {
  zh: "Chinese",
  ko: "Korean",
  en: "English",
};

export const mockTranslations: Record<Language, Partial<Record<Language, string>>> = {
  zh: {
    ko: "저는 이 부분을 맡을 수 있어요. 다만 교수님 요구사항을 한 번 더 확인하고 싶어요.",
    en: "I can take this part, but I would like to confirm the professor's requirements once more.",
  },
  ko: {
    zh: "我可以负责这一部分，不过想再确认一下教授的要求。",
    en: "I can take this part, but I would like to confirm the professor's requirements once more.",
  },
  en: {
    zh: "我可以负责这一部分，不过想再确认一下教授的要求。",
    ko: "저는 이 부분을 맡을 수 있어요. 다만 교수님 요구사항을 한 번 더 확인하고 싶어요.",
  },
};

export const mockDiscussionSummary: Record<Language, string> = {
  zh: "当前讨论已经确定：先确认发表顺序、资料整理分工和教授要求的引用格式。下一步建议由成员分别整理案例、理论和 introduction。",
  ko: "현재 논의에서는 발표 순서, 자료 정리 역할, 교수님이 요구한 인용 형식을 먼저 확인하기로 했습니다. 다음 단계는 사례, 이론, 서론을 나누어 정리하는 것입니다.",
  en: "The group has agreed to confirm presentation order, material roles, and the professor's citation requirements first. Next, members should split the case, theory, and introduction sections.",
};

export function buildMockTranslations(sourceLanguage: Language) {
  return mockTranslations[sourceLanguage];
}
