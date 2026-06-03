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
  zh: "【1. 本次讨论结论】\n- 先确认发表顺序、资料整理分工和教授要求的引用格式。\n\n【2. 分工与负责人】\n- 案例整理：待确认负责人\n- 理论框架：待确认负责人\n- introduction 和结论：待确认负责人\n- 引用格式检查：待确认负责人\n\n【3. 教授/作业要求】\n- 已提到：需要确认教授要求的引用格式。\n- 未确认：评分标准、提交格式、是否需要韩文/英文摘要。\n\n【4. 还没解决的问题】\n- 评分标准是什么？\n- 最终提交格式是什么？\n- 是否需要韩文或英文摘要？\n\n【5. 下一步行动】\n- 上传教授公告或作业要求文件。\n- 提取文件中的具体要求。\n- 确认每个人负责的部分。\n- 确认发表顺序和引用格式。",
  ko: "【1. 이번 논의 결론】\n- 발표 순서, 자료 정리 역할, 교수님이 요구한 인용 형식을 먼저 확인해야 합니다.\n\n【2. 역할과 담당자】\n- 사례 정리: 담당자 확인 필요\n- 이론 프레임 정리: 담당자 확인 필요\n- introduction 및 결론: 담당자 확인 필요\n- 인용 형식 점검: 담당자 확인 필요\n\n【3. 교수님/과제 요구사항】\n- 확인된 내용: 교수님이 요구한 인용 형식을 확인해야 합니다.\n- 미확인: 평가 기준, 제출 형식, 한국어/영어 요약 필요 여부.\n\n【4. 아직 해결되지 않은 질문】\n- 평가 기준은 무엇인가요?\n- 최종 제출 형식은 무엇인가요?\n- 한국어 또는 영어 요약이 필요한가요?\n\n【5. 다음 행동】\n- 교수님 공지나 과제 요구 파일을 업로드합니다.\n- 파일에서 구체 요구사항을 추출합니다.\n- 각자 맡을 부분을 확정합니다.\n- 발표 순서와 인용 형식을 확인합니다.",
  en: "【1. Discussion Decisions】\n- The group should first confirm presentation order, material roles, and the professor's required citation format.\n\n【2. Tasks And Owners】\n- Case examples: owner not confirmed\n- Theory framework: owner not confirmed\n- Introduction and conclusion: owner not confirmed\n- Citation-format check: owner not confirmed\n\n【3. Professor / Assignment Requirements】\n- Mentioned: the professor's required citation format needs to be confirmed.\n- Not confirmed: grading criteria, submission format, and whether a Korean/English abstract is required.\n\n【4. Unresolved Questions】\n- What are the grading criteria?\n- What is the final submission format?\n- Is a Korean or English abstract required?\n\n【5. Next Actions】\n- Upload the professor's notice or assignment file.\n- Extract concrete requirements from the file.\n- Confirm each person's responsibility.\n- Confirm presentation order and citation format.",
};

export function buildMockTranslations(sourceLanguage: Language) {
  return mockTranslations[sourceLanguage];
}
