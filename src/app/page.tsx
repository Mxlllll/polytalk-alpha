"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUp,
  FileText,
  Loader2,
  LogOut,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { buildMockTranslations } from "@/lib/ai/mock";

type Language = "zh" | "ko" | "en";
type Stage = "auth" | "lobby" | "room";

type Member = {
  id: string;
  name: string;
  email: string;
  language: Language;
};

type Message = {
  id: string;
  senderId: string;
  kind: "text" | "file_summary" | "discussion_summary";
  originalLanguage: Language;
  originalText: string;
  translations: Partial<Record<Language, string>>;
  attachmentId?: string | null;
  fileName?: string;
  createdAt: string;
  isPending?: boolean;
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
  summary: Record<Language, string>;
  source: "deepseek" | "mock";
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

const languageLabels: Record<Language, string> = {
  zh: "中文",
  ko: "한국어",
  en: "English",
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

function joinCode() {
  return `${Math.floor(100 + Math.random() * 900)} ${Math.floor(100 + Math.random() * 900)}`;
}

function normalizeJoinCode(input: string) {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return input.trim().replace(/\s+/g, " ");
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
  const [stage, setStage] = useState<Stage>("auth");
  const [email, setEmail] = useState("mina@yonsei.ac.kr");
  const [password, setPassword] = useState("polytalk123");
  const [displayName, setDisplayName] = useState("Mina");
  const [language, setLanguage] = useState<Language>("zh");
  const [authStatus, setAuthStatus] = useState("");
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [roomTitle, setRoomTitle] = useState("Media Culture 小组作业");
  const [roomCode, setRoomCode] = useState("482 913");
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [isDbRoom, setIsDbRoom] = useState(false);
  const [isPublicDemoRoom, setIsPublicDemoRoom] = useState(false);
  const [roomStatus, setRoomStatus] = useState("");
  const [roomMembers, setRoomMembers] = useState<Member[] | null>(null);
  const [demoUserId] = useState(getOrCreateDemoUserId);
  const [activeViewerId, setActiveViewerId] = useState(getOrCreateDemoUserId);
  const [messageText, setMessageText] = useState("");
  const [messages, setMessages] = useState(initialMessages);
  const [, setFiles] = useState<string[]>([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);

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
          setAuthStatus("邮箱登录成功，已进入 Alpha 工作台。");
          setStage("lobby");
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
        setStage("lobby");
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
        setStage("lobby");
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
    setStage("room");
    setMessages([]);
    setFiles([]);
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
            title: roomTitle,
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
      title: roomTitle,
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

    if (!code || code.replace(/\D/g, "").length !== 6) {
      setRoomStatus("请输入 6 位面对面口令，例如 565 339。");
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

  function mainText(message: Message) {
    if (message.originalLanguage === activeViewer.language) return message.originalText;
    return message.translations[activeViewer.language] ?? message.originalText;
  }

  function secondaryText(message: Message) {
    const sender = members.find((member) => member.id === message.senderId);
    const senderLanguage = sender?.language ?? message.originalLanguage;
    return `${languageLabels[senderLanguage]} ${copy.original} · ${message.originalText}`;
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
      const response = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: messages.map((message) => ({
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

      const summaryMessage = {
        id: crypto.randomUUID(),
        senderId: "ai",
        kind: "discussion_summary" as const,
        originalLanguage: "zh" as const,
        originalText: data.summary.zh,
        translations: {
          ko: data.summary.ko,
          en: data.summary.en,
        },
        createdAt: nowLabel(),
      };

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
          setRoomStatus(`讨论总结保存失败：${error.message}`);
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

      setRoomStatus(data.source === "deepseek" ? "讨论总结已由 DeepSeek 生成。" : "讨论总结已生成（当前使用 mock fallback）。");
    } catch (error) {
      console.error(error);
      setRoomStatus("讨论总结失败，请稍后再试。");
    } finally {
      setIsSummarizing(false);
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

  async function handleFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;

    setIsUploadingFile(true);
    setRoomStatus("正在读取文件并生成中/韩/英摘要...");

    let fileSummary: FileSummaryApiResponse;

    try {
      fileSummary = await summarizeFile(file);
    } catch (error) {
      console.error(error);
      fileSummary = {
        extractedTextLength: 0,
        source: "mock",
        summary: {
          zh: `${file.name} 已上传，但文件摘要暂时生成失败，请稍后重试。`,
          ko: `${file.name} 파일이 업로드되었지만 요약 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.`,
          en: `${file.name} was uploaded, but the file summary failed. Please try again later.`,
        },
      };
    }

    const summary = fileSummary.summary;
    const uploaderLanguage =
      members.find((member) => member.id === sessionUserId)?.language ?? activeViewer.language ?? language;
    const originalText = summaryTextForLanguage(summary, uploaderLanguage);
    const translations = translationsForSummary(summary, uploaderLanguage);

    if (isPublicDemoRoom && currentRoomId) {
      const demoFileMessage = {
        id: crypto.randomUUID(),
        senderId: currentMember.id,
        kind: "file_summary" as const,
        originalLanguage: currentMember.language,
        originalText: summaryTextForLanguage(summary, currentMember.language),
        translations: translationsForSummary(summary, currentMember.language),
        fileName: file.name,
        createdAt: nowLabel(),
      };

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
            message: demoFileMessage,
          }),
        });
        const demoData = (await messageResponse.json()) as DemoRoomApiResponse;
        if (!messageResponse.ok || !demoData.room) throw new Error(demoData.error ?? "Demo file message failed");

        setRoomMembers(demoData.room.members);
        setMessages(demoData.room.messages);
        setFiles(demoData.room.files);
        setRoomStatus(
          fileSummary.source === "deepseek"
            ? `文件摘要已生成，提取了 ${fileSummary.extractedTextLength} 个字符。`
            : "文件已加入，当前使用摘要 fallback。",
        );
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
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          senderId: currentMember.id,
          kind: "file_summary",
          originalLanguage: currentMember.language,
          originalText: summaryTextForLanguage(summary, currentMember.language),
          translations: translationsForSummary(summary, currentMember.language),
          fileName: file.name,
          createdAt: nowLabel(),
        },
      ]);
      setIsUploadingFile(false);
      setRoomStatus(
        fileSummary.source === "deepseek"
          ? `文件摘要已生成，提取了 ${fileSummary.extractedTextLength} 个字符。`
          : "文件已加入，当前使用摘要 fallback。",
      );
      return;
    }

    setRoomStatus("正在上传文件到 Supabase Storage...");

    const attachmentId = crypto.randomUUID();
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
      summary,
    });

    if (attachmentError) {
      setIsUploadingFile(false);
      setRoomStatus(`文件记录失败：${attachmentError.message}`);
      return;
    }

    const { error: messageError } = await supabase.from("messages").insert({
      id: crypto.randomUUID(),
      room_id: currentRoomId,
      sender_id: sessionUserId,
      kind: "file_summary",
      original_language: uploaderLanguage,
      original_text: originalText,
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
    setRoomStatus(
      fileSummary.source === "deepseek"
        ? `文件已上传，DeepSeek 已基于 ${fileSummary.extractedTextLength} 个字符生成摘要。`
        : "文件已上传，当前使用摘要 fallback。",
    );
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

  if (stage === "lobby") {
    return (
      <main className="center-shell">
        <section className="panel lobby-panel">
          <header className="split-head">
            <div>
              <p className="eyebrow">{copy.verifiedEmail}</p>
              <h1>{copy.lobbyTitle}</h1>
            </div>
            <button className="text-button" onClick={() => setStage("auth")} type="button">
              <LogOut size={18} />
              {copy.switchIdentity}
            </button>
          </header>

          {roomStatus ? <p className="status-text">{roomStatus}</p> : null}

          <div className="lobby-grid">
            <article className="option-card">
              <div className="card-title">
                <Plus size={20} />
                <h2>{copy.newRoom}</h2>
              </div>
              <label>
                <span>{copy.roomName}</span>
                <input value={roomTitle} onChange={(event) => setRoomTitle(event.target.value)} />
              </label>
              <button className="primary-action" onClick={createRoom} type="button">
                {copy.createRoom}
              </button>
            </article>

            <article className="option-card">
              <div className="card-title">
                <Users size={20} />
                <h2>{copy.joinRoom}</h2>
              </div>
              <label>
                <span>{copy.faceCode}</span>
                <input value={roomCode} onChange={(event) => setRoomCode(event.target.value)} />
              </label>
              <button className="secondary-action" onClick={joinRoom} type="button">
                {copy.join}
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
          <button className="summary-action" disabled={isSummarizing} onClick={summarizeDiscussion} type="button">
            {isSummarizing ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
            {isSummarizing ? copy.summarizing : copy.summarize}
          </button>
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
                    <p className="main-text">{mainText(message)}</p>
                    <p className="secondary-text">{secondaryText(message)}</p>
                  </div>
                </article>
              );
            })}
          </div>

          <form className="composer" onSubmit={sendMessage}>
            <label className="file-button" title={copy.uploadFile}>
              {isUploadingFile ? <Loader2 className="spin" size={20} /> : <Plus size={22} />}
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
              <ArrowUp size={20} />
            </button>
          </form>
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

        </aside>
      </section>
    </main>
  );
}
