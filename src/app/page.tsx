"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUp,
  Eye,
  FileText,
  History,
  Loader2,
  LogOut,
  Plus,
  Send,
  Sparkles,
  Users,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { buildMockTranslations } from "@/lib/ai/mock";

type Language = "zh" | "ko" | "en";
type Stage = "home" | "auth" | "lobby" | "room";
type FileSummaryMode = "course" | "assignment";
type ReactionKey = "got_it" | "agree" | "question" | "watching" | "thanks";
type MessageReactions = Partial<Record<ReactionKey, string[]>>;

type Member = {
  id: string;
  name: string;
  email: string;
  language: Language;
};

type Message = {
  id: string;
  senderId: string;
  kind: "text" | "file" | "file_summary" | "discussion_summary";
  originalLanguage: Language;
  originalText: string;
  translations: Partial<Record<Language, string>>;
  attachmentId?: string | null;
  fileName?: string;
  createdAt: string;
  isPending?: boolean;
  reactions?: MessageReactions;
};

type DbMessageRow = {
  id: string;
  sender_id: string;
  kind: "text" | "file_summary" | "discussion_summary";
  original_language: Language;
  original_text: string;
  translations: Partial<Record<Language, string>>;
  attachment_id?: string | null;
  attachments?: { file_name: string } | { file_name: string }[] | null;
  created_at: string;
};

type DbRoomRow = {
  id: string;
  title: string;
  join_code: string;
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

type DemoRoomApiResponse = {
  room?: {
    id: string;
    title: string;
    joinCode: string;
    members: Member[];
    messages: Message[];
    files: string[];
  };
  error?: string;
};

const reactionOptions: {
  emoji: string;
  key: ReactionKey;
  label: Record<Language, string>;
}[] = [
  { key: "got_it", emoji: "✅", label: { zh: "收到", ko: "확인", en: "Got it" } },
  { key: "agree", emoji: "👍", label: { zh: "同意", ko: "동의", en: "Agree" } },
  { key: "question", emoji: "❓", label: { zh: "有疑问", ko: "질문", en: "Question" } },
  { key: "watching", emoji: "👀", label: { zh: "在看", ko: "보고 있어요", en: "Watching" } },
  { key: "thanks", emoji: "🙏", label: { zh: "辛苦了", ko: "수고했어요", en: "Thanks" } },
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
    myLanguage: "我的主语言",
    signUp: "注册 Alpha 账号",
    signIn: "登录 Alpha 账号",
    checkingSession: "检查登录状态",
    skipChecking: "跳过检查，进入演示工作台",
    demoWorkspace: "暂时进入演示工作台",
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
    translating: "翻译中",
    messagePlaceholder: (name) => `以 ${name} 的视角输入消息`,
    members: "成员",
    viewerPreview: "视角预览",
    files: "文件",
    noFiles: "暂无文件",
    displayRule: "显示规则：大字永远是当前观看者母语，小字永远是发送者原文。",
    original: "原文",
    seesFirst: (count, name, languageName) => `${count} members · ${name} sees ${languageName} first`,
  },
  ko: {
    schoolEmail: "학교 이메일",
    alphaPassword: "Alpha 비밀번호",
    displayName: "표시 이름",
    myLanguage: "내 기본 언어",
    signUp: "Alpha 계정 만들기",
    signIn: "Alpha 계정 로그인",
    checkingSession: "로그인 상태 확인 중",
    skipChecking: "확인을 건너뛰고 데모로 이동",
    demoWorkspace: "데모 워크스페이스로 이동",
    verifiedEmail: "학교 이메일 인증됨",
    lobbyTitle: "토론방 만들기 또는 참여하기",
    switchIdentity: "계정 전환",
    newRoom: "새 토론방",
    roomName: "방 이름",
    createRoom: "토론방 만들기",
    joinRoom: "토론방 참여",
    faceCode: "대면 참여 코드",
    join: "참여",
    inviteLink: "초대 링크",
    qrCode: "QR 코드",
    summarizing: "요약 중",
    summarize: "토론 요약",
    uploadFile: "파일 업로드",
    translating: "번역 중",
    messagePlaceholder: (name) => `${name} 시점으로 메시지 입력`,
    members: "멤버",
    viewerPreview: "시점 미리보기",
    files: "파일",
    noFiles: "파일 없음",
    displayRule: "표시 규칙: 큰 글씨는 현재 보는 사람의 모국어, 작은 글씨는 보낸 사람의 원문입니다.",
    original: "원문",
    seesFirst: (count, name, languageName) => `${count}명 · ${name}님은 ${languageName}를 크게 봅니다`,
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
    summarize: "Summarize",
    uploadFile: "Upload file",
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
    primaryLanguage: "我的主语言",
    start: "开始讨论",
    startSubtitle: "下一步选择创建口令或输入口令加入",
  },
  ko: {
    close: "닫기",
    displayName: "표시 이름",
    history: "기록",
    historyEmpty: "토론을 종료하면 전체 채팅, 파일, AI 결과가 여기에 저장됩니다.",
    historyMeta: (messages, files, aiResults) => `메시지 ${messages}개 · 파일 ${files}개 · AI 결과 ${aiResults}개`,
    historySubtitle: "저장한 수업 토론 보기",
    join: "참여",
    login: "학교 이메일 로그인",
    primaryLanguage: "내 기본 언어",
    start: "토론 시작",
    startSubtitle: "다음 단계에서 코드를 만들거나 입력합니다",
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
    createDescription: "4자리 대면 코드를 만들어 친구들이 같은 방에 들어오게 합니다.",
    createTitle: "새 토론 만들기",
    join: "토론 참여",
    joinDescription: "친구가 준 4자리 코드를 입력해 같은 토론방에 참여합니다.",
    joinPlaceholder: "4자리 코드 입력",
    joinTitle: "코드가 있어요",
    subtitle: "새 토론을 만들거나 기존 코드로 참여하세요.",
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
    originalText: "오늘 회의에서 발표 순서랑 자료 정리 역할을 먼저 정하면 좋겠어요.",
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
      ko: "저는 사례 부분 정리를 맡을 수 있는데, 먼저 교수님이 요구하신 인용 형식을 확인하고 싶어요.",
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
      ko: "나중에 과제 안내문을 공유해 주면 제가 서론 초안을 작성할 수 있어요.",
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
      ko: "Mina와 제가 중국어 자료를 함께 확인하고 핵심 내용을 정리할 수 있어요.",
      en: "Mina and I can review the Chinese materials together and organize the key points.",
    },
    createdAt: "10:24",
  },
  {
    id: "m5",
    senderId: "seoah",
    kind: "text",
    originalLanguage: "ko",
    originalText: "제가 교수님 공지에서 평가 기준 부분을 다시 확인해볼게요.",
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
  const normalized = text
    .replace(/\s*(【[^】]+】)\s*/g, "\n$1\n")
    .replace(/([。.!?；;])\s*(\d+[.．、])/g, "$1\n$2")
    .trim();
  const parts = normalized.split(/(【[^】]+】)/g).map((part) => part.trim()).filter(Boolean);

  if (!parts.some((part) => part.startsWith("【"))) {
    return [{ body: normalized }];
  }

  const blocks: { heading?: string; body: string }[] = [];

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];

    if (part.startsWith("【")) {
      blocks.push({
        heading: part,
        body: (parts[index + 1] ?? "")
          .replace(/\s*(\d+[.．、])\s*/g, "\n$1 ")
          .trim(),
      });
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

function isTemporaryPublicHost() {
  if (typeof window === "undefined") return false;
  return window.location.hostname.endsWith("trycloudflare.com");
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

export default function Home() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
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
  const [messages, setMessages] = useState(initialMessages);
  const [files, setFiles] = useState<string[]>([]);
  const [localFiles, setLocalFiles] = useState<Record<string, File>>({});
  const [privateAiResults, setPrivateAiResults] = useState<PrivateAiResult[]>([]);
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>(() => loadLocalHistory(getOrCreateDemoUserId()));
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isHistoryView, setIsHistoryView] = useState(false);

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

  const ensureProfile = useCallback(
    async (userId: string, userEmail = email) => {
      if (!userId) return;

      await supabase.from("profiles").upsert({
        id: userId,
        display_name: displayName || "Mina",
        school_email: userEmail,
        preferred_language: language,
      });
    },
    [displayName, email, language, supabase],
  );

  const loadMessages = useCallback(
    async (roomId: string) => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, sender_id, kind, original_language, original_text, translations, attachment_id, attachments(file_name), created_at")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true });

      if (error) {
        setRoomStatus(`读取消息失败：${error.message}`);
        return;
      }

      setMessages(
        ((data ?? []) as DbMessageRow[]).map((row) => ({
          id: row.id,
          senderId: row.sender_id,
          kind: row.kind,
          originalLanguage: row.original_language,
          originalText: row.original_text,
          translations: row.translations,
          attachmentId: row.attachment_id,
          fileName: Array.isArray(row.attachments) ? row.attachments[0]?.file_name : row.attachments?.file_name,
          createdAt: new Date(row.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        })),
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
        body: JSON.stringify({ action: "sync", roomId, member }),
      });

      const data = (await response.json()) as DemoRoomApiResponse;
      if (!response.ok || !data.room) throw new Error(data.error ?? "Demo room sync failed");

      setCurrentRoomId(data.room.id);
      setRoomTitle(data.room.title);
      setRoomCode(data.room.joinCode);
      setRoomMembers(data.room.members);
      setMessages(data.room.messages);
      setFiles(data.room.files);
      setActiveViewerId(member.id);
      return data.room;
    },
    [currentMember],
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
                fileName: Array.isArray(row.attachments) ? row.attachments[0]?.file_name : row.attachments?.file_name,
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
      syncDemoRoom(currentRoomId).catch((error) => {
        console.error(error);
        setRoomStatus("公开测试房间同步失败，请刷新后再试。");
      });
    }, 3000);

    return () => window.clearInterval(refreshTimer);
  }, [currentRoomId, isPublicDemoRoom, syncDemoRoom]);

  useEffect(() => {
    async function initializeSession() {
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
  }, [ensureProfile, supabase]);

  async function signUpWithPassword() {
    setIsAuthenticating(true);
    setAuthStatus("");

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
        setAuthStatus(error.message);
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

      setAuthStatus("注册成功，但 Supabase 仍要求邮箱确认。我们下一步会关闭开发期邮箱确认。");
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
        setAuthStatus(error.message);
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
    const generatedTitle = `课堂讨论 ${new Date().toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}`;
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

    if (!sessionUserId || isTemporaryPublicHost()) {
      setRoomStatus("正在创建公开测试房间...");
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
        setRoomStatus("公开测试房间已创建，把面对面口令发给朋友即可加入同一个房间。");
      } catch (error) {
        console.error(error);
        setIsPublicDemoRoom(false);
        setRoomStatus("公开测试房间创建失败，请刷新后再试。");
      }
      return;
    }

    const roomId = crypto.randomUUID();
    setCurrentRoomId(roomId);
    setRoomCode(code);
    setIsPublicDemoRoom(false);
    setRoomMembers([
      {
        id: sessionUserId,
        name: displayName || "Mina",
        email,
        language,
      },
    ]);
    setIsDbRoom(true);
    setRoomStatus("正在创建 Supabase 房间...");

    const { error: roomError } = await supabase.from("rooms").insert({
      id: roomId,
      title: nextRoomTitle,
      join_code: code,
      created_by: sessionUserId,
    });

    if (roomError) {
      setRoomStatus(`创建房间失败：${roomError.message}`);
      setIsDbRoom(false);
      return;
    }

    const { error: memberError } = await supabase.from("room_members").insert({
      room_id: roomId,
      user_id: sessionUserId,
      role: "owner",
    });

    if (memberError) {
      setRoomStatus(`加入房间失败：${memberError.message}`);
      return;
    }

    setRoomStatus("Supabase 房间已创建，后续消息会写入数据库。");
    await loadRoomMembers(roomId);
  }

  async function joinRoom() {
    const code = normalizeJoinCode(roomCode);
    setRoomCode(code);

    if (!code || code.replace(/\D/g, "").length !== 4) {
      setRoomStatus("请输入 4 位面对面口令，例如 4821。");
      return;
    }

    if (!sessionUserId || isTemporaryPublicHost()) {
      setIsDbRoom(false);
      setIsPublicDemoRoom(true);
      setRoomStatus("正在查找公开测试房间...");

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
          setRoomStatus("房间不存在或口令错误，请确认后再试。");
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
        setRoomStatus("已加入公开测试房间。");
      } catch (error) {
        console.error(error);
        setIsPublicDemoRoom(false);
        setRoomStatus("加入失败，请检查网络后再试。");
      }
      return;
    }

    setIsPublicDemoRoom(false);
    setRoomStatus("正在查找 Supabase 房间...");

    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id, title, join_code")
      .eq("join_code", code)
      .maybeSingle();

    if (roomError) {
      setIsDbRoom(false);
      setRoomStatus(`查找房间失败：${roomError.message}`);
      return;
    }

    if (!room) {
      setIsDbRoom(false);
      setRoomStatus("房间不存在或口令错误，请确认后再试。");
      return;
    }

    const dbRoom = room as DbRoomRow;
    setStage("room");
    setMessages([]);
    setFiles([]);
    setRoomMembers([currentMember]);
    setActiveViewerId(currentMember.id);
    setCurrentRoomId(dbRoom.id);
    setRoomTitle(dbRoom.title);
    setRoomCode(dbRoom.join_code);
    setIsDbRoom(true);

    const { error: memberError } = await supabase.from("room_members").upsert(
      {
        room_id: dbRoom.id,
        user_id: sessionUserId,
        role: "member",
      },
      { onConflict: "room_id,user_id", ignoreDuplicates: true },
    );

    if (memberError) {
      setRoomStatus(`加入房间失败：${memberError.message}`);
      return;
    }

    await loadMessages(dbRoom.id);
    await loadRoomMembers(dbRoom.id);
    setRoomStatus("已加入 Supabase 房间。");
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
            member: currentMember,
            messageId,
            reactionKey,
          }),
        });
        const data = (await response.json()) as DemoRoomApiResponse;
        if (!response.ok || !data.room) throw new Error(data.error ?? "Demo reaction failed");

        setRoomMembers(data.room.members);
        setMessages(data.room.messages);
        setFiles(data.room.files);
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

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = messageText.trim();
    if (!text) return;

    const sender = isPublicDemoRoom ? currentMember : activeViewer;
    const optimisticMessageId = crypto.randomUUID();
    const optimisticMessage = {
      id: optimisticMessageId,
      senderId: sender.id,
      kind: "text" as const,
      originalLanguage: sender.language,
      originalText: text,
      translations: {},
      createdAt: nowLabel(),
      isPending: true,
    };

    setMessageText("");
    setMessages((current) => [...current, optimisticMessage]);
    setRoomStatus("正在生成中/韩/英翻译...");
    const translations = await translateText(text, sender.language);

    const nextMessage = {
      id: optimisticMessageId,
      senderId: sender.id,
      kind: "text" as const,
      originalLanguage: sender.language,
      originalText: text,
      translations,
      createdAt: nowLabel(),
    };

    if (isDbRoom && currentRoomId && sessionUserId && activeViewer.id === sessionUserId) {
      const { error } = await supabase.from("messages").insert({
        id: nextMessage.id,
        room_id: currentRoomId,
        sender_id: sessionUserId,
        kind: "text",
        original_language: nextMessage.originalLanguage,
        original_text: nextMessage.originalText,
        translations: nextMessage.translations,
      });

      if (error) {
        setMessages((current) => current.filter((message) => message.id !== optimisticMessageId));
        setRoomStatus(`发送失败：${error.message}`);
        return;
      }

      await loadMessages(currentRoomId);
      await loadRoomMembers(currentRoomId);
      setRoomStatus("消息已写入 Supabase。");
      return;
    }

    if (isPublicDemoRoom && currentRoomId) {
      try {
        const response = await fetch("/api/demo/rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "send",
            roomId: currentRoomId,
            member: currentMember,
            message: nextMessage,
          }),
        });
        const data = (await response.json()) as DemoRoomApiResponse;
        if (!response.ok || !data.room) throw new Error(data.error ?? "Demo message failed");

        setRoomMembers(data.room.members);
        setMessages(data.room.messages);
        setFiles(data.room.files);
        setRoomStatus("消息已发送到公开测试房间。");
        return;
      } catch (error) {
        console.error(error);
        setMessages((current) => current.filter((message) => message.id !== optimisticMessageId));
        setRoomStatus("公开测试房间消息发送失败，请稍后再试。");
        return;
      }
    }

    setMessages((current) => current.map((message) => (message.id === optimisticMessageId ? nextMessage : message)));
  }

  async function summarizeDiscussion() {
    setIsSummarizing(true);
    setRoomStatus("正在生成讨论总结...");

    try {
      const discussionMessages = messages.filter((message) => message.kind === "text");
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
          title: "讨论总结",
          summary: data.summary,
          source: data.source,
          createdAt: nowLabel(),
        },
        ...current,
      ]);

      setRoomStatus(
        data.source === "deepseek" ? "讨论总结已生成，只在你的 AI 结果里可见。" : "讨论总结已生成（mock fallback），只在你的 AI 结果里可见。",
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
      ko: `${fileName} 파일이 업로드되었습니다. 필요할 때 내 AI 요약을 생성할 수 있습니다.`,
      en: `${fileName} was uploaded. You can review the file card first and generate your own AI summary when needed.`,
    };

    return {
      originalText: text[fileLanguage],
      translations: translationsForSummary(text, fileLanguage),
    };
  }

  async function summarizeUploadedFile(message: Message) {
    if (!message.attachmentId) {
      setRoomStatus("这个文件缺少可总结的引用，请重新上传后再试。");
      return;
    }

    const file = localFiles[message.attachmentId];
    if (!file) {
      setRoomStatus("当前演示版只能总结本机刚上传的文件。房间文件留存已保留，远端文件二次总结会在下一步完善。");
      return;
    }

    setRoomStatus("正在为你分析文件并生成个人 AI 总结...");

    try {
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

    if (!message.attachmentId || !localFiles[message.attachmentId]) {
      setFilePreview({
        fileName,
        text: "文件卡片已留在房间中。当前 Alpha 可以预览本机刚上传的文件；跨设备重新打开后的远端文件预览会在下一步接入 Supabase 下载。",
      });
      return;
    }

    const file = localFiles[message.attachmentId];

    if (file.type.startsWith("image/")) {
      const imageUrl = URL.createObjectURL(file);
      setFilePreview({
        fileName: file.name,
        imageUrl,
        text: "图片预览",
      });
      return;
    }

    setRoomStatus("正在提取文件预览...");

    try {
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
        fileName: file.name,
        text: "文件预览失败。请确认文件不是加密或损坏文件，也可以直接尝试 AI 总结。",
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
            member: currentMember,
            message: fileMessage,
          }),
        });
        const demoData = (await messageResponse.json()) as DemoRoomApiResponse;
        if (!messageResponse.ok || !demoData.room) throw new Error(demoData.error ?? "Demo file message failed");

        setRoomMembers(demoData.room.members);
        setMessages(demoData.room.messages);
        setFiles(demoData.room.files);
        setRoomStatus("文件卡片已发送到房间。需要时可以点击“AI 总结”。");
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
      setRoomStatus("文件卡片已发送。需要时可以点击“AI 总结”。");
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
      setRoomStatus(`文件摘要消息失败：${messageError.message}`);
      return;
    }

    setFiles((current) => [...current, file.name]);
    await loadMessages(currentRoomId);
    setIsUploadingFile(false);
    setRoomStatus("文件卡片已上传到房间。需要时可以点击“AI 总结”。");
  }

  if (stage === "auth") {
    return (
      <main className="center-shell">
        <section className="panel auth-panel">
          <div className="brand-row">
            <div className="brand-mark">폴</div>
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
            <div className="brand-mark">폴</div>
            <div>
              <p className="eyebrow">AI Study Room</p>
              <h1>폴리톡</h1>
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
        </div>
        <div className="room-actions">
          {isHistoryView ? (
            <button className="summary-action" onClick={() => returnHome()} type="button">
              <History size={18} />
              返回首页
            </button>
          ) : (
            <>
              <button className="summary-action" disabled={isSummarizing} onClick={summarizeDiscussion} type="button">
                {isSummarizing ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
                {isSummarizing ? copy.summarizing : copy.summarize}
              </button>
              <button className="text-button end-action" onClick={endDiscussion} type="button">
                结束并保存
              </button>
            </>
          )}
        </div>
      </header>

      {roomStatus ? <p className="room-status">{roomStatus}</p> : null}

      <section className="room-grid">
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
                <article className={`message ${isMine ? "mine" : ""} ${isAi ? "ai" : ""}`} key={message.id}>
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
                        <p className="main-text">{mainText(message)}</p>
                        <p className="secondary-text">{secondaryText(message)}</p>
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
                    {!message.isPending ? (
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
                <button className="send-button" type="submit">
                  <ArrowUp size={18} />
                </button>
              </div>
            </form>
          )}
        </div>

        <aside className="side-panel">
          <section className="members-section">
            <p className="label">{copy.members}</p>
            <div className="member-list">
              {members.map((member) => (
                <button
                  className={member.id === activeViewer.id ? "member active" : "member"}
                  key={member.id}
                  onClick={() => setActiveViewerId(member.id)}
                  type="button"
                >
                  <span>{languageLabels[member.language].slice(0, 2)}</span>
                  <strong>{member.name}</strong>
                  <small>{member.email}</small>
                </button>
              ))}
            </div>
          </section>

          {filePreview ? (
            <section className="private-ai-section">
              <div className="side-title-row">
                <p className="label">文件预览</p>
                <button className="mini-action" onClick={() => setFilePreview(null)} type="button">
                  关闭
                </button>
              </div>
              <article className="private-ai-card">
                <strong>{filePreview.fileName}</strong>
                {filePreview.imageUrl ? (
                  // Blob URLs from user-selected local files cannot be optimized by next/image.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="file-preview-image" src={filePreview.imageUrl} alt={filePreview.fileName} />
                ) : null}
                <p>{filePreview.text}</p>
              </article>
            </section>
          ) : null}

          {privateAiResults.length ? (
            <section className="private-ai-section">
              <p className="label">我的 AI 结果</p>
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
                        分享到房间
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
