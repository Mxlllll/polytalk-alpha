export type Language = "zh" | "ko" | "en";

export const languageNames: Record<Language, string> = {
  zh: "Chinese",
  ko: "Korean",
  en: "English",
};

export const mockTranslations: Record<Language, Partial<Record<Language, string>>> = {
  zh: {
    ko: "번역을 준비 중입니다. 원문을 함께 확인해 주세요.",
    en: "Translation is being prepared. Please check the original text for now.",
  },
  ko: {
    zh: "正在准备翻译，请先结合原文查看。",
    en: "Translation is being prepared. Please check the original text for now.",
  },
  en: {
    zh: "正在准备翻译，请先结合原文查看。",
    ko: "번역을 준비 중입니다. 원문을 함께 확인해 주세요.",
  },
};

export const mockDiscussionSummary: Record<Language, string> = {
  zh: "【1. 讨论主题】\n小组正在确认课程讨论或作业展示的分工。\n\n【2. 核心问题】\n需要明确谁负责哪一部分，以及教授的具体要求。\n\n【3. 关键概念】\n- 分工：每个人负责一个明确部分。\n- 要求确认：先核对评分标准和提交格式。\n- 引用格式：统一资料来源的写法。\n\n【4. 讲解逻辑】\n1. 先确认任务目标。\n2. 再拆分每个人的负责内容。\n3. 检查教授要求和引用格式。\n4. 最后决定下一步行动。\n\n【5. 最终结论】\n下一步应先确认作业要求，再确定每个人的具体分工。\n\n【6. 一个例子】\n例如一个人负责案例，一个人负责理论，一个人负责整理 PPT。",
  ko: "【1. 토론 주제】\n조별 토론 또는 과제 발표의 역할을 정리하는 내용입니다.\n\n【2. 핵심 문제】\n누가 어떤 부분을 맡을지, 교수님의 요구사항이 무엇인지 확인해야 합니다.\n\n【3. 핵심 개념】\n- 역할 분담: 각자 맡을 부분을 명확히 정합니다.\n- 요구사항 확인: 평가 기준과 제출 형식을 먼저 확인합니다.\n- 인용 형식: 자료 출처 표기를 통일합니다.\n\n【4. 설명 흐름】\n1. 과제 목표를 확인합니다.\n2. 각자의 역할을 나눕니다.\n3. 교수님의 요구사항과 인용 형식을 확인합니다.\n4. 다음 행동을 정합니다.\n\n【5. 최종 결론】\n먼저 과제 요구사항을 확인한 뒤 구체적인 역할을 정해야 합니다.\n\n【6. 예시】\n예를 들어 한 명은 사례, 한 명은 이론, 한 명은 PPT 정리를 맡을 수 있습니다.",
  en: "【1. Discussion Topic】\nThe group is clarifying roles for a class discussion or assignment presentation.\n\n【2. Core Question】\nThe group needs to decide who owns each part and confirm the professor's requirements.\n\n【3. Key Concepts】\n- Role split: each person owns a clear part.\n- Requirement check: confirm grading criteria and submission format first.\n- Citation format: keep source formatting consistent.\n\n【4. Discussion Logic】\n1. Confirm the task goal.\n2. Split responsibilities.\n3. Check professor requirements and citation format.\n4. Decide the next actions.\n\n【5. Final Takeaway】\nThe group should confirm the assignment requirements before finalizing responsibilities.\n\n【6. Example】\nFor example, one student handles cases, one handles theory, and one organizes the slides.",
};

export function buildMockTranslations(sourceLanguage: Language) {
  return mockTranslations[sourceLanguage];
}
