"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Eye,
  FileText,
  History,
  Loader2,
  LogOut,
  Mic,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Send,
  Sparkles,
  Users,
} from "lucide-react";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { buildMockTranslations } from "@/lib/ai/mock";

type Language = "zh" | "ko" | "en";
type Stage = "home" | "auth" | "lobby" | "room";
type FileSummaryMode = "course" | "assignment";
type ReactionKey = "got_it" | "agree" | "question" | "watching" | "thanks";
type MessageReactions = Partial<Record<ReactionKey, string[]>>;

type RecorderState = "idle" | "recording" | "processing";
type VoiceTranscriptSelection = {
  messageId: string;
  language: Language;
};

type Member = {
  id: string;
  name: string;
  email: string;
  language: Language;
};

type Message = {
  id: string;
  senderId: string;
  kind: "text" | "voice" | "file" | "file_summary" | "discussion_summary";
  originalLanguage: Language;
  originalText: string;
  translations: Partial<Record<Language, string>>;
  attachmentId?: string | null;
  fileName?: string;
  filePath?: string;
  fileType?: string | null;
  voiceUrl?: string;
  voiceDuration?: number;
  createdAt: string;
  isPending?: boolean;
  reactions?: MessageReactions;
};

type DbMessageRow = {
  id: string;
  sender_id: string;
  kind: "text" | "voice" | "file_summary" | "discussion_summary";
  original_language: Language;
  original_text: string;
  translations: Partial<Record<Language, string>>;
  attachment_id?: string | null;
  voice_url?: string | null;
  voice_duration?: number | null;
  attachments?:
    | { file_name: string; file_path: string; file_type: string | null }
    | { file_name: string; file_path: string; file_type: string | null }[]
    | null;
  created_at: string;
};

type DbRoomMemberRow = {
  user_id: string;
  profiles:
    | {
        id: string;
        display_name: string;
        school_email: string;
        preferred_language: Language;
      }
    | {
        id: string;
        display_name: string;
        school_email: string;
        preferred_language: Language;
      }[]
    | null;
};

type FileSummaryApiResponse = {
  extractedTextLength: number;
  mode: FileSummaryMode;
  summary: Record<Language, string>;
  source: "deepseek" | "mock";
};

type PrivateAiResult = {
  id: string;
  kind: "discussion_summary" | "file_summary";
  title: string;
  fileName?: string;
  summary: Record<Language, string>;
  source: "deepseek" | "mock";
  createdAt: string;
};

type FilePreview = {
  fileName: string;
  imageUrl?: string;
  documentUrl?: string;
  text: string;
};

type HistoryRecord = {
  id: string;
  title: string;
  joinCode: string;
  endedAt: string;
  members: Member[];
  messages: Message[];
  files: string[];
  aiResults: PrivateAiResult[];
};

type LocalAlphaAccount = {
  id: string;
  email: string;
  password: string;
  displayName: string;
  language: Language;
};

type DemoRoomApiResponse = {
  room?: {
    id: string;
    title: string;
    joinCode: string;
    members: Member[];
    messages: Message[];
    files: string[];
    memberCount?: number;
    messageCount?: number;
    fileCount?: number;
    updatedAt?: number;
  };
  error?: string;
};

type DemoRoomRealtimeRow = {
  id: string;
  title: string;
  join_code: string;
  members: Member[] | null;
  messages: Message[] | null;
  files: string[] | null;
};

const reactionOptions: {
  emoji: string;
  key: ReactionKey;
  label: Record<Language, string>;
}[] = [
  { key: "got_it", emoji: "OK", label: { zh: "收到", ko: "확인", en: "Got it" } },
  { key: "agree", emoji: "+1", label: { zh: "同意", ko: "동의", en: "Agree" } },
  { key: "question", emoji: "?", label: { zh: "有疑问", ko: "질문", en: "Question" } },
  { key: "watching", emoji: "...", label: { zh: "在看", ko: "확인 중", en: "Watching" } },
  { key: "thanks", emoji: "thx", label: { zh: "谢谢", ko: "고마워", en: "Thanks" } },
];

const languageLabels: Record<Language, string> = {
  zh: "中文",
  ko: "한국어",
  en: "English",
};

const fileSummaryModeTitles: Record<FileSummaryMode, Record<Language, string>> = {
  course: {
    zh: "课堂总结",
    ko: "수업 요약",
    en: "Class Summary",
  },
  assignment: {
    zh: "作业要求",
    ko: "과제 요구사항",
    en: "Assignment Brief",
  },
};

const fileActionLabels: Record<"preview" | "summarize", Record<Language, string>> = {
  preview: {
    zh: "预览",
    ko: "미리보기",
    en: "Preview",
  },
  summarize: {
    zh: "AI 总结",
    ko: "AI 요약",
    en: "AI Summary",
  },
};

const roomStatusCopy: Record<
  Language,
  {
    creatingPublic: string;
    createdPublic: string;
    createPublicFailed: string;
    findingPublic: string;
    joinedPublic: string;
    joinFailed: string;
    creatingDb: string;
    createdDb: string;
    findingDb: string;
    joinedDb: string;
    roomNotFound: string;
  }
> = {
  zh: {
    creatingPublic: "正在创建公开测试房间...",
    createdPublic: "公开测试房间已创建，把面对面口令发给朋友即可加入同一个房间。",
    createPublicFailed: "公开测试房间创建失败，请刷新后再试。",
    findingPublic: "正在查找公开测试房间...",
    joinedPublic: "已加入公开测试房间。",
    joinFailed: "加入失败，请检查网络后再试。",
    creatingDb: "正在创建 Supabase 房间...",
    createdDb: "Supabase 房间已创建，后续消息会写入数据库。",
    findingDb: "正在查找 Supabase 房间...",
    joinedDb: "已加入 Supabase 房间。",
    roomNotFound: "房间不存在或口令错误，请确认后再试。",
  },
  ko: {
    creatingPublic: "공개 테스트 방을 만드는 중...",
    createdPublic: "공개 테스트 방이 만들어졌습니다. 대면 코드를 친구에게 보내면 같은 방에 참여할 수 있습니다.",
    createPublicFailed: "공개 테스트 방을 만들지 못했습니다. 새로고침 후 다시 시도하세요.",
    findingPublic: "공개 테스트 방을 찾는 중...",
    joinedPublic: "공개 테스트 방에 참여했습니다.",
    joinFailed: "참여에 실패했습니다. 네트워크를 확인한 뒤 다시 시도하세요.",
    creatingDb: "Supabase 방을 만드는 중...",
    createdDb: "Supabase 방이 만들어졌습니다. 이후 메시지는 데이터베이스에 저장됩니다.",
    findingDb: "Supabase 방을 찾는 중...",
    joinedDb: "Supabase 방에 참여했습니다.",
    roomNotFound: "방이 없거나 코드가 잘못되었습니다. 다시 확인해 주세요.",
  },
  en: {
    creatingPublic: "Creating public test room...",
    createdPublic: "Public test room created. Share the face-to-face code so friends can join the same room.",
    createPublicFailed: "Could not create the public test room. Refresh and try again.",
    findingPublic: "Finding public test room...",
    joinedPublic: "Joined the public test room.",
    joinFailed: "Join failed. Check the network and try again.",
    creatingDb: "Creating Supabase room...",
    createdDb: "Supabase room created. New messages will be saved to the database.",
    findingDb: "Finding Supabase room...",
    joinedDb: "Joined the Supabase room.",
    roomNotFound: "Room not found or the code is incorrect. Please check and try again.",
  },
};

const uiCopy: Record<
  Language,
  {
    schoolEmail: string;
    alphaPassword: string;
    displayName: string;
    myLanguage: string;
    signUp: string;
    signIn: string;
    checkingSession: string;
    skipChecking: string;
    demoWorkspace: string;
    verifiedEmail: string;
    lobbyTitle: string;
    switchIdentity: string;
    newRoom: string;
    roomName: string;
    createRoom: string;
    joinRoom: string;
    faceCode: string;
    join: string;
    inviteLink: string;
    qrCode: string;
    summarizing: string;
    summarize: string;
    uploadFile: string;
    voiceHold: string;
    voiceRelease: (seconds: number) => string;
    voiceProcessing: string;
    voiceTitle: string;
    voiceUnsupported: string;
    retranscribeVoice: string;
    transcribeTo: (language: string) => string;
    endAndSave: string;
    defaultRoomTitle: (date: string) => string;
    backHome: string;
    filePreview: string;
    close: string;
    openOriginalFile: string;
    myAiResults: string;
    shareToRoom: string;
    translating: string;
    messagePlaceholder: (name: string) => string;
    members: string;
    viewerPreview: string;
    files: string;
    noFiles: string;
    displayRule: string;
    original: string;
    seesFirst: (count: number, name: string, language: string) => string;
  }
> = {
  zh: {
    schoolEmail: "学校邮箱",
    alphaPassword: "Alpha 密码",
    displayName: "显示名称",
    myLanguage: "我的母语",
    signUp: "注册 Alpha 账号",
    signIn: "登录 Alpha 账号",
    checkingSession: "正在检查登录状态",
    skipChecking: "跳过检查，进入演示工作台",
    demoWorkspace: "进入演示工作台",
    verifiedEmail: "已验证学校邮箱",
    lobbyTitle: "创建或加入讨论房间",
    switchIdentity: "切换身份",
    newRoom: "新建房间",
    roomName: "房间名称",
    createRoom: "创建讨论房间",
    joinRoom: "加入房间",
    faceCode: "面对面口令",
    join: "加入",
    inviteLink: "邀请链接",
    qrCode: "二维码",
    summarizing: "总结中",
    summarize: "总结讨论",
    uploadFile: "上传文件",
    voiceHold: "按住说话",
    voiceRelease: (seconds) => `松开发送 ${seconds}s`,
    voiceProcessing: "转文字中",
    voiceTitle: "按住说话，松开发送",
    voiceUnsupported: "当前浏览器不支持录音",
    retranscribeVoice: "重新转写",
    transcribeTo: (languageName) => `转成${languageName}`,
    endAndSave: "结束并保存",
    defaultRoomTitle: (date) => `课堂讨论 ${date}`,
    backHome: "返回首页",
    filePreview: "文件预览",
    close: "关闭",
    openOriginalFile: "新窗口打开原文件",
    myAiResults: "我的 AI 结果",
    shareToRoom: "分享到房间",
    translating: "翻译中",
    messagePlaceholder: (name) => `以 ${name} 的视角输入消息`,
    members: "成员",
    viewerPreview: "视角预览",
    files: "文件",
    noFiles: "暂无文件",
    displayRule: "显示规则：大字永远是当前观看者母语，小字永远是发送者原文。",
    original: "原文",
    seesFirst: (count, name, languageName) => `${count} 位成员 · ${name} 优先看 ${languageName}`,
  },
  ko: {
    schoolEmail: "학교 이메일",
    alphaPassword: "Alpha 비밀번호",
    displayName: "표시 이름",
    myLanguage: "내 모국어",
    signUp: "Alpha 계정 만들기",
    signIn: "Alpha 로그인",
    checkingSession: "로그인 상태 확인 중",
    skipChecking: "확인을 건너뛰고 데모로 이동",
    demoWorkspace: "데모 작업 공간으로 이동",
    verifiedEmail: "학교 이메일 인증 완료",
    lobbyTitle: "토론방 만들기 또는 참여",
    switchIdentity: "사용자 전환",
    newRoom: "새 방",
    roomName: "방 이름",
    createRoom: "토론방 만들기",
    joinRoom: "방 참여",
    faceCode: "대면 코드",
    join: "참여",
    inviteLink: "초대 링크",
    qrCode: "QR 코드",
    summarizing: "요약 중",
    summarize: "토론 요약",
    uploadFile: "파일 업로드",
    voiceHold: "누르고 말하기",
    voiceRelease: (seconds) => `놓으면 전송 ${seconds}s`,
    voiceProcessing: "문자 변환 중",
    voiceTitle: "누르고 말한 뒤 놓으면 전송됩니다",
    voiceUnsupported: "현재 브라우저는 녹음을 지원하지 않습니다",
    retranscribeVoice: "다시 변환",
    transcribeTo: (languageName) => `${languageName}로 변환`,
    endAndSave: "종료하고 저장",
    defaultRoomTitle: (date) => `수업 토론 ${date}`,
    backHome: "홈으로",
    filePreview: "파일 미리보기",
    close: "닫기",
    openOriginalFile: "새 창에서 원본 열기",
    myAiResults: "내 AI 결과",
    shareToRoom: "방에 공유",
    translating: "번역 중",
    messagePlaceholder: (name) => `${name} 시점으로 메시지 입력`,
    members: "멤버",
    viewerPreview: "시점 미리보기",
    files: "파일",
    noFiles: "파일 없음",
    displayRule: "표시 규칙: 큰 글자는 항상 보는 사람의 모국어, 작은 글자는 항상 보낸 사람의 원문입니다.",
    original: "원문",
    seesFirst: (count, name, languageName) => `${count}명 · ${name}님은 ${languageName}을 먼저 봅니다`,
  },
  en: {
    schoolEmail: "School email",
    alphaPassword: "Alpha password",
    displayName: "Display name",
    myLanguage: "My primary language",
    signUp: "Create Alpha account",
    signIn: "Sign in to Alpha",
    checkingSession: "Checking session",
    skipChecking: "Skip check and enter demo",
    demoWorkspace: "Enter demo workspace",
    verifiedEmail: "Verified school email",
    lobbyTitle: "Create or join a discussion room",
    switchIdentity: "Switch identity",
    newRoom: "New room",
    roomName: "Room name",
    createRoom: "Create discussion room",
    joinRoom: "Join room",
    faceCode: "Face-to-face code",
    join: "Join",
    inviteLink: "Invite link",
    qrCode: "QR code",
    summarizing: "Summarizing",
    summarize: "Summarize discussion",
    uploadFile: "Upload file",
    voiceHold: "Hold to talk",
    voiceRelease: (seconds) => `Release to send ${seconds}s`,
    voiceProcessing: "Transcribing",
    voiceTitle: "Hold to talk, release to send",
    voiceUnsupported: "Recording is not supported in this browser",
    retranscribeVoice: "Retranscribe",
    transcribeTo: (languageName) => `Transcribe to ${languageName}`,
    endAndSave: "End and save",
    defaultRoomTitle: (date) => `Class discussion ${date}`,
    backHome: "Back home",
    filePreview: "File preview",
    close: "Close",
    openOriginalFile: "Open original file",
    myAiResults: "My AI results",
    shareToRoom: "Share to room",
    translating: "Translating",
    messagePlaceholder: (name) => `Message as ${name}`,
    members: "Members",
    viewerPreview: "Viewer preview",
    files: "Files",
    noFiles: "No files yet",
    displayRule: "Display rule: large text is always the viewer's native language; small text is always the sender's original text.",
    original: "Original",
    seesFirst: (count, name, languageName) => `${count} members · ${name} sees ${languageName} first`,
  },
};

const homeCopy: Record<
  Language,
  {
    close: string;
    displayName: string;
    history: string;
    historyEmpty: string;
    historyMeta: (messages: number, files: number, aiResults: number) => string;
    historySubtitle: string;
    join: string;
    login: string;
    primaryLanguage: string;
    start: string;
    startSubtitle: string;
  }
> = {
  zh: {
    close: "关闭",
    displayName: "显示名称",
    history: "历史记录",
    historyEmpty: "结束一次讨论后，这里会保存完整聊天、文件和 AI 结果。",
    historyMeta: (messages, files, aiResults) => `${messages} 条消息 · ${files} 个文件 · ${aiResults} 个 AI 结果`,
    historySubtitle: "查看之前保存的课堂讨论",
    join: "加入",
    login: "学校邮箱登录",
    primaryLanguage: "我的母语",
    start: "开始讨论",
    startSubtitle: "下一步选择创建口令或输入口令加入",
  },
  ko: {
    close: "닫기",
    displayName: "표시 이름",
    history: "기록",
    historyEmpty: "토론이 끝나면 전체 채팅, 파일, AI 결과가 여기에 저장됩니다.",
    historyMeta: (messages, files, aiResults) => `${messages}개 메시지 · ${files}개 파일 · ${aiResults}개 AI 결과`,
    historySubtitle: "저장된 수업 토론 보기",
    join: "참여",
    login: "학교 이메일 로그인",
    primaryLanguage: "내 모국어",
    start: "토론 시작",
    startSubtitle: "다음 단계에서 코드를 만들거나 입력해 참여합니다",
  },
  en: {
    close: "Close",
    displayName: "Display name",
    history: "History",
    historyEmpty: "After a discussion ends, full chat, files, and AI results will be saved here.",
    historyMeta: (messages, files, aiResults) => `${messages} messages · ${files} files · ${aiResults} AI results`,
    historySubtitle: "Review saved class discussions",
    join: "Join",
    login: "School email login",
    primaryLanguage: "My primary language",
    start: "Start discussion",
    startSubtitle: "Next, create a code or enter one to join",
  },
};

const roomChoiceCopy: Record<
  Language,
  {
    back: string;
    create: string;
    createDescription: string;
    createTitle: string;
    join: string;
    joinDescription: string;
    joinPlaceholder: string;
    joinTitle: string;
    subtitle: string;
    title: string;
  }
> = {
  zh: {
    back: "返回首页",
    create: "创建口令",
    createDescription: "生成一个 4 位面对面口令，让同学输入同一个口令加入。",
    createTitle: "我来创建讨论",
    join: "加入讨论",
    joinDescription: "输入同学给你的 4 位口令，进入同一个讨论房间。",
    joinPlaceholder: "输入 4 位口令",
    joinTitle: "我有口令",
    subtitle: "选择创建一个新讨论，或输入口令加入已有讨论。",
    title: "进入讨论",
  },
  ko: {
    back: "홈으로",
    create: "코드 만들기",
    createDescription: "4자리 대면 코드를 만들어 같은 방에 참여할 수 있게 합니다.",
    createTitle: "토론 만들기",
    join: "토론 참여",
    joinDescription: "친구가 준 4자리 코드를 입력해 같은 토론방에 들어갑니다.",
    joinPlaceholder: "4자리 코드 입력",
    joinTitle: "코드가 있어요",
    subtitle: "새 토론을 만들거나 코드를 입력해 기존 토론에 참여하세요.",
    title: "토론 입장",
  },
  en: {
    back: "Back home",
    create: "Create code",
    createDescription: "Generate a 4-digit face-to-face code so classmates can join the same room.",
    createTitle: "Create a discussion",
    join: "Join discussion",
    joinDescription: "Enter the 4-digit code from your classmate to join the same room.",
    joinPlaceholder: "Enter 4-digit code",
    joinTitle: "I have a code",
    subtitle: "Create a new discussion or join an existing one with a code.",
    title: "Enter discussion",
  },
};
const sampleMembers: Member[] = [
  { id: "current-user", name: "Mina", email: "mina@yonsei.ac.kr", language: "zh" },
  { id: "chen", name: "Chen", email: "chen@yonsei.ac.kr", language: "zh" },
  { id: "jiho", name: "Jiho", email: "jiho@yonsei.ac.kr", language: "ko" },
  { id: "seoah", name: "Seoah", email: "seoah@yonsei.ac.kr", language: "ko" },
  { id: "emma", name: "Emma", email: "emma@yonsei.ac.kr", language: "en" },
];

const initialMessages: Message[] = [
  {
    id: "m1",
    senderId: "jiho",
    kind: "text",
    originalLanguage: "ko",
    originalText: "오늘 회의에서는 발표 순서와 자료 정리 담당을 먼저 정하면 좋겠습니다.",
    translations: {
      zh: "我觉得今天会议里最好先确定发表顺序和资料整理分工。",
      en: "It would be good to decide the presentation order and who organizes the materials first.",
    },
    createdAt: "10:18",
  },
  {
    id: "m2",
    senderId: "current-user",
    kind: "text",
    originalLanguage: "zh",
    originalText: "我可以负责整理案例部分，但想先确认教授要求的引用格式。",
    translations: {
      ko: "제가 사례 부분을 정리할 수 있지만, 먼저 교수님이 요구한 인용 형식을 확인하고 싶습니다.",
      en: "I can organize the case section, but I want to confirm the citation format required by the professor first.",
    },
    createdAt: "10:20",
  },
  {
    id: "m3",
    senderId: "emma",
    kind: "text",
    originalLanguage: "en",
    originalText: "I can draft the introduction if someone shares the assignment brief later.",
    translations: {
      zh: "如果之后有人分享作业要求，我可以先写 introduction 草稿。",
      ko: "나중에 누군가 과제 요약을 공유해 주면 제가 서론 초안을 작성할 수 있습니다.",
    },
    createdAt: "10:22",
  },
  {
    id: "m4",
    senderId: "chen",
    kind: "text",
    originalLanguage: "zh",
    originalText: "我和 Mina 可以一起检查中文资料，然后把重点整理出来。",
    translations: {
      ko: "Mina와 제가 중국어 자료를 함께 확인하고 핵심 내용을 정리할 수 있습니다.",
      en: "Mina and I can review the Chinese materials together and organize the key points.",
    },
    createdAt: "10:24",
  },
  {
    id: "m5",
    senderId: "seoah",
    kind: "text",
    originalLanguage: "ko",
    originalText: "제가 교수님 공지에서 평가 기준 부분을 다시 확인해 보겠습니다.",
    translations: {
      zh: "我来重新确认一下教授公告里的评分标准部分。",
      en: "I will double-check the grading criteria section in the professor's notice.",
    },
    createdAt: "10:25",
  },
];
function nowLabel() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function structuredSummaryBlocks(text: string) {
  const normalized = text.replace(/\s*(【[^】]+】)\s*/g, "\n$1\n").trim();
  const parts = normalized.split(/(【[^】]+】)/g).map((part) => part.trim()).filter(Boolean);

  if (!parts.some((part) => part.startsWith("【"))) return [{ body: normalized }];

  const blocks: { heading?: string; body: string }[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (part.startsWith("【")) {
      blocks.push({ heading: part, body: (parts[index + 1] ?? "").trim() });
      index += 1;
    } else {
      blocks.push({ body: part });
    }
  }

  return blocks.filter((block) => block.heading || block.body);
}

function StructuredSummary({ text }: { text: string }) {
  return (
    <div className="structured-summary">
      {structuredSummaryBlocks(text).map((block, index) => (
        <section className="summary-block" key={`${block.heading ?? "summary"}-${index}`}>
          {block.heading ? <h4>{block.heading}</h4> : null}
          {block.body ? <p>{block.body}</p> : null}
        </section>
      ))}
    </div>
  );
}

function joinCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function normalizeJoinCode(input: string) {
  const digits = input.replace(/\D/g, "");
  if (digits.length >= 4) return digits.slice(0, 4);
  return input.trim().replace(/\s+/g, " ");
}

function historyStorageKey(userId: string) {
  return `polytalk-history-${userId}`;
}

function localAccountsStorageKey() {
  return "polytalk-alpha-local-accounts";
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function validateAuthFields(email: string, password: string, displayName?: string) {
  const normalizedEmail = normalizeEmail(email);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return "请输入有效的邮箱地址。";
  }

  if (password.length < 6) {
    return "密码至少需要 6 位。";
  }

  if (displayName !== undefined && !displayName.trim()) {
    return "请输入显示名称。";
  }

  return "";
}

function authErrorMessage(errorMessage: string) {
  const normalized = errorMessage.toLowerCase();

  if (normalized.includes("invalid login") || normalized.includes("invalid credentials")) {
    return "邮箱或密码不正确。";
  }

  if (normalized.includes("already registered") || normalized.includes("already exists")) {
    return "这个邮箱已经注册过，请直接登录。";
  }

  if (normalized.includes("email not confirmed")) {
    return "邮箱还没有确认，请先完成邮箱验证。";
  }

  if (normalized.includes("fetch") || normalized.includes("failed") || normalized.includes("timeout")) {
    return "登录服务暂时连接失败，请稍后再试。";
  }

  return errorMessage || "账号请求失败，请稍后再试。";
}

function loadLocalAlphaAccounts(): LocalAlphaAccount[] {
  if (typeof window === "undefined") return [];

  try {
    return JSON.parse(window.localStorage.getItem(localAccountsStorageKey()) ?? "[]") as LocalAlphaAccount[];
  } catch {
    return [];
  }
}

function saveLocalAlphaAccounts(accounts: LocalAlphaAccount[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(localAccountsStorageKey(), JSON.stringify(accounts));
}

function loadLocalHistory(userId: string): HistoryRecord[] {
  if (typeof window === "undefined") return [];

  try {
    return JSON.parse(window.localStorage.getItem(historyStorageKey(userId)) ?? "[]") as HistoryRecord[];
  } catch {
    return [];
  }
}

function saveLocalHistory(userId: string, records: HistoryRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(historyStorageKey(userId), JSON.stringify(records.slice(0, 20)));
}

function sanitizeStorageFileName(fileName: string) {
  const extension = fileName.includes(".") ? fileName.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") : "";
  const baseName = fileName.replace(/\.[^/.]+$/, "");
  const safeBaseName = baseName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);

  const safeName = safeBaseName || "uploaded-file";
  return extension ? `${safeName}.${extension.toLowerCase()}` : safeName;
}

function attachmentFromRow(row: DbMessageRow) {
  return Array.isArray(row.attachments) ? row.attachments[0] : row.attachments;
}

function isInlinePreviewFile(fileName: string, fileType?: string | null) {
  const lowerName = fileName.toLowerCase();
  return Boolean(fileType?.startsWith("image/")) || fileType === "application/pdf" || /\.(png|jpe?g|gif|webp|pdf)$/i.test(lowerName);
}

function isImagePreviewFile(fileName: string, fileType?: string | null) {
  return Boolean(fileType?.startsWith("image/")) || /\.(png|jpe?g|gif|webp)$/i.test(fileName);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timer));
  });
}

function getOrCreateDemoUserId() {
  if (typeof window === "undefined") return "demo-user";

  const storedDemoUserId = window.localStorage.getItem("polytalk-demo-user-id");
  if (storedDemoUserId) return storedDemoUserId;

  const nextDemoUserId = crypto.randomUUID();
  window.localStorage.setItem("polytalk-demo-user-id", nextDemoUserId);
  return nextDemoUserId;
}

function isSameMessage(left: Message, right: Message) {
  return (
    left.id === right.id &&
    left.originalText === right.originalText &&
    left.isPending === right.isPending &&
    JSON.stringify(left.translations ?? {}) === JSON.stringify(right.translations ?? {}) &&
    JSON.stringify(left.reactions ?? {}) === JSON.stringify(right.reactions ?? {})
  );
}

export default function Home() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const supabaseConfigured = useMemo(() => isSupabaseConfigured(), []);
  const [stage, setStage] = useState<Stage>("home");
  const [email, setEmail] = useState("mina@yonsei.ac.kr");
  const [password, setPassword] = useState("polytalk123");
  const [displayName, setDisplayName] = useState("Mina");
  const [language, setLanguage] = useState<Language>("zh");
  const [authStatus, setAuthStatus] = useState("");
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [roomTitle, setRoomTitle] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [isDbRoom, setIsDbRoom] = useState(false);
  const [isPublicDemoRoom, setIsPublicDemoRoom] = useState(false);
  const [roomStatus, setRoomStatus] = useState("");
  const [roomMembers, setRoomMembers] = useState<Member[] | null>(null);
  const [demoUserId] = useState(getOrCreateDemoUserId);
  const [activeViewerId, setActiveViewerId] = useState(getOrCreateDemoUserId);
  const [messageText, setMessageText] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const voiceAudioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const voiceLongPressTimersRef = useRef<Record<string, number>>({});
  const voiceLongPressTriggeredRef = useRef(false);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef(0);
  const recordingTimerRef = useRef<number | null>(null);
  const [recorderState, setRecorderState] = useState<RecorderState>("idle");
  const recorderStateRef = useRef<RecorderState>("idle");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceSupported, setVoiceSupported] = useState(() => {
    if (typeof window === "undefined") return false;
    return Boolean(window.MediaRecorder && window.navigator?.mediaDevices?.getUserMedia);
  });
  const [messages, setMessages] = useState(initialMessages);
  const messageCountRef = useRef(initialMessages.length);
  const [files, setFiles] = useState<string[]>([]);
  const fileCountRef = useRef(0);
  const [localFiles, setLocalFiles] = useState<Record<string, File>>({});
  const [privateAiResults, setPrivateAiResults] = useState<PrivateAiResult[]>([]);
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>(() => loadLocalHistory(getOrCreateDemoUserId()));
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isHistoryView, setIsHistoryView] = useState(false);
  const [activeVoiceMenuId, setActiveVoiceMenuId] = useState<string | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [voiceTranscriptSelection, setVoiceTranscriptSelection] = useState<VoiceTranscriptSelection | null>(null);
  const memberCountRef = useRef(0);
  const demoSyncInFlightRef = useRef(false);

  function updateRecorderState(nextState: RecorderState) {
    recorderStateRef.current = nextState;
    setRecorderState(nextState);
  }

  const members = useMemo<Member[]>(
    () => {
      if (roomMembers) return roomMembers;

      return sampleMembers.map((member) =>
        member.id === "current-user"
          ? { ...member, id: sessionUserId ?? demoUserId, name: displayName || "Mina", email, language }
          : member,
      );
    },
    [demoUserId, displayName, email, language, roomMembers, sessionUserId],
  );

  const activeViewer =
    members.find((member) => member.id === activeViewerId) ??
    (sessionUserId ? members.find((member) => member.id === sessionUserId) : undefined) ??
    members[0];
  const copy = uiCopy[stage === "room" ? activeViewer.language : language];
  const homeText = homeCopy[language];
  const historyOwnerId = sessionUserId ?? demoUserId;

  const currentMember = useMemo<Member>(
    () => ({
      id: sessionUserId ?? demoUserId,
      name: displayName || "Mina",
      email,
      language,
    }),
    [demoUserId, displayName, email, language, sessionUserId],
  );

  useEffect(() => {
    messageCountRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    memberCountRef.current = members.length;
  }, [members.length]);

  useEffect(() => {
    fileCountRef.current = files.length;
  }, [files.length]);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const ensureProfile = useCallback(
    async (userId: string, userEmail = email) => {
      if (!userId || !supabaseConfigured) return;

      await supabase.from("profiles").upsert({
        id: userId,
        display_name: displayName || "Mina",
        school_email: userEmail,
        preferred_language: language,
      });
    },
    [displayName, email, language, supabase, supabaseConfigured],
  );

  const mergeDemoRoomSnapshot = useCallback((room: DemoRoomApiResponse["room"]) => {
    if (!room) return;

    setCurrentRoomId(room.id);
    setRoomTitle(room.title);
    setRoomCode(room.joinCode);

    if (room.members.length) {
      setRoomMembers((current) => {
        const existingMembers = current ?? [];
        const existingIds = new Set(existingMembers.map((item) => item.id));
        const nextMembers = room.members.filter((item) => !existingIds.has(item.id));
        return nextMembers.length ? [...existingMembers, ...nextMembers] : current;
      });
    }

    if (room.messages.length) {
      setMessages((current) => {
        const incomingById = new Map(room.messages.map((message) => [message.id, message]));
        let didReplace = false;
        const replacedMessages = current.map((message) => {
          const incomingMessage = incomingById.get(message.id);
          if (!incomingMessage || isSameMessage(message, incomingMessage)) return message;
          didReplace = true;
          return incomingMessage;
        });
        const existingIds = new Set(replacedMessages.map((item) => item.id));
        const nextMessages = room.messages.filter((item) => !existingIds.has(item.id));
        return nextMessages.length || didReplace ? [...replacedMessages, ...nextMessages] : current;
      });
    }

    if (room.files.length) {
      setFiles((current) => {
        const existingFiles = new Set(current);
        const nextFiles = room.files.filter((item) => !existingFiles.has(item));
        return nextFiles.length ? [...current, ...nextFiles] : current;
      });
    }
  }, []);

  const mergeRealtimeDemoRoom = useCallback(
    (row: DemoRoomRealtimeRow) => {
      mergeDemoRoomSnapshot({
        id: row.id,
        title: row.title,
        joinCode: row.join_code,
        members: row.members ?? [],
        messages: row.messages ?? [],
        files: row.files ?? [],
      });
    },
    [mergeDemoRoomSnapshot],
  );

  const loadMessages = useCallback(
    async (roomId: string) => {
      const { data, error } = await supabase
        .from("messages")
        .select(
          "id, sender_id, kind, original_language, original_text, translations, attachment_id, voice_url, voice_duration, attachments(file_name, file_path, file_type), created_at",
        )
        .eq("room_id", roomId)
        .order("created_at", { ascending: true });

      if (error) {
        setRoomStatus(`读取消息失败：${error.message}`);
        return;
      }

      setMessages(
        ((data ?? []) as DbMessageRow[]).map((row) => {
          const attachment = attachmentFromRow(row);

          return {
            id: row.id,
            senderId: row.sender_id,
            kind: row.kind,
            originalLanguage: row.original_language,
            originalText: row.original_text,
            translations: row.translations,
            attachmentId: row.attachment_id,
            fileName: attachment?.file_name,
            filePath: attachment?.file_path,
            fileType: attachment?.file_type,
            voiceUrl: row.voice_url ?? undefined,
            voiceDuration: row.voice_duration ?? undefined,
            createdAt: new Date(row.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          };
        }),
      );
    },
    [supabase],
  );

  const loadRoomMembers = useCallback(
    async (roomId: string) => {
      const { data, error } = await supabase
        .from("room_members")
        .select("user_id, profiles(id, display_name, school_email, preferred_language)")
        .eq("room_id", roomId)
        .order("joined_at", { ascending: true });

      if (error) {
        setRoomStatus(`读取成员失败：${error.message}`);
        return;
      }

      const loadedMembers = ((data ?? []) as DbRoomMemberRow[])
        .map((row) => {
          const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
          if (!profile) return null;

          return {
            id: row.user_id,
            name: profile.display_name,
            email: profile.school_email,
            language: profile.preferred_language,
          };
        })
        .filter((member): member is Member => Boolean(member));

      if (loadedMembers.length) {
        setRoomMembers(loadedMembers);
        if (sessionUserId && !loadedMembers.some((member) => member.id === activeViewerId)) {
          setActiveViewerId(sessionUserId);
        }
      }
    },
    [activeViewerId, sessionUserId, supabase],
  );

  const syncDemoRoom = useCallback(
    async (roomId: string, member = currentMember) => {
      const response = await fetch("/api/demo/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sync",
          roomId,
          joinCode: roomCode,
          member,
          memberCount: memberCountRef.current,
          messageCount: messageCountRef.current,
          fileCount: fileCountRef.current,
        }),
      });

      const data = (await response.json()) as DemoRoomApiResponse;
      if (!response.ok || !data.room) throw new Error(data.error ?? "Demo room sync failed");

      mergeDemoRoomSnapshot(data.room);
      setActiveViewerId(member.id);
      return data.room;
    },
    [currentMember, mergeDemoRoomSnapshot, roomCode],
  );

  useEffect(() => {
    if (!isDbRoom || !currentRoomId) return;

    const channel = supabase
      .channel(`room-${currentRoomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${currentRoomId}`,
        },
        (payload) => {
          const row = payload.new as DbMessageRow;
          if (row.attachment_id) {
            loadMessages(currentRoomId);
            return;
          }

          setMessages((current) => {
            if (current.some((message) => message.id === row.id)) return current;

            return [
              ...current,
              {
                id: row.id,
                senderId: row.sender_id,
                kind: row.kind,
                originalLanguage: row.original_language,
                originalText: row.original_text,
                translations: row.translations,
                attachmentId: row.attachment_id,
                voiceUrl: row.voice_url ?? undefined,
                voiceDuration: row.voice_duration ?? undefined,
                createdAt: new Date(row.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              },
            ];
          });
        },
      )
      .subscribe();

    const refreshTimer = window.setInterval(() => {
      loadMessages(currentRoomId);
      loadRoomMembers(currentRoomId);
    }, 4000);

    return () => {
      window.clearInterval(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [currentRoomId, isDbRoom, loadMessages, loadRoomMembers, supabase]);

  useEffect(() => {
    if (!isPublicDemoRoom || !currentRoomId) return;

    const refreshTimer = window.setInterval(() => {
      if (demoSyncInFlightRef.current || document.visibilityState === "hidden") return;

      demoSyncInFlightRef.current = true;
      syncDemoRoom(currentRoomId)
        .then(() => {
          setRoomStatus((current) =>
            current === "公开测试房间同步失败，请刷新后再试。" ? "" : current,
          );
        })
        .catch((error) => {
          console.error(error);
          setRoomStatus("公开测试房间同步失败，请刷新后再试。");
        })
        .finally(() => {
          demoSyncInFlightRef.current = false;
        });
    }, 900);

    return () => window.clearInterval(refreshTimer);
  }, [currentRoomId, isPublicDemoRoom, syncDemoRoom]);

  useEffect(() => {
    if (!isPublicDemoRoom || !currentRoomId || !supabaseConfigured) return;

    const channel = supabase
      .channel(`demo-room-${currentRoomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "demo_rooms",
          filter: `id=eq.${currentRoomId}`,
        },
        (payload) => {
          if (!payload.new || !("id" in payload.new)) return;
          mergeRealtimeDemoRoom(payload.new as DemoRoomRealtimeRow);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentRoomId, isPublicDemoRoom, mergeRealtimeDemoRoom, supabase, supabaseConfigured]);

  useEffect(() => {
    async function initializeSession() {
      if (!supabaseConfigured) {
        const localSessionId = window.localStorage.getItem("polytalk-alpha-local-session");
        const localAccount = loadLocalAlphaAccounts().find((account) => account.id === localSessionId);

        if (localAccount) {
          setSessionUserId(localAccount.id);
          setActiveViewerId(localAccount.id);
          setEmail(localAccount.email);
          setDisplayName(localAccount.displayName);
          setLanguage(localAccount.language);
          setAuthStatus("演示账号已登录，可以继续使用。");
        } else {
          setAuthStatus("当前未配置 Supabase，注册/登录将使用本机演示账号。");
        }

        setIsCheckingSession(false);
        return;
      }

      try {
        const code = new URLSearchParams(window.location.search).get("code");

        if (code) {
          const { error } = await withTimeout(supabase.auth.exchangeCodeForSession(code), 6000, "Email confirmation");
          window.history.replaceState({}, document.title, window.location.pathname);

          if (error) {
            setAuthStatus(`登录确认失败：${error.message}`);
            return;
          }
        }

        const { data } = await withTimeout(supabase.auth.getSession(), 5000, "Session check");
        const sessionEmail = data.session?.user.email;

        if (sessionEmail) {
          setSessionUserId(data.session?.user.id ?? null);
          setActiveViewerId(data.session?.user.id ?? "current-user");
          setEmail(sessionEmail);
          await withTimeout(ensureProfile(data.session?.user.id ?? "", sessionEmail), 5000, "Profile sync");
          setAuthStatus("邮箱登录成功，可以直接开始讨论。");
        }
      } catch (error) {
        console.error(error);
        setAuthStatus("临时链接下登录状态检查超时。你可以先进入演示工作台，或重新点击登录。");
      } finally {
        setIsCheckingSession(false);
      }
    }

    initializeSession();
  }, [ensureProfile, supabase, supabaseConfigured]);

  async function signUpWithPassword() {
    setIsAuthenticating(true);
    setAuthStatus("");
    const validationMessage = validateAuthFields(email, password, displayName);

    if (validationMessage) {
      setAuthStatus(validationMessage);
      setIsAuthenticating(false);
      return;
    }

    if (!supabaseConfigured) {
      const normalizedEmail = normalizeEmail(email);
      const accounts = loadLocalAlphaAccounts();

      if (accounts.some((account) => account.email === normalizedEmail)) {
        setAuthStatus("这个邮箱已经注册过，请直接登录。");
        setIsAuthenticating(false);
        return;
      }

      const account: LocalAlphaAccount = {
        id: `local-${crypto.randomUUID()}`,
        email: normalizedEmail,
        password,
        displayName: displayName.trim(),
        language,
      };

      saveLocalAlphaAccounts([...accounts, account]);
      window.localStorage.setItem("polytalk-alpha-local-session", account.id);
      setSessionUserId(account.id);
      setActiveViewerId(account.id);
      setEmail(account.email);
      setDisplayName(account.displayName);
      setLanguage(account.language);
      setAuthStatus("演示账号注册成功，已进入工作台。");
      setStage("home");
      setIsAuthenticating(false);
      return;
    }

    try {
      const { data, error } = await withTimeout(
        supabase.auth.signUp({
          email,
          password,
        }),
        12000,
        "Sign up",
      );

      if (error) {
        setAuthStatus(authErrorMessage(error.message));
        return;
      }

      if (data.session) {
        setSessionUserId(data.session.user.id);
        setActiveViewerId(data.session.user.id);
        await withTimeout(ensureProfile(data.session.user.id, data.session.user.email ?? email), 6000, "Profile sync");
        setAuthStatus("注册成功，已进入 Alpha 工作台。");
        setStage("home");
        return;
      }

      setAuthStatus("注册成功，但 Supabase 仍要求邮箱确认。");
    } catch (error) {
      console.error(error);
      setAuthStatus("注册请求超时。临时链接网络不稳定时，可以先进入演示工作台测试。");
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function signInWithPassword() {
    setIsAuthenticating(true);
    setAuthStatus("");
    const validationMessage = validateAuthFields(email, password);

    if (validationMessage) {
      setAuthStatus(validationMessage);
      setIsAuthenticating(false);
      return;
    }

    if (!supabaseConfigured) {
      const normalizedEmail = normalizeEmail(email);
      const account = loadLocalAlphaAccounts().find(
        (storedAccount) => storedAccount.email === normalizedEmail && storedAccount.password === password,
      );

      if (!account) {
        setAuthStatus("邮箱或密码不正确。如果还没有账号，请先注册。");
        setIsAuthenticating(false);
        return;
      }

      window.localStorage.setItem("polytalk-alpha-local-session", account.id);
      setSessionUserId(account.id);
      setActiveViewerId(account.id);
      setEmail(account.email);
      setDisplayName(account.displayName);
      setLanguage(account.language);
      setAuthStatus("演示账号登录成功，已进入工作台。");
      setStage("home");
      setIsAuthenticating(false);
      return;
    }

    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email,
          password,
        }),
        12000,
        "Sign in",
      );

      if (error) {
        setAuthStatus(authErrorMessage(error.message));
        return;
      }

      if (data.session) {
        setSessionUserId(data.session.user.id);
        setActiveViewerId(data.session.user.id);
        await withTimeout(ensureProfile(data.session.user.id, data.session.user.email ?? email), 6000, "Profile sync");
        setAuthStatus("登录成功，已进入 Alpha 工作台。");
        setStage("home");
      }
    } catch (error) {
      console.error(error);
      setAuthStatus("登录请求超时。临时链接网络不稳定时，可以先进入演示工作台测试。");
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function createRoom() {
    const code = joinCode();
    const statusText = roomStatusCopy[language];
    const dateLabel = new Date().toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
    const generatedTitle = uiCopy[language].defaultRoomTitle(dateLabel);
    const nextRoomTitle = roomTitle.trim() || generatedTitle;
    setRoomTitle(nextRoomTitle);
    setStage("room");
    setIsHistoryView(false);
    setMessages([]);
    setFiles([]);
    setPrivateAiResults([]);
    setFilePreview(null);
    setRoomMembers([currentMember]);
    setActiveViewerId(currentMember.id);

    setRoomStatus(statusText.creatingPublic);
    setIsDbRoom(false);
    setIsPublicDemoRoom(true);

    try {
      const response = await fetch("/api/demo/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          title: nextRoomTitle,
          joinCode: code,
          member: currentMember,
        }),
      });
      const data = (await response.json()) as DemoRoomApiResponse;
      if (!response.ok || !data.room) throw new Error(data.error ?? "Demo room create failed");

      setCurrentRoomId(data.room.id);
      setRoomTitle(data.room.title);
      setRoomCode(data.room.joinCode);
      setRoomMembers(data.room.members);
      setMessages(data.room.messages);
      setFiles(data.room.files);
      setRoomStatus(statusText.createdPublic);
    } catch (error) {
      console.error(error);
      setIsPublicDemoRoom(false);
      setRoomStatus(statusText.createPublicFailed);
      return;
    }
  }

  async function joinRoom() {
    const statusText = roomStatusCopy[language];
    const code = normalizeJoinCode(roomCode);
    setRoomCode(code);

    if (!code || code.replace(/\D/g, "").length !== 4) {
      setRoomStatus("请输入 4 位面对面口令，例如 4821。");
      return;
    }

    setIsDbRoom(false);
    setIsPublicDemoRoom(true);
    setRoomStatus(statusText.findingPublic);

    try {
      const response = await fetch("/api/demo/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "join",
          joinCode: code,
          member: currentMember,
        }),
      });
      const data = (await response.json()) as DemoRoomApiResponse;
      if (!response.ok || !data.room) {
        setIsPublicDemoRoom(false);
        setRoomStatus(statusText.roomNotFound);
        return;
      }

      setStage("room");
      setIsHistoryView(false);
      setCurrentRoomId(data.room.id);
      setRoomTitle(data.room.title);
      setRoomCode(data.room.joinCode);
      setRoomMembers(data.room.members);
      setMessages(data.room.messages);
      setFiles(data.room.files);
      setActiveViewerId(currentMember.id);
      setRoomStatus(statusText.joinedPublic);
    } catch (error) {
      console.error(error);
      setIsPublicDemoRoom(false);
      setRoomStatus(statusText.joinFailed);
      return;
    }
  }

  function openHistory(record: HistoryRecord) {
    setStage("room");
    setIsHistoryView(true);
    setIsDbRoom(false);
    setIsPublicDemoRoom(false);
    setCurrentRoomId(record.id);
    setRoomTitle(record.title);
    setRoomCode(record.joinCode);
    setRoomMembers(record.members);
    setMessages(record.messages);
    setFiles(record.files);
    setPrivateAiResults(record.aiResults);
    setFilePreview(null);
    setActiveViewerId(currentMember.id);
    setRoomStatus(`正在查看 ${record.endedAt} 保存的历史记录。`);
  }

  function returnHome(status = "") {
    setStage("home");
    setIsHistoryView(false);
    setIsDbRoom(false);
    setIsPublicDemoRoom(false);
    setCurrentRoomId(null);
    setRoomMembers(null);
    setFilePreview(null);
    setRoomStatus(status);
  }

  function endDiscussion() {
    const record: HistoryRecord = {
      id: currentRoomId ?? crypto.randomUUID(),
      title: roomTitle || "未命名讨论",
      joinCode: roomCode,
      endedAt: new Date().toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
      members,
      messages,
      files,
      aiResults: privateAiResults,
    };

    const nextRecords = [record, ...historyRecords.filter((item) => item.id !== record.id)].slice(0, 20);
    setHistoryRecords(nextRecords);
    saveLocalHistory(historyOwnerId, nextRecords);
    returnHome("讨论已结束，完整聊天和 AI 结果已保存到历史记录。");
  }

  function mainText(message: Message) {
    if (message.originalLanguage === activeViewer.language) return message.originalText;
    return message.translations[activeViewer.language] ?? message.originalText;
  }

  function secondaryText(message: Message) {
    const sender = members.find((member) => member.id === message.senderId);
    const senderLanguage = sender?.language ?? message.originalLanguage;
    return `${languageLabels[senderLanguage]} ${copy.original} · ${message.originalText}`;
  }

  function formatVoiceDuration(seconds?: number) {
    if (!seconds) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = String(seconds % 60).padStart(2, "0");
    return `${minutes}:${remainingSeconds}`;
  }

  function toggleReactionLocally(messageId: string, reactionKey: ReactionKey, userId: string) {
    setMessages((current) =>
      current.map((message) => {
        if (message.id !== messageId) return message;

        const reactions = message.reactions ?? {};
        const currentUsers = reactions[reactionKey] ?? [];
        const nextUsers = currentUsers.includes(userId)
          ? currentUsers.filter((id) => id !== userId)
          : [...currentUsers, userId];

        return {
          ...message,
          reactions: {
            ...reactions,
            [reactionKey]: nextUsers,
          },
        };
      }),
    );
  }

  async function toggleMessageReaction(messageId: string, reactionKey: ReactionKey) {
    if (isHistoryView) return;

    const reactor = isPublicDemoRoom ? currentMember : activeViewer;
    toggleReactionLocally(messageId, reactionKey, reactor.id);

    if (isPublicDemoRoom && currentRoomId) {
      try {
        const response = await fetch("/api/demo/rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "react",
            roomId: currentRoomId,
            joinCode: roomCode,
            member: currentMember,
            messageId,
            reactionKey,
          }),
        });
        const data = (await response.json()) as DemoRoomApiResponse;
        if (!response.ok || !data.room) throw new Error(data.error ?? "Demo reaction failed");
      } catch (error) {
        console.error(error);
        toggleReactionLocally(messageId, reactionKey, reactor.id);
        setRoomStatus("反应发送失败，请稍后再试。");
      }
      return;
    }

    if (isDbRoom) {
      setRoomStatus("反应已在本机显示。正式多人同步会在下一步加入数据库保存。");
    }
  }

  async function translateText(text: string, sourceLanguage: Language) {
    try {
      const response = await fetch("/api/ai/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text, sourceLanguage }),
      });

      if (!response.ok) throw new Error("Translation request failed");

      const data = (await response.json()) as {
        translations: Partial<Record<Language, string>>;
        source: "deepseek" | "mock";
      };

      setRoomStatus(data.source === "deepseek" ? "DeepSeek 翻译已生成。" : "AI 不可用，当前使用 mock 翻译。");
      return data.translations;
    } catch (error) {
      console.error(error);
      setRoomStatus("AI 翻译失败，当前使用 mock 翻译。");
      return buildMockTranslations(sourceLanguage);
    }
  }

  function stopRecordingTimer() {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }

  function stopVoiceStream() {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }

  function preferredVoiceMimeType() {
    const candidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
    return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
  }

  function voiceFileExtension(blob: Blob) {
    if (blob.type.includes("mp4")) return "mp4";
    if (blob.type.includes("ogg")) return "ogg";
    if (blob.type.includes("mpeg")) return "mp3";
    if (blob.type.includes("wav")) return "wav";
    return "webm";
  }

  function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  function isVoiceTranscriptReady(message: Message) {
    return Boolean(message.originalText.trim() && message.originalText !== "[voice message]");
  }

  async function maybeUploadVoice(blob: Blob) {
    if (!supabaseConfigured || !currentRoomId) return undefined;

    try {
      const voiceId = crypto.randomUUID();
      const filePath = `${currentRoomId}/${voiceId}.${voiceFileExtension(blob)}`;
      const { error } = await supabase.storage.from("voice-messages").upload(filePath, blob, {
        cacheControl: "3600",
        contentType: blob.type || "audio/mp4",
        upsert: false,
      });

      if (error) throw error;

      const { data } = supabase.storage.from("voice-messages").getPublicUrl(filePath);
      return data.publicUrl;
    } catch (error) {
      console.warn("Voice upload skipped", error);
      return undefined;
    }
  }

  async function transcribeVoice(blob: Blob, voiceLanguage: Language) {
    const file = new File([blob], `voice.${voiceFileExtension(blob)}`, { type: blob.type || "audio/mp4" });
    const formData = new FormData();
    formData.append("file", file);
    formData.append("language", voiceLanguage);

    const response = await fetch("/api/ai/transcribe", {
      method: "POST",
      body: formData,
    });

    const data = (await response.json()) as { text?: string; error?: string };
    if (!response.ok || !data.text) throw new Error(data.error ?? "Voice transcription failed");
    return data.text;
  }

  async function publishMessage(optimisticMessage: Message, textForTranslation: string, sender: Member) {
    if (isPublicDemoRoom && currentRoomId) {
      const saveMessage = fetch("/api/demo/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          roomId: currentRoomId,
          joinCode: roomCode,
          member: currentMember,
          message: optimisticMessage,
        }),
      })
        .then(async (response) => {
          const data = (await response.json()) as DemoRoomApiResponse;
          if (!response.ok || !data.room) throw new Error(data.error ?? "Demo message failed");
          return data.room;
        })
        .catch((error) => {
          console.error(error);
          setRoomStatus("消息已显示在本地，但远端同步失败。请稍后再试。");
          return null;
        });

      void translateText(textForTranslation, sender.language)
        .then(async (translations) => {
          const translatedMessage: Message = {
            ...optimisticMessage,
            translations,
            isPending: false,
          };

          setMessages((current) =>
            current.map((message) => (message.id === optimisticMessage.id ? translatedMessage : message)),
          );

          await saveMessage;
          await fetch("/api/demo/rooms", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "updateMessage",
              roomId: currentRoomId,
              joinCode: roomCode,
              member: currentMember,
              message: translatedMessage,
            }),
          });
        })
        .catch((error) => {
          console.error(error);
          setMessages((current) =>
            current.map((message) =>
              message.id === optimisticMessage.id ? { ...message, isPending: false } : message,
            ),
          );
          setRoomStatus("消息已发送，但翻译生成失败。");
        });

      return;
    }

    void translateText(textForTranslation, sender.language)
      .then(async (translations) => {
        const nextMessage: Message = {
          ...optimisticMessage,
          translations,
          isPending: false,
        };

        setMessages((current) => current.map((message) => (message.id === optimisticMessage.id ? nextMessage : message)));

        if (isDbRoom && currentRoomId && sessionUserId && activeViewer.id === sessionUserId) {
          const { error } = await supabase.from("messages").insert({
            id: nextMessage.id,
            room_id: currentRoomId,
            sender_id: sessionUserId,
            kind: nextMessage.kind,
            original_language: nextMessage.originalLanguage,
            original_text: nextMessage.originalText,
            translations: nextMessage.translations,
            voice_url: nextMessage.voiceUrl ?? null,
            voice_duration: nextMessage.voiceDuration ?? null,
          });

          if (error) {
            setRoomStatus(`消息已显示在本地，但数据库保存失败：${error.message}`);
            return;
          }

          setRoomStatus("消息已发送。");
        }
      })
      .catch((error) => {
        console.error(error);
        setMessages((current) =>
          current.map((message) =>
            message.id === optimisticMessage.id ? { ...message, isPending: false } : message,
          ),
        );
        setRoomStatus("消息已显示在本地，但翻译生成失败。");
      });
  }

  async function publishVoiceMessage(voiceMessage: Message) {
    if (isPublicDemoRoom && currentRoomId) {
      try {
        const response = await fetch("/api/demo/rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "send",
            roomId: currentRoomId,
            joinCode: roomCode,
            member: currentMember,
            message: voiceMessage,
          }),
        });
        const data = (await response.json()) as DemoRoomApiResponse;
        if (!response.ok || !data.room) throw new Error(data.error ?? "Demo voice message failed");
      } catch (error) {
        console.error(error);
        setRoomStatus("语音已显示在本地，但远端同步失败。请稍后再试。");
      }
      return;
    }

    if (isDbRoom && currentRoomId && sessionUserId && activeViewer.id === sessionUserId) {
      const { error } = await supabase.from("messages").insert({
        id: voiceMessage.id,
        room_id: currentRoomId,
        sender_id: sessionUserId,
        kind: "voice",
        original_language: voiceMessage.originalLanguage,
        original_text: voiceMessage.originalText,
        translations: voiceMessage.translations,
        voice_url: voiceMessage.voiceUrl ?? null,
        voice_duration: voiceMessage.voiceDuration ?? null,
      });

      if (error) {
        setRoomStatus(`语音已显示在本地，但数据库保存失败：${error.message}`);
        return;
      }

      setRoomStatus("语音消息已发送。长按或右键语音条可转文字。");
      return;
    }

    setRoomStatus("语音消息已发送。长按或右键语音条可转文字。");
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = messageText.trim();
    if (!text || recorderStateRef.current !== "idle") return;

    const sender = isPublicDemoRoom ? currentMember : activeViewer;
    const optimisticMessage: Message = {
      id: crypto.randomUUID(),
      senderId: sender.id,
      kind: "text",
      originalLanguage: sender.language,
      originalText: text,
      translations: {},
      createdAt: nowLabel(),
      isPending: true,
    };

    setMessageText("");
    setMessages((current) => [...current, optimisticMessage]);
    void publishMessage(optimisticMessage, text, sender);
  }

  async function startVoiceRecording() {
    if (recorderStateRef.current !== "idle") return;

    if (!window.isSecureContext) {
      setVoiceSupported(false);
      setRoomStatus("当前地址不允许使用麦克风。电脑请用 http://localhost:3000，手机请用 HTTPS 线上地址测试。");
      return;
    }

    if (!window.MediaRecorder || !window.navigator?.mediaDevices?.getUserMedia) {
      setVoiceSupported(false);
      setRoomStatus("当前浏览器不支持按住说话，请使用 Chrome 或 Edge。");
      return;
    }

    try {
      const stream = await window.navigator.mediaDevices.getUserMedia({ audio: true });
      const voiceMimeType = preferredVoiceMimeType();
      const recorderOptions = voiceMimeType ? { mimeType: voiceMimeType } : undefined;
      const recorder = new MediaRecorder(stream, recorderOptions);
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      // Recorder timing is driven by a browser event handler, not render.
      // eslint-disable-next-line react-hooks/purity
      recordingStartedAtRef.current = Date.now();
      setRecordingSeconds(0);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const duration = Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000));
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || voiceMimeType || "audio/mp4" });
        audioChunksRef.current = [];
        void sendVoiceBlob(blob, duration);
      };

      recorder.start();
      updateRecorderState("recording");
      setRoomStatus("正在录音，松开发送。");
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds(Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000)));
      }, 250);
    } catch (error) {
      console.error(error);
      updateRecorderState("idle");
      setVoiceSupported(false);
      stopVoiceStream();
      setRoomStatus("无法使用麦克风。请允许浏览器麦克风权限后再试。");
    }
  }

  function stopVoiceRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorderStateRef.current !== "recording" || !recorder || recorder.state === "inactive") return;
    stopRecordingTimer();
    updateRecorderState("processing");
    setRoomStatus("语音已收到，正在转文字...");
    recorder.stop();
    stopVoiceStream();
  }

  async function sendVoiceBlob(blob: Blob, duration: number) {
    const sender = isPublicDemoRoom ? currentMember : activeViewer;

    if (blob.size < 1000) {
      updateRecorderState("idle");
      setRoomStatus("录音太短，没有发送。按住说话后再松开。");
      return;
    }

    try {
      const localVoiceUrl = URL.createObjectURL(blob);
      const voiceMessage: Message = {
        id: crypto.randomUUID(),
        senderId: sender.id,
        kind: "voice",
        originalLanguage: sender.language,
        originalText: "[voice message]",
        translations: {},
        voiceUrl: localVoiceUrl,
        voiceDuration: duration,
        createdAt: nowLabel(),
        isPending: false,
      };

      updateRecorderState("idle");
      setRecordingSeconds(0);
      setMessages((current) => [...current, voiceMessage]);
      setRoomStatus("语音消息已发送。长按或右键语音条可转文字。");

      void (async () => {
        const uploadedVoiceUrl = await maybeUploadVoice(blob);
        const shareableVoiceUrl = uploadedVoiceUrl ?? (isPublicDemoRoom ? await blobToDataUrl(blob) : localVoiceUrl);
        const sharedVoiceMessage = {
          ...voiceMessage,
          voiceUrl: shareableVoiceUrl,
        };

        if (shareableVoiceUrl !== localVoiceUrl) {
          setMessages((current) =>
            current.map((message) => (message.id === voiceMessage.id ? sharedVoiceMessage : message)),
          );
        }

        await publishVoiceMessage(sharedVoiceMessage);
      })().catch((error) => {
        console.error(error);
        setRoomStatus("语音已显示在本地，但远端同步失败。请稍后再试。");
      });
    } catch (error) {
      console.error(error);
      updateRecorderState("idle");
      setRecordingSeconds(0);
      setRoomStatus(error instanceof Error ? `语音发送失败：${error.message}` : "语音发送失败，请稍后再试。");
    }
  }

  async function transcribeVoiceMessage(message: Message, targetLanguage: Language) {
    if (!message.voiceUrl) {
      setRoomStatus("这条语音没有可读取的音频，无法重新转写。");
      return message.originalText;
    }

    setActiveVoiceMenuId(null);
    setRoomStatus(`${copy.transcribeTo(languageLabels[targetLanguage])}...`);

    try {
      let transcript = isVoiceTranscriptReady(message) ? message.originalText : "";
      let translations = message.translations;

      if (!transcript) {
        const audioResponse = await fetch(message.voiceUrl);
        if (!audioResponse.ok) throw new Error("Voice file could not be loaded");

        const blob = await audioResponse.blob();
        transcript = await transcribeVoice(blob, message.originalLanguage);
        translations = await translateText(transcript, message.originalLanguage);
      } else if (targetLanguage !== message.originalLanguage && !translations[targetLanguage]) {
        translations = await translateText(transcript, message.originalLanguage);
      }

      const updatedMessage: Message = {
        ...message,
        originalText: transcript,
        translations,
        isPending: false,
      };

      setMessages((current) => current.map((item) => (item.id === message.id ? updatedMessage : item)));
      setVoiceTranscriptSelection({ messageId: message.id, language: targetLanguage });

      if (isPublicDemoRoom && currentRoomId) {
        await fetch("/api/demo/rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "updateMessage",
            roomId: currentRoomId,
            joinCode: roomCode,
            member: currentMember,
            message: updatedMessage,
          }),
        });
      }

      setRoomStatus("语音已重新转写并更新翻译。");
      return transcript;
    } catch (error) {
      console.error(error);
      setRoomStatus("重新转写失败：音频可能只保存在发送者本机，或远端语音文件不可读取。");
      return message.originalText;
    }
  }

  function voiceTranscriptText(message: Message) {
    if (!voiceTranscriptSelection || voiceTranscriptSelection.messageId !== message.id) return "";
    if (!isVoiceTranscriptReady(message)) return "";
    if (voiceTranscriptSelection.language === message.originalLanguage) return message.originalText;
    return message.translations[voiceTranscriptSelection.language] ?? message.originalText;
  }

  async function toggleVoicePlayback(message: Message) {
    if (!message.voiceUrl) {
      setRoomStatus("这条语音没有可播放的音频。");
      return;
    }

    const audio = voiceAudioRefs.current[message.id];
    if (!audio) return;

    try {
      Object.entries(voiceAudioRefs.current).forEach(([id, item]) => {
        if (id !== message.id) item?.pause();
      });

      if (audio.paused) {
        await audio.play();
        setPlayingVoiceId(message.id);
      } else {
        audio.pause();
        setPlayingVoiceId(null);
      }
    } catch (error) {
      console.error(error);
      setRoomStatus("原音频播放失败。可以长按语音条转文字查看。");
    }
  }

  function openVoiceMenu(messageId: string) {
    setActiveVoiceMenuId((current) => (current === messageId ? null : messageId));
  }

  function startVoiceLongPress(messageId: string) {
    voiceLongPressTriggeredRef.current = false;
    window.clearTimeout(voiceLongPressTimersRef.current[messageId]);
    voiceLongPressTimersRef.current[messageId] = window.setTimeout(() => {
      voiceLongPressTriggeredRef.current = true;
      setActiveVoiceMenuId(messageId);
    }, 520);
  }

  function endVoiceLongPress(message: Message) {
    window.clearTimeout(voiceLongPressTimersRef.current[message.id]);
    if (voiceLongPressTriggeredRef.current) return;
    void toggleVoicePlayback(message);
  }

  async function summarizeDiscussion() {
    setIsSummarizing(true);
    setRoomStatus("正在生成讨论总结...");

    try {
      const discussionMessages = messages.filter((message) => message.kind === "text" || message.kind === "voice");
      const response = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: discussionMessages.map((message) => ({
            senderName: members.find((member) => member.id === message.senderId)?.name ?? "AI",
            originalLanguage: message.originalLanguage,
            originalText: message.originalText,
          })),
        }),
      });

      if (!response.ok) throw new Error("Summary request failed");

      const data = (await response.json()) as {
        summary: Record<Language, string>;
        source: "deepseek" | "mock";
      };

      setPrivateAiResults((current) => [
        {
          id: crypto.randomUUID(),
          kind: "discussion_summary",
          title: copy.summarize,
          summary: data.summary,
          source: data.source,
          createdAt: nowLabel(),
        },
        ...current,
      ]);

      setRoomStatus(
        data.source === "deepseek"
          ? "讨论总结已生成，只在你的 AI 结果里可见。"
          : "讨论总结已生成（mock fallback），只在你的 AI 结果里可见。",
      );
    } catch (error) {
      console.error(error);
      setRoomStatus("讨论总结失败，请稍后再试。");
    } finally {
      setIsSummarizing(false);
    }
  }

  async function sharePrivateAiResult(result: PrivateAiResult) {
    const summaryMessage = {
      id: crypto.randomUUID(),
      senderId: "ai",
      kind: result.kind,
      originalLanguage: "zh" as const,
      originalText: result.summary.zh,
      translations: {
        ko: result.summary.ko,
        en: result.summary.en,
      },
      fileName: result.fileName,
      createdAt: nowLabel(),
    };

    try {
      if (isDbRoom && currentRoomId && sessionUserId) {
        const { error } = await supabase.from("messages").insert({
          id: summaryMessage.id,
          room_id: currentRoomId,
          sender_id: sessionUserId,
          kind: summaryMessage.kind,
          original_language: summaryMessage.originalLanguage,
          original_text: summaryMessage.originalText,
          translations: summaryMessage.translations,
        });

        if (error) {
          setRoomStatus(`AI 结果分享失败：${error.message}`);
          return;
        }

        await loadMessages(currentRoomId);
      } else if (isPublicDemoRoom && currentRoomId) {
        const response = await fetch("/api/demo/rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "send",
            roomId: currentRoomId,
            joinCode: roomCode,
            member: currentMember,
            message: summaryMessage,
          }),
        });
        const demoData = (await response.json()) as DemoRoomApiResponse;
        if (!response.ok || !demoData.room) throw new Error(demoData.error ?? "Demo summary save failed");

        setRoomMembers(demoData.room.members);
        setMessages(demoData.room.messages);
        setFiles(demoData.room.files);
      } else {
        setMessages((current) => [...current, summaryMessage]);
      }

      setRoomStatus("AI 结果已分享到房间。");
    } catch (error) {
      console.error(error);
      setRoomStatus("AI 结果分享失败，请稍后再试。");
    }
  }

  async function summarizeFile(file: File): Promise<FileSummaryApiResponse> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/ai/file-summary", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) throw new Error("File summary request failed");
    return (await response.json()) as FileSummaryApiResponse;
  }

  function summaryTextForLanguage(summary: Record<Language, string>, summaryLanguage: Language) {
    return summary[summaryLanguage] ?? summary.zh ?? summary.en ?? summary.ko;
  }

  function translationsForSummary(summary: Record<Language, string>, originalLanguage: Language) {
    return Object.fromEntries(
      (Object.entries(summary) as [Language, string][]).filter(([summaryLanguage]) => summaryLanguage !== originalLanguage),
    ) as Partial<Record<Language, string>>;
  }

  function fileCardText(fileName: string, fileLanguage: Language) {
    const text: Record<Language, string> = {
      zh: `${fileName} 已上传。你可以先查看文件卡片，需要时再生成自己的 AI 总结。`,
      ko: `${fileName} 파일이 업로드되었습니다. 먼저 파일 카드를 확인하고 필요할 때 개인 AI 요약을 만들 수 있습니다.`,
      en: `${fileName} was uploaded. You can review the file card first and generate your own AI summary when needed.`,
    };

    return {
      originalText: text[fileLanguage],
      translations: translationsForSummary(text, fileLanguage),
    };
  }

  async function fileForMessage(message: Message) {
    if (!message.attachmentId) return null;

    const localFile = localFiles[message.attachmentId];
    if (localFile) return localFile;

    if (!message.filePath) return null;

    const { data, error } = await supabase.storage.from("room-files").download(message.filePath);
    if (error || !data) {
      throw new Error(error?.message ?? "Remote file download failed");
    }

    const downloadedFile = new File([data], message.fileName ?? "uploaded-file", {
      type: message.fileType ?? data.type ?? "",
    });
    setLocalFiles((current) => ({ ...current, [message.attachmentId as string]: downloadedFile }));
    return downloadedFile;
  }

  async function summarizeUploadedFile(message: Message) {
    if (!message.attachmentId) {
      setRoomStatus("这个文件缺少可总结的引用，请重新上传后再试。");
      return;
    }

    setRoomStatus("正在读取文件并生成你的个人 AI 总结...");

    try {
      const file = await fileForMessage(message);
      if (!file) {
        setRoomStatus("这个临时演示文件只保存在上传者当前浏览器里。上传到 Storage 后可以跨设备再次总结。");
        return;
      }

      const fileSummary = await summarizeFile(file);
      const modeTitle = fileSummaryModeTitles[fileSummary.mode][activeViewer.language];
      setPrivateAiResults((current) => [
        {
          id: crypto.randomUUID(),
          kind: "file_summary",
          title: modeTitle,
          fileName: message.fileName ?? file.name,
          summary: fileSummary.summary,
          source: fileSummary.source,
          createdAt: nowLabel(),
        },
        ...current,
      ]);

      setRoomStatus(
        fileSummary.source === "deepseek"
          ? `${modeTitle}已生成，只在你的 AI 结果里可见。提取了 ${fileSummary.extractedTextLength} 个字符。`
          : `${modeTitle}已生成（mock fallback），只在你的 AI 结果里可见。`,
      );
    } catch (error) {
      console.error(error);
      setRoomStatus("AI 总结生成失败，请稍后再试。");
    }
  }

  async function previewUploadedFile(message: Message) {
    const fileName = message.fileName ?? "文件";

    setRoomStatus("正在打开文件预览...");

    try {
      const file = await fileForMessage(message);
      if (!file) {
        setFilePreview({
          fileName,
          text: "这个临时演示文件只保存在上传者当前浏览器里。上传到 Storage 后可以跨设备再次打开原文件。",
        });
        setRoomStatus("没有找到可打开的远端文件。");
        return;
      }

      if (isInlinePreviewFile(file.name, file.type)) {
        const documentUrl = URL.createObjectURL(file);
        const isImagePreview = isImagePreviewFile(file.name, file.type);
        setFilePreview({
          fileName: file.name,
          documentUrl,
          imageUrl: isImagePreview ? documentUrl : undefined,
          text: isImagePreview ? "图片原文件预览" : "PDF 原文件预览",
        });
        setRoomStatus("已打开原文件预览。");
        return;
      }

      setRoomStatus("正在提取文件文字预览...");
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/ai/file-preview", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("File preview request failed");

      const data = (await response.json()) as {
        extractedTextLength: number;
        fileName: string;
        previewText: string;
      };

      setFilePreview({
        fileName: data.fileName,
        text: data.previewText || "这个文件暂时没有可预览的文字内容。可以尝试点击 AI 总结，让系统进行更深度的识别。",
      });
      setRoomStatus(data.extractedTextLength ? "文件预览已生成。" : "没有提取到可预览文字。");
    } catch (error) {
      console.error(error);
      setFilePreview({
        fileName,
        text: "文件预览失败。请确认文件没有被删除、权限可读，也可以直接尝试 AI 总结。",
      });
      setRoomStatus("文件预览失败，请稍后再试。");
    }
  }

  async function handleFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;

    setIsUploadingFile(true);
    setRoomStatus("正在上传文件卡片...");

    const attachmentId = crypto.randomUUID();
    const { originalText, translations } = fileCardText(file.name, currentMember.language);
    const fileMessage: Message = {
      id: crypto.randomUUID(),
      senderId: currentMember.id,
      kind: "file",
      originalLanguage: currentMember.language,
      originalText,
      translations,
      attachmentId,
      fileName: file.name,
      fileType: file.type || file.name.split(".").pop() || "file",
      createdAt: nowLabel(),
    };

    setLocalFiles((current) => ({ ...current, [attachmentId]: file }));

    if (isPublicDemoRoom && currentRoomId) {
      try {
        const fileResponse = await fetch("/api/demo/rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "addFile",
            roomId: currentRoomId,
            joinCode: roomCode,
            member: currentMember,
            fileName: file.name,
          }),
        });
        if (!fileResponse.ok) throw new Error("Demo file save failed");

        const messageResponse = await fetch("/api/demo/rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "send",
            roomId: currentRoomId,
            joinCode: roomCode,
            member: currentMember,
            message: fileMessage,
          }),
        });
        const demoData = (await messageResponse.json()) as DemoRoomApiResponse;
        if (!messageResponse.ok || !demoData.room) throw new Error(demoData.error ?? "Demo file message failed");

        setRoomMembers(demoData.room.members);
        setMessages(demoData.room.messages);
        setFiles(demoData.room.files);
        setRoomStatus("文件卡片已发送到房间。需要时可以点击 AI 总结。");
      } catch (error) {
        console.error(error);
        setRoomStatus("公开测试房间文件消息保存失败，请稍后再试。");
      } finally {
        setIsUploadingFile(false);
      }
      return;
    }

    if (!isDbRoom || !currentRoomId || !sessionUserId) {
      setFiles((current) => [...current, file.name]);
      setMessages((current) => [...current, fileMessage]);
      setIsUploadingFile(false);
      setRoomStatus("文件卡片已发送。需要时可以点击 AI 总结。");
      return;
    }

    setRoomStatus("正在上传文件到 Supabase Storage...");

    const safeName = sanitizeStorageFileName(file.name);
    const filePath = `${currentRoomId}/${attachmentId}-${safeName}`;

    const { error: uploadError } = await supabase.storage.from("room-files").upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

    if (uploadError) {
      setIsUploadingFile(false);
      setRoomStatus(`文件上传失败：${uploadError.message}`);
      return;
    }

    const { error: attachmentError } = await supabase.from("attachments").insert({
      id: attachmentId,
      room_id: currentRoomId,
      uploader_id: sessionUserId,
      file_name: file.name,
      file_path: filePath,
      file_type: file.type || file.name.split(".").pop() || "file",
      summary: {},
    });

    if (attachmentError) {
      setIsUploadingFile(false);
      setRoomStatus(`文件记录失败：${attachmentError.message}`);
      return;
    }

    const { error: messageError } = await supabase.from("messages").insert({
      id: fileMessage.id,
      room_id: currentRoomId,
      sender_id: sessionUserId,
      kind: "file_summary",
      original_language: fileMessage.originalLanguage,
      original_text: fileMessage.originalText,
      translations,
      attachment_id: attachmentId,
    });

    if (messageError) {
      setIsUploadingFile(false);
      setRoomStatus(`文件消息保存失败：${messageError.message}`);
      return;
    }

    setFiles((current) => [...current, file.name]);
    await loadMessages(currentRoomId);
    setIsUploadingFile(false);
    setRoomStatus("文件卡片已上传到房间。需要时可以点击 AI 总结。");
  }

  if (stage === "auth") {
    return (
      <main className="center-shell">
        <section className="panel auth-panel">
          <div className="brand-row">
            <div className="brand-mark" aria-hidden="true" />
            <div>
              <p className="eyebrow">AI Study Room</p>
              <h1>폴리톡</h1>
            </div>
          </div>

          <div className="form-grid">
            <label>
              <span>{copy.schoolEmail}</span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label>
              <span>{copy.alphaPassword}</span>
              <input
                minLength={6}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label>
              <span>{copy.displayName}</span>
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </label>
            <div>
              <span className="field-label">{copy.myLanguage}</span>
              <div className="segmented">
                {(["zh", "ko", "en"] as Language[]).map((item) => (
                  <button
                    className={language === item ? "active" : ""}
                    key={item}
                    onClick={() => setLanguage(item)}
                    type="button"
                  >
                    {languageLabels[item]}
                  </button>
                ))}
              </div>
            </div>

            <button className="primary-action" disabled={isAuthenticating} onClick={signUpWithPassword} type="button">
              {isAuthenticating ? <Loader2 className="spin" size={18} /> : null}
              {copy.signUp}
            </button>
            <button className="secondary-action" disabled={isAuthenticating} onClick={signInWithPassword} type="button">
              {isAuthenticating ? <Loader2 className="spin" size={18} /> : null}
              {copy.signIn}
            </button>
            <button className="text-button" onClick={() => setStage("lobby")} type="button">
              {isCheckingSession ? <Loader2 className="spin" size={18} /> : null}
              {isCheckingSession ? copy.skipChecking : copy.demoWorkspace}
            </button>
            {authStatus ? <p className="status-text">{authStatus}</p> : null}
          </div>
        </section>
      </main>
    );
  }

  if (stage === "home") {
    return (
      <main className="center-shell">
        <section className="panel home-panel">
          <div className="brand-row">
            <div className="brand-mark" aria-hidden="true" />
            <div>
              <p className="eyebrow">AI Study Room</p>
              <h1>PolyTalk</h1>
            </div>
          </div>

          <section className="home-start">
            <div className="form-grid">
              <label>
                <span>{homeText.displayName}</span>
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              </label>

              <div>
                <span className="field-label">{homeText.primaryLanguage}</span>
                <div className="segmented">
                  {(["zh", "ko", "en"] as Language[]).map((item) => (
                    <button
                      className={language === item ? "active" : ""}
                      key={item}
                      onClick={() => setLanguage(item)}
                      type="button"
                    >
                      {languageLabels[item]}
                    </button>
                  ))}
                </div>
              </div>

              <button className="primary-action start-action" onClick={() => setStage("lobby")} type="button">
                <Plus size={19} />
                <span>
                  {homeText.start}
                  <small>{homeText.startSubtitle}</small>
                </span>
              </button>

              <div className="home-secondary-actions">
                <button className="text-button" onClick={() => setStage("auth")} type="button">
                  {homeText.login}
                </button>
                <button className="text-button history-trigger" onClick={() => setIsHistoryOpen(true)} type="button">
                  <History size={16} />
                  {homeText.history}
                </button>
              </div>
            </div>

            {roomStatus ? <p className="status-text">{roomStatus}</p> : null}
          </section>

          {isHistoryOpen ? (
            <div className="history-overlay" role="dialog" aria-modal="true" aria-label={homeText.history}>
              <button className="history-backdrop" onClick={() => setIsHistoryOpen(false)} type="button" />
              <section className="history-panel history-modal">
                <div className="side-title-row">
                  <div>
                    <p className="label">{homeText.history}</p>
                    <small>{homeText.historySubtitle}</small>
                  </div>
                  <button className="mini-action" onClick={() => setIsHistoryOpen(false)} type="button">
                    {homeText.close}
                  </button>
                </div>

                {historyRecords.length ? (
                  <div className="history-list">
                    {historyRecords.map((record) => (
                      <button className="history-card" key={record.id} onClick={() => openHistory(record)} type="button">
                        <strong>{record.title}</strong>
                        <span>{record.endedAt}</span>
                        <small>{homeText.historyMeta(record.messages.length, record.files.length, record.aiResults.length)}</small>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="empty-history">{homeText.historyEmpty}</p>
                )}
              </section>
            </div>
          ) : null}
        </section>
      </main>
    );
  }

  if (stage === "lobby") {
    const roomChoice = roomChoiceCopy[language];

    return (
      <main className="center-shell">
        <section className="panel lobby-panel">
          <header className="split-head">
            <div>
              <p className="eyebrow">AI Study Room</p>
              <h1>{roomChoice.title}</h1>
              <p className="lobby-subtitle">{roomChoice.subtitle}</p>
            </div>
            <button className="text-button" onClick={() => setStage("home")} type="button">
              <LogOut size={18} />
              {roomChoice.back}
            </button>
          </header>

          {roomStatus ? <p className="status-text">{roomStatus}</p> : null}

          <div className="lobby-grid">
            <article className="option-card">
              <div className="card-title">
                <Plus size={20} />
                <h2>{roomChoice.createTitle}</h2>
              </div>
              <p className="option-description">{roomChoice.createDescription}</p>
              <label>
                <span>{copy.roomName}</span>
                <input value={roomTitle} onChange={(event) => setRoomTitle(event.target.value)} />
              </label>
              <button className="primary-action" onClick={createRoom} type="button">
                {roomChoice.create}
              </button>
            </article>

            <article className="option-card">
              <div className="card-title">
                <Users size={20} />
                <h2>{roomChoice.joinTitle}</h2>
              </div>
              <p className="option-description">{roomChoice.joinDescription}</p>
              <label>
                <span>{copy.faceCode}</span>
                <input
                  inputMode="numeric"
                  maxLength={4}
                  placeholder={roomChoice.joinPlaceholder}
                  value={roomCode}
                  onChange={(event) => setRoomCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
                />
              </label>
              <button className="secondary-action" onClick={joinRoom} type="button">
                {roomChoice.join}
              </button>
            </article>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="room-shell">
      <header className="room-header">
        <div>
          <p className="eyebrow">
            {copy.seesFirst(members.length, activeViewer.name, languageLabels[activeViewer.language])}
          </p>
          <div className="room-title-line">
            <h1>{roomTitle}</h1>
            <div className="room-code-pill">
              <span>{copy.faceCode}</span>
              <strong>{roomCode}</strong>
            </div>
          </div>
          <div className="member-strip" aria-label={copy.members}>
            {members.map((member) => (
              <button
                className={member.id === activeViewer.id ? "member-dot active" : "member-dot"}
                key={member.id}
                onClick={() => setActiveViewerId(member.id)}
                type="button"
              >
                <span>{languageLabels[member.language].slice(0, 2)}</span>
                <strong>{member.name}</strong>
              </button>
            ))}
          </div>
        </div>
        <div className="room-actions">
          {isHistoryView ? (
            <button className="summary-action" onClick={() => returnHome()} type="button">
              <History size={18} />
              {copy.backHome}
            </button>
          ) : (
            <>
              <button className="summary-action" disabled={isSummarizing} onClick={summarizeDiscussion} type="button">
                {isSummarizing ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
                {isSummarizing ? copy.summarizing : copy.summarize}
              </button>
              <button className="text-button end-action" onClick={endDiscussion} type="button">
                {copy.endAndSave}
              </button>
            </>
          )}
        </div>
      </header>

      {roomStatus ? <p className="room-status">{roomStatus}</p> : null}

      <section className={filePreview || privateAiResults.length ? "room-grid has-side-panel" : "room-grid chat-only"}>
        <div className="chat-area">
          <div className="message-list">
            {messages.map((message) => {
              const sender = members.find((member) => member.id === message.senderId);
              const isMine = message.senderId === activeViewer.id;
              const isAi = message.senderId === "ai";
              const isFileCard = Boolean(message.fileName && message.attachmentId);
              const isSummaryMessage = !isFileCard && (message.kind === "file_summary" || message.kind === "discussion_summary");
              const shouldShowSummaryOriginal = isSummaryMessage && message.originalLanguage !== activeViewer.language;
              const reactorId = isPublicDemoRoom ? currentMember.id : activeViewer.id;

              return (
                <article className={`message ${isMine ? "mine" : ""} ${isAi ? "ai" : ""} ${message.kind === "voice" ? "voice-message" : ""}`} key={message.id}>
                  <p className="message-meta">
                    {isAi ? "AI" : sender?.name} · {message.createdAt}
                    {message.isPending ? ` · ${copy.translating}` : ""}
                  </p>
                  <div className="bubble">
                    {message.fileName ? (
                      <div className="file-chip">
                        <FileText size={16} />
                        {message.fileName}
                      </div>
                    ) : null}
                    {isSummaryMessage ? (
                      <>
                        <div className="message-summary-main">
                          <StructuredSummary text={mainText(message)} />
                        </div>
                        {shouldShowSummaryOriginal ? (
                          <div className="message-summary-secondary">
                            <span>{languageLabels[message.originalLanguage]} {copy.original}</span>
                            <StructuredSummary text={message.originalText} />
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {message.kind === "voice" ? (
                          <div className="voice-card">
                            {message.voiceUrl ? (
                              <audio
                                onEnded={() => setPlayingVoiceId(null)}
                                preload="metadata"
                                ref={(node) => {
                                  voiceAudioRefs.current[message.id] = node;
                                }}
                                src={message.voiceUrl}
                              />
                            ) : null}
                            <div
                              className="voice-bar-wrap"
                              style={
                                {
                                  "--voice-width": `${Math.min(300, 168 + (message.voiceDuration ?? 1) * 7)}px`,
                                } as React.CSSProperties
                              }
                            >
                              <button
                                aria-label="Voice message"
                                className="voice-bar"
                                onContextMenu={(event) => {
                                  event.preventDefault();
                                  openVoiceMenu(message.id);
                                }}
                                onPointerCancel={() => window.clearTimeout(voiceLongPressTimersRef.current[message.id])}
                                onPointerDown={() => startVoiceLongPress(message.id)}
                                onPointerLeave={() => window.clearTimeout(voiceLongPressTimersRef.current[message.id])}
                                onPointerUp={() => endVoiceLongPress(message)}
                                type="button"
                              >
                                <span className="voice-icon">
                                  {playingVoiceId === message.id ? <Pause size={15} /> : <Play size={15} />}
                                </span>
                                <strong>Voice {formatVoiceDuration(message.voiceDuration)}</strong>
                                <span className="voice-wave" aria-hidden="true">
                                  <i />
                                  <i />
                                  <i />
                                  <i />
                                </span>
                              </button>
                              <button
                                aria-label="Voice actions"
                                className="voice-more-button"
                                onClick={() => openVoiceMenu(message.id)}
                                type="button"
                              >
                                <MoreHorizontal size={16} />
                              </button>
                              {activeVoiceMenuId === message.id ? (
                                <div className="voice-menu">
                                  {(["zh", "ko", "en"] as Language[]).map((item) => (
                                    <button key={item} onClick={() => transcribeVoiceMessage(message, item)} type="button">
                                      {copy.transcribeTo(languageLabels[item])}
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            {voiceTranscriptText(message) ? (
                              <div className="voice-transcript">
                                <p className="main-text">{voiceTranscriptText(message)}</p>
                                <p className="secondary-text">
                                  {languageLabels[message.originalLanguage]} {copy.original} · {message.originalText}
                                </p>
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <>
                            <p className="main-text">{mainText(message)}</p>
                            <p className="secondary-text">{secondaryText(message)}</p>
                          </>
                        )}
                      </>
                    )}
                    {!isHistoryView && message.fileName && message.attachmentId ? (
                      <div className="file-actions">
                        <button onClick={() => previewUploadedFile(message)} type="button">
                          <Eye size={15} />
                          {fileActionLabels.preview[activeViewer.language]}
                        </button>
                        <button onClick={() => summarizeUploadedFile(message)} type="button">
                          <Sparkles size={15} />
                          {fileActionLabels.summarize[activeViewer.language]}
                        </button>
                      </div>
                    ) : null}
                    {!message.isPending && message.kind !== "voice" ? (
                      <div className="reaction-row" aria-label="Message reactions">
                        {reactionOptions.map((reaction) => {
                          const users = message.reactions?.[reaction.key] ?? [];
                          const isActive = users.includes(reactorId);

                          return (
                            <button
                              className={isActive ? "reaction-button active" : "reaction-button"}
                              disabled={isHistoryView}
                              key={reaction.key}
                              onClick={() => toggleMessageReaction(message.id, reaction.key)}
                              title={reaction.label[activeViewer.language]}
                              type="button"
                            >
                              <span>{reaction.emoji}</span>
                              {users.length ? <strong>{users.length}</strong> : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>

          {isHistoryView ? (
            <div className="history-readonly">这是已保存的历史记录，完整聊天保留为只读。</div>
          ) : (
            <form className="composer" onSubmit={sendMessage}>
              <div className="composer-bar">
                <label className="file-button" title={copy.uploadFile}>
                  {isUploadingFile ? <Loader2 className="spin" size={18} /> : <Plus size={20} />}
                  <input
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.txt,.md,.csv"
                    disabled={isUploadingFile}
                    onChange={(event) => handleFile(event.target.files)}
                    type="file"
                  />
                </label>
                <input
                  placeholder={copy.messagePlaceholder(activeViewer.name)}
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                />
                <button
                  aria-label={copy.voiceTitle}
                  className={recorderState === "recording" ? "voice-hold-button recording" : "voice-hold-button"}
                  disabled={!voiceSupported || recorderState === "processing"}
                  onContextMenu={(event) => event.preventDefault()}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    void startVoiceRecording();
                  }}
                  onPointerCancel={stopVoiceRecording}
                  onPointerLeave={stopVoiceRecording}
                  onPointerUp={stopVoiceRecording}
                  title={voiceSupported ? copy.voiceTitle : copy.voiceUnsupported}
                  type="button"
                >
                  {recorderState === "processing" ? (
                    <Loader2 className="spin" size={17} />
                  ) : (
                    <Mic size={17} />
                  )}
                  <span>
                    {recorderState === "recording"
                      ? copy.voiceRelease(recordingSeconds || 1)
                      : recorderState === "processing"
                        ? copy.voiceProcessing
                        : copy.voiceHold}
                  </span>
                </button>
                <button className="send-button" type="submit">
                  <ArrowUp size={18} />
                </button>
              </div>
            </form>
          )}
        </div>

        {filePreview || privateAiResults.length ? (
        <aside className="side-panel">
          {filePreview ? (
            <section className="private-ai-section">
              <div className="side-title-row">
                <p className="label">{copy.filePreview}</p>
                <button className="mini-action" onClick={() => setFilePreview(null)} type="button">
                  {copy.close}
                </button>
              </div>
              <article className="private-ai-card">
                <strong>{filePreview.fileName}</strong>
                {filePreview.imageUrl ? (
                  // Blob URLs from user-selected local files cannot be optimized by next/image.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="file-preview-image" src={filePreview.imageUrl} alt={filePreview.fileName} />
                ) : null}
                {filePreview.documentUrl && !filePreview.imageUrl ? (
                  <>
                    <iframe className="file-preview-document" src={filePreview.documentUrl} title={filePreview.fileName} />
                    <a className="mini-action file-open-link" href={filePreview.documentUrl} rel="noreferrer" target="_blank">
                      {copy.openOriginalFile}
                    </a>
                  </>
                ) : null}
                <p>{filePreview.text}</p>
              </article>
            </section>
          ) : null}

          {privateAiResults.length ? (
            <section className="private-ai-section">
              <p className="label">{copy.myAiResults}</p>
              <div className="private-ai-list">
                {privateAiResults.map((result) => (
                  <article className="private-ai-card" key={result.id}>
                    <div className="private-ai-head">
                      <strong>{result.fileName ? `${result.title} · ${result.fileName}` : result.title}</strong>
                      <small>{result.createdAt}</small>
                    </div>
                    <StructuredSummary text={summaryTextForLanguage(result.summary, activeViewer.language)} />
                    {!isHistoryView ? (
                      <button className="mini-action share" onClick={() => sharePrivateAiResult(result)} type="button">
                        <Send size={14} />
                        {copy.shareToRoom}
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </aside>
        ) : null}
      </section>
    </main>
  );
}



