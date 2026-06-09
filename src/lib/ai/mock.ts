export type Language = "zh" | "ko" | "en";

export const languageNames: Record<Language, string> = {
  zh: "Chinese",
  ko: "Korean",
  en: "English",
};

export const mockTranslations: Record<Language, Partial<Record<Language, string>>> = {
  zh: {
    ko: "번역을 준비하고 있습니다. 지금은 원문을 함께 확인해 주세요.",
    en: "Translation is being prepared. Please check the original text for now.",
  },
  ko: {
    zh: "正在准备翻译，请先结合原文查看。",
    en: "Translation is being prepared. Please check the original text for now.",
  },
  en: {
    zh: "正在准备翻译，请先结合原文查看。",
    ko: "번역을 준비하고 있습니다. 지금은 원문을 함께 확인해 주세요.",
  },
};

export const mockDiscussionSummary: Record<Language, string> = {
  zh:
    "【1. 本次讨论结论】\n- 暂未形成明确结论。\n\n" +
    "【2. 分工与负责人】\n- 暂未确认。\n\n" +
    "【3. 教授/作业要求】\n- 暂未确认。\n\n" +
    "【4. 还没解决的问题】\n- 需要继续确认任务目标、负责人和提交要求。\n\n" +
    "【5. 下一步行动】\n- 重新发起总结，或补充更多聊天内容后再试。",
  ko:
    "【1. 이번 논의 결론】\n- 아직 명확한 결론이 없습니다.\n\n" +
    "【2. 역할과 담당자】\n- 아직 확인되지 않았습니다.\n\n" +
    "【3. 교수님/과제 요구사항】\n- 아직 확인되지 않았습니다.\n\n" +
    "【4. 해결되지 않은 질문】\n- 과제 목표, 담당자, 제출 요구사항을 더 확인해야 합니다.\n\n" +
    "【5. 다음 행동】\n- 요약을 다시 시도하거나 대화 내용을 더 추가한 뒤 다시 시도하세요.",
  en:
    "【1. Discussion Decisions】\n- No clear decision has been confirmed yet.\n\n" +
    "【2. Tasks And Owners】\n- Not confirmed yet.\n\n" +
    "【3. Professor / Assignment Requirements】\n- Not confirmed yet.\n\n" +
    "【4. Unresolved Questions】\n- The group still needs to confirm the task goal, owners, and submission requirements.\n\n" +
    "【5. Next Actions】\n- Try summarizing again, or add more discussion messages first.",
};

export function buildMockTranslations(sourceLanguage: Language) {
  return mockTranslations[sourceLanguage];
}
