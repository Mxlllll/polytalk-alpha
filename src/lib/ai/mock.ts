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
  zh: "已确认：先确认发表顺序、资料整理分工和教授要求的引用格式。\n任务建议：1. 一人整理案例；2. 一人整理理论框架；3. 一人负责 introduction 和结论；4. 一人检查引用格式。\n待确认：评分标准、提交格式、是否需要韩文/英文摘要。\n下一步：把教授公告或作业要求文件上传后，再提取具体要求。",
  ko: "확정된 내용: 발표 순서, 자료 정리 역할, 교수님이 요구한 인용 형식을 먼저 확인해야 합니다.\n역할 제안: 1. 사례 정리, 2. 이론 프레임 정리, 3. introduction/결론 작성, 4. 인용 형식 점검.\n확인 필요: 평가 기준, 제출 형식, 한국어/영어 요약 필요 여부.\n다음 단계: 교수님 공지나 과제 요구 파일을 업로드해 구체 요구사항을 추출합니다.",
  en: "Confirmed: the group should first verify presentation order, material roles, and the professor's citation format.\nSuggested split: 1. case examples, 2. theory framework, 3. introduction/conclusion, 4. citation-format check.\nStill unclear: grading criteria, submission format, and whether a Korean/English abstract is required.\nNext action: upload the professor's notice or assignment file to extract concrete requirements.",
};

export function buildMockTranslations(sourceLanguage: Language) {
  return mockTranslations[sourceLanguage];
}
