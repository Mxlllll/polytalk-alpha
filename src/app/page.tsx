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
  Reply,
  Send,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { buildMockTranslations } from "@/lib/ai/mock";

type Language = "zh" | "ko" | "en";
type Stage = "home" | "auth" | "lobby" | "room";
type AuthMode = "signIn" | "signUp" | "forgot" | "reset" | "change";
type FileSummaryMode = "course" | "assignment";

type RecorderState = "idle" | "recording" | "processing";
type VoiceTranscriptSelection = {
  messageId: string;
  language: Language;
};

type TypingMember = {
  id: string;
  name: string;
  language: Language;
  updatedAt: number;
};

type TypingBroadcastPayload = {
  member: TypingMember;
  isTyping: boolean;
};

type TypingChannel = {
  send: (payload: { type: "broadcast"; event: "typing"; payload: TypingBroadcastPayload }) => Promise<unknown>;
};

type Member = {
  id: string;
  name: string;
  email: string;
  language: Language;
};

type MessageQuote = {
  messageId: string;
  senderId: string;
  senderName: string;
  originalLanguage: Language;
  originalText: string;
  translations: Partial<Record<Language, string>>;
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
  quote?: MessageQuote | null;
};

type DbMessageRow = {
  id: string;
  sender_id: string;
  kind: "text" | "voice" | "file" | "file_summary" | "discussion_summary";
  original_language: Language;
  original_text: string;
  translations: Partial<Record<Language, string>>;
  attachment_id?: string | null;
  voice_url?: string | null;
  voice_duration?: number | null;
  reply_quote?: MessageQuote | null;
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
  roomId?: string | null;
  title: string;
  joinCode: string;
  endedAt: string;
  endedAtIso?: string;
  members: Member[];
  messages: Message[];
  files: string[];
  aiResults: PrivateAiResult[];
};

type DbHistoryRecordRow = {
  id: string;
  owner_id: string;
  room_id: string | null;
  title: string;
  join_code: string;
  ended_at: string;
  members: Member[];
  messages: Message[];
  files: string[];
  ai_results: PrivateAiResult[];
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

type DbRoomRow = {
  id: string;
  title: string;
  join_code: string;
  created_by: string;
};

type DemoRoomRealtimeRow = {
  id: string;
  title: string;
  join_code: string;
  members: Member[] | null;
  messages: Message[] | null;
  files: string[] | null;
};

type DemoRoomSyncError = Error & {
  status?: number;
};

const languageLabels: Record<Language, string> = {
  zh: "中文",
  ko: "한국어",
  en: "English",
};

const supportedLanguages: Language[] = ["zh", "ko", "en"];

const translationPlaceholders: Record<Language, string> = {
  zh: "正在翻译...",
  ko: "번역 중...",
  en: "Translating...",
};

const typingIndicatorCopy: Record<Language, (names: string[]) => string> = {
  zh: (names) => `${names.join("、")} 正在输入...`,
  ko: (names) => `${names.join(", ")}님이 입력 중...`,
  en: (names) => `${names.join(", ")} ${names.length > 1 ? "are" : "is"} typing...`,
};

function pendingTranslations(sourceLanguage: Language): Partial<Record<Language, string>> {
  return supportedLanguages.reduce<Partial<Record<Language, string>>>((accumulator, item) => {
    if (item !== sourceLanguage) accumulator[item] = translationPlaceholders[item];
    return accumulator;
  }, {});
}

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
    syncReconnecting: string;
    syncExpired: string;
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
    syncReconnecting: "房间同步暂时中断，正在重试...",
    syncExpired: "房间连接已失效。请返回后重新创建或加入房间。",
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
    syncReconnecting: "방 동기화가 잠시 끊겼습니다. 다시 연결을 시도 중입니다...",
    syncExpired: "방 연결이 만료되었습니다. 돌아가서 방을 다시 만들거나 참여해 주세요.",
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
    syncReconnecting: "Room sync paused. Retrying...",
    syncExpired: "Room connection expired. Go back and create or join a room again.",
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
    reply: string;
    replyingTo: (name: string) => string;
    cancelReply: string;
    seesFirst: (count: number, name: string, language: string) => string;
  }
> = {
  zh: {
    schoolEmail: "邮箱",
    alphaPassword: "Alpha 密码",
    displayName: "显示名称",
    myLanguage: "我的母语",
    signUp: "注册 Alpha 账号",
    signIn: "登录账户",
    checkingSession: "正在检查登录状态",
    verifiedEmail: "已验证邮箱",
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
    reply: "回复",
    replyingTo: (name) => `正在回复 ${name}`,
    cancelReply: "取消回复",
    seesFirst: (count, name, languageName) => `${count} 位成员 · ${name} 优先看 ${languageName}`,
  },
  ko: {
    schoolEmail: "이메일",
    alphaPassword: "Alpha 비밀번호",
    displayName: "표시 이름",
    myLanguage: "내 모국어",
    signUp: "Alpha 계정 만들기",
    signIn: "Alpha 로그인",
    checkingSession: "로그인 상태 확인 중",
    verifiedEmail: "이메일 인증 완료",
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
    reply: "답장",
    replyingTo: (name) => `${name}님에게 답장 중`,
    cancelReply: "답장 취소",
    seesFirst: (count, name, languageName) => `${count}명 · ${name}님은 ${languageName}을 먼저 봅니다`,
  },
  en: {
    schoolEmail: "Email",
    alphaPassword: "Alpha password",
    displayName: "Display name",
    myLanguage: "My primary language",
    signUp: "Create Alpha account",
    signIn: "Sign in to Alpha",
    checkingSession: "Checking session",
    verifiedEmail: "Verified email",
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
    reply: "Reply",
    replyingTo: (name) => `Replying to ${name}`,
    cancelReply: "Cancel reply",
    seesFirst: (count, name, languageName) => `${count} members · ${name} sees ${languageName} first`,
  },
};

const homeCopy: Record<
  Language,
  {
    close: string;
    deleteHistory: string;
    deleteHistoryConfirm: string;
    displayName: string;
    history: string;
    historyEmpty: string;
    historyMeta: (messages: number, files: number, aiResults: number) => string;
    historySubtitle: string;
    join: string;
    login: string;
    logout: string;
    accountLabel: string;
    primaryLanguage: string;
    start: string;
    startSubtitle: string;
  }
> = {
  zh: {
    close: "关闭",
    deleteHistory: "删除历史",
    deleteHistoryConfirm: "确定删除这条历史记录吗？这不会删除原房间里的聊天数据。",
    displayName: "显示名称",
    history: "历史记录",
    historyEmpty: "结束一次讨论后，这里会保存完整聊天、文件和 AI 结果。",
    historyMeta: (messages, files, aiResults) => `${messages} 条消息 · ${files} 个文件 · ${aiResults} 个 AI 结果`,
    historySubtitle: "查看之前保存的课堂讨论",
    join: "加入",
    login: "邮箱登录",
    logout: "退出账户",
    accountLabel: "当前账户",
    primaryLanguage: "我的母语",
    start: "开始讨论",
    startSubtitle: "下一步选择创建口令或输入口令加入",
  },
  ko: {
    close: "닫기",
    deleteHistory: "기록 삭제",
    deleteHistoryConfirm: "이 기록을 삭제할까요? 원래 방의 채팅 데이터는 삭제되지 않습니다.",
    displayName: "표시 이름",
    history: "기록",
    historyEmpty: "토론이 끝나면 전체 채팅, 파일, AI 결과가 여기에 저장됩니다.",
    historyMeta: (messages, files, aiResults) => `${messages}개 메시지 · ${files}개 파일 · ${aiResults}개 AI 결과`,
    historySubtitle: "저장된 수업 토론 보기",
    join: "참여",
    login: "이메일 로그인",
    logout: "로그아웃",
    accountLabel: "현재 계정",
    primaryLanguage: "내 모국어",
    start: "토론 시작",
    startSubtitle: "다음 단계에서 코드를 만들거나 입력해 참여합니다",
  },
  en: {
    close: "Close",
    deleteHistory: "Delete history",
    deleteHistoryConfirm: "Delete this history record? This will not delete the original room chat data.",
    displayName: "Display name",
    history: "History",
    historyEmpty: "After a discussion ends, full chat, files, and AI results will be saved here.",
    historyMeta: (messages, files, aiResults) => `${messages} messages · ${files} files · ${aiResults} AI results`,
    historySubtitle: "Review saved class discussions",
    join: "Join",
    login: "Email login",
    logout: "Sign out",
    accountLabel: "Current account",
    primaryLanguage: "My primary language",
    start: "Start discussion",
    startSubtitle: "Next, create a code or enter one to join",
  },
};

const authCopy: Record<
  Language,
  {
    changePassword: string;
    confirmPassword: string;
    confirmPasswordPlaceholder: string;
    displayNamePlaceholder: string;
    emailPlaceholder: string;
    forgotPassword: string;
    forgotSubtitle: string;
    loginTab: string;
    newPasswordPlaceholder: string;
    passwordHint: string;
    passwordPlaceholder: string;
    passwordMismatch: string;
    passwordResetSent: string;
    registerTab: string;
    resendReset: string;
    resetPassword: string;
    resetSubtitle: string;
    sendResetEmail: string;
    setNewPassword: string;
    strongPassword: string;
    updatePassword: string;
    weakPassword: string;
  }
> = {
  zh: {
    changePassword: "修改密码",
    confirmPassword: "确认新密码",
    confirmPasswordPlaceholder: "再次输入新密码",
    displayNamePlaceholder: "输入你的显示名称",
    emailPlaceholder: "输入邮箱",
    forgotPassword: "忘记密码",
    forgotSubtitle: "输入邮箱，我们会发送重置密码邮件。",
    loginTab: "登录",
    newPasswordPlaceholder: "输入新密码",
    passwordHint: "至少 8 位，建议包含大小写字母、数字和符号。",
    passwordPlaceholder: "输入密码",
    passwordMismatch: "两次输入的新密码不一致。",
    passwordResetSent: "重置邮件已发送，请打开邮箱继续操作。",
    registerTab: "注册",
    resendReset: "重新发送重置邮件",
    resetPassword: "重置密码",
    resetSubtitle: "设置一个更强的新密码后即可继续使用。",
    sendResetEmail: "发送重置邮件",
    setNewPassword: "新密码",
    strongPassword: "密码强度足够",
    updatePassword: "更新密码",
    weakPassword: "密码强度不足",
  },
  ko: {
    changePassword: "비밀번호 변경",
    confirmPassword: "새 비밀번호 확인",
    confirmPasswordPlaceholder: "새 비밀번호를 다시 입력",
    displayNamePlaceholder: "표시 이름 입력",
    emailPlaceholder: "이메일 입력",
    forgotPassword: "비밀번호 찾기",
    forgotSubtitle: "이메일을 입력하면 재설정 메일을 보내드립니다.",
    loginTab: "로그인",
    newPasswordPlaceholder: "새 비밀번호 입력",
    passwordHint: "8자 이상, 대문자/소문자/숫자/기호 조합을 권장합니다.",
    passwordPlaceholder: "비밀번호 입력",
    passwordMismatch: "새 비밀번호가 서로 일치하지 않습니다.",
    passwordResetSent: "재설정 메일을 보냈습니다. 이메일을 확인해 주세요.",
    registerTab: "가입",
    resendReset: "재설정 메일 다시 보내기",
    resetPassword: "비밀번호 재설정",
    resetSubtitle: "더 안전한 새 비밀번호를 설정한 뒤 계속 사용할 수 있습니다.",
    sendResetEmail: "재설정 메일 보내기",
    setNewPassword: "새 비밀번호",
    strongPassword: "비밀번호 강도 충분",
    updatePassword: "비밀번호 업데이트",
    weakPassword: "비밀번호 강도 부족",
  },
  en: {
    changePassword: "Change password",
    confirmPassword: "Confirm new password",
    confirmPasswordPlaceholder: "Enter new password again",
    displayNamePlaceholder: "Enter your display name",
    emailPlaceholder: "Enter email",
    forgotPassword: "Forgot password",
    forgotSubtitle: "Enter your email and we will send a reset link.",
    loginTab: "Sign in",
    newPasswordPlaceholder: "Enter new password",
    passwordHint: "Use 8+ characters with a mix of cases, numbers, and symbols.",
    passwordPlaceholder: "Enter password",
    passwordMismatch: "The new passwords do not match.",
    passwordResetSent: "Password reset email sent. Please check your inbox.",
    registerTab: "Create account",
    resendReset: "Send reset email again",
    resetPassword: "Reset password",
    resetSubtitle: "Set a stronger new password to continue.",
    sendResetEmail: "Send reset email",
    setNewPassword: "New password",
    strongPassword: "Password is strong enough",
    updatePassword: "Update password",
    weakPassword: "Password is too weak",
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
    create: "创建房间",
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
    create: "방 만들기",
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
    create: "Create room",
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

function validateEmail(value: string) {
  const normalizedEmail = normalizeEmail(value);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return "请输入有效的邮箱地址。";
  }

  return "";
}

function validateAuthFields(email: string, password: string, displayName?: string) {
  const emailMessage = validateEmail(email);
  if (emailMessage) return emailMessage;

  if (password.length < 6) {
    return "密码至少需要 6 位。";
  }

  if (displayName !== undefined && !displayName.trim()) {
    return "请输入显示名称。";
  }

  return "";
}

function passwordStrength(password: string) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;

  return {
    score,
    isStrongEnough: score >= 4,
  };
}

function validateStrongPassword(password: string) {
  if (!passwordStrength(password).isStrongEnough) {
    return "密码至少 8 位，并包含大小写字母、数字或符号中的多种组合。";
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

function formatHistoryEndedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function historyRecordFromDbRow(row: DbHistoryRecordRow): HistoryRecord {
  return {
    id: row.id,
    roomId: row.room_id,
    title: row.title,
    joinCode: row.join_code,
    endedAt: formatHistoryEndedAt(row.ended_at),
    endedAtIso: row.ended_at,
    members: row.members ?? [],
    messages: row.messages ?? [],
    files: row.files ?? [],
    aiResults: row.ai_results ?? [],
  };
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

function messageFromDbRow(row: DbMessageRow): Message {
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
    quote: row.reply_quote ?? null,
    createdAt: new Date(row.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  };
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
    JSON.stringify(left.quote ?? null) === JSON.stringify(right.quote ?? null)
  );
}

function shouldKeepLocalMessage(localMessage: Message, incomingMessage: Message) {
  const localHasRealTranslation = supportedLanguages.some(
    (item) =>
      item !== localMessage.originalLanguage &&
      Boolean(localMessage.translations[item]) &&
      localMessage.translations[item] !== translationPlaceholders[item],
  );
  const incomingHasRealTranslation = supportedLanguages.some(
    (item) =>
      item !== incomingMessage.originalLanguage &&
      Boolean(incomingMessage.translations[item]) &&
      incomingMessage.translations[item] !== translationPlaceholders[item],
  );

  return Boolean(localMessage.isPending) === false && localHasRealTranslation && !incomingHasRealTranslation;
}

export default function Home() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const supabaseConfigured = useMemo(() => isSupabaseConfigured(), []);
  const [stage, setStage] = useState<Stage>("auth");
  const [authMode, setAuthMode] = useState<AuthMode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [language, setLanguage] = useState<Language>("zh");
  const [authStatus, setAuthStatus] = useState("");
  const [, setIsCheckingSession] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [loginFailureCount, setLoginFailureCount] = useState(0);
  const [loginCooldownUntil, setLoginCooldownUntil] = useState(0);
  const [authClock, setAuthClock] = useState(0);
  const [roomTitle, setRoomTitle] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [isDbRoom, setIsDbRoom] = useState(false);
  const [isPublicDemoRoom, setIsPublicDemoRoom] = useState(false);
  const [roomStatus, setRoomStatus] = useState("");
  const [isRoomConnectionLost, setIsRoomConnectionLost] = useState(false);
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
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>(() => loadLocalHistory(getOrCreateDemoUserId()));
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isHistoryView, setIsHistoryView] = useState(false);
  const [isSavingHistory, setIsSavingHistory] = useState(false);
  const [roomDialog, setRoomDialog] = useState<"create" | "join" | null>(null);
  const [replyQuote, setReplyQuote] = useState<MessageQuote | null>(null);
  const [activeVoiceMenuId, setActiveVoiceMenuId] = useState<string | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [voiceTranscriptSelection, setVoiceTranscriptSelection] = useState<VoiceTranscriptSelection | null>(null);
  const [typingMembers, setTypingMembers] = useState<Record<string, TypingMember>>({});
  const memberCountRef = useRef(0);
  const demoSyncInFlightRef = useRef(false);
  const demoSyncFailureCountRef = useRef(0);
  const typingChannelRef = useRef<TypingChannel | null>(null);
  const typingStateRef = useRef(false);
  const typingStopTimerRef = useRef<number | null>(null);
  const messageTextRef = useRef("");
  const translationQueueRef = useRef<Promise<void>>(Promise.resolve());

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
  const authText = authCopy[language];
  const historyOwnerId = sessionUserId ?? demoUserId;
  const currentPasswordStrength = passwordStrength(password);
  const loginCooldownRemaining = Math.max(0, Math.ceil((loginCooldownUntil - authClock) / 1000));

  const currentMember = useMemo<Member>(
    () => ({
      id: sessionUserId ?? demoUserId,
      name: displayName || "Mina",
      email,
      language,
    }),
    [demoUserId, displayName, email, language, sessionUserId],
  );

  const activeTypingMembers = useMemo(
    () =>
      Object.values(typingMembers).filter((member) => member.id !== currentMember.id),
    [currentMember.id, typingMembers],
  );
  const composerDisabled = isRoomConnectionLost || recorderState === "processing";
  const roomConnectionText = roomStatusCopy[activeViewer.language];

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
      if (typingStopTimerRef.current) window.clearTimeout(typingStopTimerRef.current);
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!loginCooldownUntil) return;

    const timer = window.setInterval(() => {
      setAuthClock(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [loginCooldownUntil]);

  useEffect(() => {
    if (!authStatus) return;

    const timer = window.setTimeout(() => {
      setAuthStatus("");
    }, 4200);

    return () => window.clearTimeout(timer);
  }, [authStatus]);

  const ensureProfile = useCallback(
    async (userId: string, userEmail = email) => {
      if (!userId || !supabaseConfigured) return;

      const { error } = await supabase.from("profiles").upsert({
        id: userId,
        display_name: displayName || "Mina",
        school_email: userEmail,
        preferred_language: language,
      });

      if (error) throw new Error(`Profile sync failed: ${error.message}`);
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
          if (shouldKeepLocalMessage(message, incomingMessage)) return message;
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
      const selectMessages = (includeQuote: boolean) =>
        supabase
          .from("messages")
          .select(
            includeQuote
              ? "id, sender_id, kind, original_language, original_text, translations, attachment_id, voice_url, voice_duration, reply_quote, attachments(file_name, file_path, file_type), created_at"
              : "id, sender_id, kind, original_language, original_text, translations, attachment_id, voice_url, voice_duration, attachments(file_name, file_path, file_type), created_at",
          )
          .eq("room_id", roomId)
          .order("created_at", { ascending: true });

      let { data, error } = await selectMessages(true);

      if (error && /reply_quote|column/i.test(error.message)) {
        const fallback = await selectMessages(false);
        data = fallback.data;
        error = fallback.error;
      }

      if (error) {
        setRoomStatus(`读取消息失败：${error.message}`);
        return;
      }

      setMessages(((data ?? []) as unknown as DbMessageRow[]).map(messageFromDbRow));
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

  const loadDbHistory = useCallback(
    async (ownerId: string) => {
      if (!ownerId) return;

      if (!supabaseConfigured) {
        setHistoryRecords(loadLocalHistory(ownerId));
        return;
      }

      const { data, error } = await supabase
        .from("history_records")
        .select("id, owner_id, room_id, title, join_code, ended_at, members, messages, files, ai_results")
        .eq("owner_id", ownerId)
        .order("ended_at", { ascending: false })
        .limit(20);

      if (error) {
        console.error(error);
        setHistoryRecords(loadLocalHistory(ownerId));
        setRoomStatus(`读取历史记录失败：${error.message}`);
        return;
      }

      const records = ((data ?? []) as DbHistoryRecordRow[]).map(historyRecordFromDbRow);
      setHistoryRecords(records);
      saveLocalHistory(ownerId, records);
    },
    [supabase, supabaseConfigured],
  );

  const saveDbHistory = useCallback(
    async (record: HistoryRecord, ownerId: string) => {
      if (!supabaseConfigured || !ownerId) return false;

      const { error } = await supabase.from("history_records").upsert(
        {
          id: record.id,
          owner_id: ownerId,
          room_id: record.roomId ?? null,
          title: record.title,
          join_code: record.joinCode,
          ended_at: record.endedAtIso ?? new Date().toISOString(),
          members: record.members,
          messages: record.messages,
          files: record.files,
          ai_results: record.aiResults,
        },
        { onConflict: "id" },
      );

      if (error) throw new Error(error.message);
      return true;
    },
    [supabase, supabaseConfigured],
  );

  const deleteDbHistory = useCallback(
    async (recordId: string, ownerId: string) => {
      if (!supabaseConfigured || !ownerId) return false;

      const { error } = await supabase.from("history_records").delete().eq("id", recordId).eq("owner_id", ownerId);

      if (error) throw new Error(error.message);
      return true;
    },
    [supabase, supabaseConfigured],
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
      if (!response.ok || !data.room) {
        const error = new Error(data.error ?? "Demo room sync failed") as DemoRoomSyncError;
        error.status = response.status;
        throw error;
      }

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
          event: "*",
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

          const nextMessage = messageFromDbRow(row);
          setMessages((current) => {
            const existingIndex = current.findIndex((message) => message.id === row.id);
            if (existingIndex === -1) return [...current, nextMessage];

            const nextMessages = [...current];
            nextMessages[existingIndex] = {
              ...current[existingIndex],
              ...nextMessage,
              isPending: false,
            };
            return nextMessages;
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
    if (!isPublicDemoRoom || !currentRoomId || isRoomConnectionLost) return;
    const statusText = roomStatusCopy[activeViewer.language];

    const refreshTimer = window.setInterval(() => {
      if (demoSyncInFlightRef.current || document.visibilityState === "hidden") return;

      demoSyncInFlightRef.current = true;
      syncDemoRoom(currentRoomId)
        .then(() => {
          demoSyncFailureCountRef.current = 0;
          setIsRoomConnectionLost(false);
          setRoomStatus((current) =>
            current === "公开测试房间同步失败，请刷新后再试。" ||
            Object.values(roomStatusCopy).some(
              (item) => item.syncReconnecting === current || item.syncExpired === current,
            )
              ? ""
              : current,
          );
        })
        .catch((error) => {
          console.error(error);
          demoSyncFailureCountRef.current += 1;
          const syncError = error as DemoRoomSyncError;
          if (syncError.status === 404 && demoSyncFailureCountRef.current >= 3) {
            setIsRoomConnectionLost(true);
            setIsPublicDemoRoom(false);
            setRoomStatus(statusText.syncExpired);
            return;
          }
          if (demoSyncFailureCountRef.current >= 3) {
            setRoomStatus(statusText.syncReconnecting);
          }
        })
        .finally(() => {
          demoSyncInFlightRef.current = false;
        });
    }, 1600);

    return () => window.clearInterval(refreshTimer);
  }, [activeViewer.language, currentRoomId, isPublicDemoRoom, isRoomConnectionLost, syncDemoRoom]);

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
    if (!isPublicDemoRoom || !currentRoomId || !supabaseConfigured) return;

    const channel = supabase
      .channel(`demo-room-typing-${currentRoomId}`, {
        config: {
          broadcast: {
            self: false,
          },
        },
      })
      .on("broadcast", { event: "typing" }, (event) => {
        const payload = event.payload as TypingBroadcastPayload;
        if (!payload?.member || payload.member.id === currentMember.id) return;

        setTypingMembers((current) => {
          const next = { ...current };
          if (payload.isTyping) {
            next[payload.member.id] = { ...payload.member, updatedAt: Date.now() };
          } else {
            delete next[payload.member.id];
          }
          return next;
        });
      })
      .subscribe();

    typingChannelRef.current = channel as unknown as TypingChannel;

    return () => {
      typingChannelRef.current = null;
      setTypingMembers({});
      supabase.removeChannel(channel);
    };
  }, [currentMember.id, currentRoomId, isPublicDemoRoom, supabase, supabaseConfigured]);

  useEffect(() => {
    if (activeTypingMembers.length === 0) return;

    const timer = window.setInterval(() => {
      setTypingMembers((current) => {
        const now = Date.now();
        const next = Object.fromEntries(
          Object.entries(current).filter(([, member]) => now - member.updatedAt < 3500),
        ) as Record<string, TypingMember>;
        return Object.keys(next).length === Object.keys(current).length ? current : next;
      });
    }, 1200);

    return () => window.clearInterval(timer);
  }, [activeTypingMembers.length]);

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
          setHistoryRecords(loadLocalHistory(localAccount.id));
          setAuthStatus("演示账号已登录，可以继续使用。");
          setStage("home");
        } else {
          setAuthStatus("当前未配置 Supabase，注册/登录将使用本机演示账号。");
        }

        setIsCheckingSession(false);
        return;
      }

      try {
        const code = new URLSearchParams(window.location.search).get("code");
        const searchType = new URLSearchParams(window.location.search).get("type");
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const hashType = hashParams.get("type");
        const isRecoveryFlow = searchType === "recovery" || hashType === "recovery";
        const recoveryAccessToken = hashParams.get("access_token");
        const recoveryRefreshToken = hashParams.get("refresh_token");

        if (isRecoveryFlow && recoveryAccessToken && recoveryRefreshToken) {
          const { error } = await withTimeout(
            supabase.auth.setSession({
              access_token: recoveryAccessToken,
              refresh_token: recoveryRefreshToken,
            }),
            6000,
            "Recovery session",
          );
          window.history.replaceState({}, document.title, window.location.pathname);

          if (error) {
            setAuthMode("forgot");
            setAuthStatus("重置链接已失效，请重新发送重置邮件。");
            setStage("auth");
            return;
          }
        }

        if (code) {
          const { error } = await withTimeout(supabase.auth.exchangeCodeForSession(code), 6000, "Email confirmation");
          window.history.replaceState({}, document.title, window.location.pathname);

          if (error) {
            setAuthStatus(`登录确认失败：${error.message}`);
            return;
          }

          if (isRecoveryFlow) {
            setAuthMode("reset");
            setPassword("");
            setConfirmPassword("");
            setAuthStatus("邮箱已确认，请设置一个新的安全密码。");
            setStage("auth");
            return;
          }
        }

        const { data } = await withTimeout(supabase.auth.getSession(), 5000, "Session check");
        const sessionEmail = data.session?.user.email;

        if (sessionEmail) {
          const userId = data.session?.user.id ?? "";
          setSessionUserId(userId || null);
          setActiveViewerId(userId || "current-user");
          setEmail(sessionEmail);

          if (isRecoveryFlow) {
            window.history.replaceState({}, document.title, window.location.pathname);
            setAuthMode("reset");
            setPassword("");
            setConfirmPassword("");
            setAuthStatus("邮箱已确认，请设置一个新的安全密码。");
            setStage("auth");
            return;
          }

          await withTimeout(ensureProfile(userId, sessionEmail), 5000, "Profile sync");
          await withTimeout(loadDbHistory(userId), 6000, "History sync");
          setAuthStatus("邮箱登录成功，可以直接开始讨论。");
          setAuthMode("signIn");
          setStage("home");
        } else if (isRecoveryFlow) {
          window.history.replaceState({}, document.title, window.location.pathname);
          setAuthMode("forgot");
          setAuthStatus("重置链接已失效，请重新发送重置邮件。");
          setStage("auth");
        }
      } catch (error) {
        console.error(error);
        setAuthStatus("登录状态检查超时，请稍后重试或重新登录。");
      } finally {
        setIsCheckingSession(false);
      }
    }

    initializeSession();
  }, [ensureProfile, loadDbHistory, supabase, supabaseConfigured]);

  function setAuthModeSafely(nextMode: AuthMode) {
    setAuthMode(nextMode);
    setAuthStatus("");
    setConfirmPassword("");
    if (nextMode === "forgot") setPassword("");
  }

  function openSignIn() {
    setAuthMode("signIn");
    setPassword("");
    setConfirmPassword("");
    setAuthStatus("");
    setStage("auth");
  }

  function registerLoginFailure() {
    const nextFailureCount = loginFailureCount + 1;
    setLoginFailureCount(nextFailureCount);

    if (nextFailureCount >= 5) {
      const now = Date.now();
      setAuthClock(now);
      setLoginCooldownUntil(now + 60_000);
    }
  }

  async function signUpWithPassword() {
    setIsAuthenticating(true);
    setAuthStatus("");
    const validationMessage = validateAuthFields(email, password, displayName);

    if (validationMessage) {
      setAuthStatus(validationMessage);
      setIsAuthenticating(false);
      return;
    }

    const strengthMessage = validateStrongPassword(password);
    if (strengthMessage) {
      setAuthStatus(strengthMessage);
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
      setHistoryRecords(loadLocalHistory(account.id));
      setAuthStatus("演示账号注册成功，已进入工作台。");
      setStage("home");
      setIsAuthenticating(false);
      return;
    }

    try {
      const { data, error } = await withTimeout(
        supabase.auth.signUp({
          email: normalizeEmail(email),
          password,
          options: {
            emailRedirectTo: window.location.origin,
          },
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
        await withTimeout(loadDbHistory(data.session.user.id), 6000, "History sync");
        setAuthStatus("注册成功，已进入 Alpha 工作台。");
        setLoginFailureCount(0);
        setLoginCooldownUntil(0);
        setStage("home");
        return;
      }

      setAuthStatus("注册成功。请打开邮箱点击确认链接，完成验证后再登录。");
    } catch (error) {
      console.error(error);
      setAuthStatus("注册请求超时，请稍后重试。");
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function signInWithPassword() {
    setIsAuthenticating(true);
    setAuthStatus("");

    if (loginCooldownRemaining > 0) {
      setAuthStatus(`登录尝试过于频繁，请 ${loginCooldownRemaining} 秒后再试。`);
      setIsAuthenticating(false);
      return;
    }

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
        registerLoginFailure();
        setIsAuthenticating(false);
        return;
      }

      window.localStorage.setItem("polytalk-alpha-local-session", account.id);
      setSessionUserId(account.id);
      setActiveViewerId(account.id);
      setEmail(account.email);
      setDisplayName(account.displayName);
      setLanguage(account.language);
      setHistoryRecords(loadLocalHistory(account.id));
      setAuthStatus("演示账号登录成功，已进入工作台。");
      setLoginFailureCount(0);
      setLoginCooldownUntil(0);
      setStage("home");
      setIsAuthenticating(false);
      return;
    }

    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: normalizeEmail(email),
          password,
        }),
        12000,
        "Sign in",
      );

      if (error) {
        setAuthStatus(authErrorMessage(error.message));
        registerLoginFailure();
        return;
      }

      if (data.session) {
        setSessionUserId(data.session.user.id);
        setActiveViewerId(data.session.user.id);
        await withTimeout(ensureProfile(data.session.user.id, data.session.user.email ?? email), 6000, "Profile sync");
        await withTimeout(loadDbHistory(data.session.user.id), 6000, "History sync");
        setAuthStatus("登录成功，已进入 Alpha 工作台。");
        setLoginFailureCount(0);
        setLoginCooldownUntil(0);
        setStage("home");
      }
    } catch (error) {
      console.error(error);
      setAuthStatus("登录请求超时，请稍后重试。");
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function sendPasswordResetEmail() {
    setIsAuthenticating(true);
    setAuthStatus("");

    const emailMessage = validateEmail(email);
    if (emailMessage) {
      setAuthStatus(emailMessage);
      setIsAuthenticating(false);
      return;
    }

    if (!supabaseConfigured) {
      setAuthStatus("演示账号不支持邮件重置密码，请使用 Supabase 账号测试。");
      setIsAuthenticating(false);
      return;
    }

    try {
      const { error } = await withTimeout(
        supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
          redirectTo: window.location.origin,
        }),
        12000,
        "Password reset",
      );

      if (error) {
        setAuthStatus(authErrorMessage(error.message));
        return;
      }

      setAuthStatus(authText.passwordResetSent);
    } catch (error) {
      console.error(error);
      setAuthStatus("重置邮件发送超时，请稍后再试。");
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function updateAccountPassword() {
    setIsAuthenticating(true);
    setAuthStatus("");

    const strengthMessage = validateStrongPassword(password);
    if (strengthMessage) {
      setAuthStatus(strengthMessage);
      setIsAuthenticating(false);
      return;
    }

    if (password !== confirmPassword) {
      setAuthStatus(authText.passwordMismatch);
      setIsAuthenticating(false);
      return;
    }

    if (!supabaseConfigured) {
      const normalizedEmail = normalizeEmail(email);
      const nextAccounts = loadLocalAlphaAccounts().map((account) =>
        account.email === normalizedEmail ? { ...account, password } : account,
      );
      saveLocalAlphaAccounts(nextAccounts);
      setAuthStatus("演示账号密码已更新。");
      setAuthMode("signIn");
      setIsAuthenticating(false);
      return;
    }

    try {
      const { data: sessionData } = await withTimeout(supabase.auth.getSession(), 5000, "Password session");

      if (!sessionData.session) {
        setAuthMode("forgot");
        setPassword("");
        setConfirmPassword("");
        setAuthStatus("重置密码链接已失效或登录状态不存在，请重新发送重置邮件。");
        return;
      }

      const { error } = await withTimeout(supabase.auth.updateUser({ password }), 12000, "Password update");

      if (error) {
        setAuthStatus(authErrorMessage(error.message));
        return;
      }

      setPassword("");
      setConfirmPassword("");
      setAuthMode("signIn");
      setAuthStatus("密码已更新。之后请使用新密码登录。");

      if (sessionUserId) {
        setStage("home");
      }
    } catch (error) {
      console.error(error);
      setAuthStatus("密码更新超时，请稍后再试。");
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function createRoom() {
    const statusText = roomStatusCopy[language];
    const dateLabel = new Date().toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
    const generatedTitle = uiCopy[language].defaultRoomTitle(dateLabel);
    const nextRoomTitle = roomTitle.trim() || generatedTitle;

    function prepareRoomState() {
      setRoomTitle(nextRoomTitle);
      setIsHistoryView(false);
      setMessages([]);
      setFiles([]);
      setPrivateAiResults([]);
      setFilePreview(null);
      setIsAiPanelOpen(false);
      setRoomMembers([currentMember]);
      setActiveViewerId(currentMember.id);
    }

    setIsRoomConnectionLost(false);
    demoSyncFailureCountRef.current = 0;

    if (supabaseConfigured && sessionUserId) {
      setRoomStatus(statusText.creatingDb);
      setIsDbRoom(false);
      setIsPublicDemoRoom(false);

      try {
        await ensureProfile(sessionUserId);

        let room: DbRoomRow | null = null;
        let roomErrorMessage = "";

        for (let attempt = 0; attempt < 8; attempt += 1) {
          const { data, error } = await supabase
            .from("rooms")
            .insert({
              title: nextRoomTitle,
              join_code: joinCode(),
              created_by: sessionUserId,
            })
            .select("id, title, join_code, created_by")
            .single<DbRoomRow>();

          if (!error && data) {
            room = data;
            roomErrorMessage = "";
            break;
          }

          roomErrorMessage = error?.message ?? "Room create failed";
          if (!error?.message.toLowerCase().includes("duplicate")) break;
        }

        if (!room) throw new Error(roomErrorMessage || "Room create failed");

        const { error: memberError } = await supabase.from("room_members").insert({
          room_id: room.id,
          user_id: sessionUserId,
          role: "owner",
        });

        if (memberError) throw new Error(memberError.message);

        prepareRoomState();
        setStage("room");
        setCurrentRoomId(room.id);
        setRoomTitle(room.title);
        setRoomCode(room.join_code);
        setIsDbRoom(true);
        setIsPublicDemoRoom(false);
        setRoomStatus(statusText.createdDb);
        setRoomDialog(null);
        return;
      } catch (error) {
        console.error(error);
        setRoomStatus(error instanceof Error ? `创建房间失败：${error.message}` : statusText.createPublicFailed);
        return;
      }
    }

    prepareRoomState();
    setStage("room");
    const code = joinCode();
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
      setRoomDialog(null);
    } catch (error) {
      console.error(error);
      setIsPublicDemoRoom(false);
      setRoomStatus(statusText.createPublicFailed);
      return;
    }
  }

  async function signOutAccount() {
    if (supabaseConfigured) {
      await supabase.auth.signOut();
    } else {
      window.localStorage.removeItem("polytalk-alpha-local-session");
    }

    setSessionUserId(null);
    setActiveViewerId(demoUserId);
    setIsDbRoom(false);
    setIsPublicDemoRoom(false);
    setIsRoomConnectionLost(false);
    setCurrentRoomId(null);
    setRoomMembers(null);
    setMessages(initialMessages);
    setFiles([]);
    setPrivateAiResults([]);
    setHistoryRecords([]);
    setIsHistoryOpen(false);
    setFilePreview(null);
    setIsAiPanelOpen(false);
    setStage("auth");
    setAuthMode("signIn");
    setPassword("");
    setConfirmPassword("");
    setAuthStatus("已退出账户。");
    setRoomStatus("");
  }

  async function joinRoom() {
    const statusText = roomStatusCopy[language];
    const code = normalizeJoinCode(roomCode);
    setRoomCode(code);
    setIsRoomConnectionLost(false);
    demoSyncFailureCountRef.current = 0;

    if (!code || code.replace(/\D/g, "").length !== 4) {
      setRoomStatus("请输入 4 位面对面口令，例如 4821。");
      return;
    }

    if (supabaseConfigured && sessionUserId) {
      setIsDbRoom(false);
      setIsPublicDemoRoom(false);
      setRoomStatus(statusText.findingDb);

      try {
        await ensureProfile(sessionUserId);

        const { data: room, error: roomError } = await supabase
          .from("rooms")
          .select("id, title, join_code, created_by")
          .eq("join_code", code)
          .maybeSingle<DbRoomRow>();

        if (roomError) throw new Error(roomError.message);
        if (!room) {
          setRoomStatus(statusText.roomNotFound);
          return;
        }

        const { error: memberError } = await supabase.from("room_members").insert({
          room_id: room.id,
          user_id: sessionUserId,
          role: "member",
        });

        if (memberError && !memberError.message.toLowerCase().includes("duplicate")) {
          throw new Error(memberError.message);
        }

        setStage("room");
        setIsHistoryView(false);
        setCurrentRoomId(room.id);
        setRoomTitle(room.title);
        setRoomCode(room.join_code);
        setMessages([]);
        setFiles([]);
        setPrivateAiResults([]);
        setFilePreview(null);
        setIsAiPanelOpen(false);
        setActiveViewerId(currentMember.id);
        setIsDbRoom(true);
        setIsPublicDemoRoom(false);
        await loadRoomMembers(room.id);
        await loadMessages(room.id);
        setRoomStatus(statusText.joinedDb);
        setRoomDialog(null);
        return;
      } catch (error) {
        console.error(error);
        setRoomStatus(error instanceof Error ? `加入房间失败：${error.message}` : statusText.joinFailed);
        return;
      }
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
      setRoomDialog(null);
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
    setIsRoomConnectionLost(false);
    setCurrentRoomId(record.id);
    setRoomTitle(record.title);
    setRoomCode(record.joinCode);
    setRoomMembers(record.members);
    setMessages(record.messages);
    setFiles(record.files);
    setPrivateAiResults(record.aiResults);
    setFilePreview(null);
    setIsAiPanelOpen(Boolean(record.aiResults.length));
    setActiveViewerId(currentMember.id);
    setRoomStatus(`正在查看 ${record.endedAt} 保存的历史记录。`);
  }

  function returnHome(status = "") {
    setStage("home");
    setIsHistoryView(false);
    setIsDbRoom(false);
    setIsPublicDemoRoom(false);
    setIsRoomConnectionLost(false);
    demoSyncFailureCountRef.current = 0;
    setCurrentRoomId(null);
    setRoomMembers(null);
    setFilePreview(null);
    setIsAiPanelOpen(false);
    setRoomStatus(status);
  }

  async function endDiscussion() {
    if (isSavingHistory) return;

    setIsSavingHistory(true);
    const endedAtIso = new Date().toISOString();
    const record: HistoryRecord = {
      id: crypto.randomUUID(),
      roomId: isDbRoom ? currentRoomId : null,
      title: roomTitle || "未命名讨论",
      joinCode: roomCode,
      endedAt: formatHistoryEndedAt(endedAtIso),
      endedAtIso,
      members,
      messages,
      files,
      aiResults: privateAiResults,
    };

    const nextRecords = [
      record,
      ...historyRecords.filter((item) => (record.roomId ? item.roomId !== record.roomId : item.id !== record.id)),
    ].slice(0, 20);
    setHistoryRecords(nextRecords);
    saveLocalHistory(historyOwnerId, nextRecords);

    try {
      await saveDbHistory(record, historyOwnerId);
      returnHome("讨论已结束，完整聊天和 AI 结果已保存到历史记录。");
    } catch (error) {
      console.error(error);
      returnHome("讨论已保存到本机历史记录，但同步到数据库失败，请稍后重试。");
    } finally {
      setIsSavingHistory(false);
    }
  }

  async function deleteHistoryRecord(record: HistoryRecord) {
    if (!window.confirm(homeText.deleteHistoryConfirm)) return;

    const nextRecords = historyRecords.filter((item) => item.id !== record.id);
    setHistoryRecords(nextRecords);
    saveLocalHistory(historyOwnerId, nextRecords);

    try {
      await deleteDbHistory(record.id, historyOwnerId);
      setRoomStatus("");
    } catch (error) {
      console.error(error);
      setRoomStatus("历史记录已从当前页面删除，但数据库同步删除失败，请稍后重试。");
    }
  }

  function mainText(message: Message) {
    if (message.originalLanguage === activeViewer.language) return message.originalText;
    return message.translations[activeViewer.language] ?? translationPlaceholders[activeViewer.language];
  }

  function secondaryText(message: Message) {
    const sender = members.find((member) => member.id === message.senderId);
    const senderLanguage = sender?.language ?? message.originalLanguage;
    return `${languageLabels[senderLanguage]} ${copy.original} · ${message.originalText}`;
  }

  function quoteText(quote: MessageQuote) {
    if (quote.originalLanguage === activeViewer.language) return quote.originalText;
    return quote.translations[activeViewer.language] ?? quote.originalText;
  }

  function createQuote(message: Message, sender?: Member): MessageQuote {
    return {
      messageId: message.id,
      senderId: message.senderId,
      senderName: message.senderId === "ai" ? "AI" : sender?.name ?? "Unknown",
      originalLanguage: message.originalLanguage,
      originalText: message.originalText,
      translations: message.translations,
    };
  }

  function replyToMessage(message: Message, sender?: Member) {
    if (isHistoryView || message.isPending) return;
    setReplyQuote(createQuote(message, sender));
  }

  async function insertDbMessage(payload: Record<string, unknown>) {
    const { error } = await supabase.from("messages").insert(payload);
    if (error && "reply_quote" in payload && /reply_quote|column|schema cache/i.test(error.message)) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.reply_quote;
      return supabase.from("messages").insert(fallbackPayload);
    }

    return { error };
  }

  function formatVoiceDuration(seconds?: number) {
    if (!seconds) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = String(seconds % 60).padStart(2, "0");
    return `${minutes}:${remainingSeconds}`;
  }

  async function translateText(text: string, sourceLanguage: Language, options: { silent?: boolean } = {}) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch("/api/ai/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text, sourceLanguage }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error("Translation request failed");

      const data = (await response.json()) as {
        translations: Partial<Record<Language, string>>;
        source: "deepseek" | "mock";
      };

      if (!options.silent) {
        setRoomStatus(data.source === "deepseek" ? "DeepSeek 翻译已生成。" : "AI 不可用，当前使用 mock 翻译。");
      }
      return data.translations;
    } catch (error) {
      console.error(error);
      if (!options.silent) {
        setRoomStatus("AI 翻译失败，当前使用 mock 翻译。");
      }
      return buildMockTranslations(sourceLanguage);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function enqueueTranslation(work: () => Promise<void>) {
    const nextWork = translationQueueRef.current.catch(() => undefined).then(work);
    translationQueueRef.current = nextWork.catch(() => undefined);
    void nextWork;
  }

  function broadcastTyping(isTyping: boolean) {
    if (typingStateRef.current === isTyping && isTyping) return;
    typingStateRef.current = isTyping;
    void typingChannelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: {
        isTyping,
        member: {
          id: currentMember.id,
          name: currentMember.name,
          language: currentMember.language,
          updatedAt: Date.now(),
        },
      },
    });
  }

  function stopTypingSoon() {
    if (typingStopTimerRef.current) window.clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = window.setTimeout(() => {
      broadcastTyping(false);
    }, 1400);
  }

  function handleMessageTextChange(nextText: string) {
    if (isRoomConnectionLost) {
      setRoomStatus(roomConnectionText.syncExpired);
      return;
    }

    messageTextRef.current = nextText;
    setMessageText(nextText);

    if (!nextText.trim() || stage !== "room" || isHistoryView) {
      broadcastTyping(false);
      return;
    }

    broadcastTyping(true);
    stopTypingSoon();
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

      enqueueTranslation(async () => {
        try {
          const translations = await translateText(textForTranslation, sender.language, { silent: true });
          const translatedMessage: Message = {
            ...optimisticMessage,
            translations,
            isPending: false,
          };

          setMessages((current) =>
            current.map((message) => (message.id === optimisticMessage.id ? translatedMessage : message)),
          );

          await saveMessage;
          if (currentRoomId) {
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
          }
        } catch (error) {
          console.error(error);
          setMessages((current) =>
            current.map((message) =>
              message.id === optimisticMessage.id ? { ...message, isPending: false } : message,
            ),
          );
          setRoomStatus("消息已发送，但翻译生成失败。");
        }
      });

      return;
    }

    if (isDbRoom && currentRoomId && sessionUserId && activeViewer.id === sessionUserId) {
      const { error } = await insertDbMessage({
        id: optimisticMessage.id,
        room_id: currentRoomId,
        sender_id: sessionUserId,
        kind: optimisticMessage.kind,
        original_language: optimisticMessage.originalLanguage,
        original_text: optimisticMessage.originalText,
        translations: optimisticMessage.translations,
        voice_url: optimisticMessage.voiceUrl ?? null,
        voice_duration: optimisticMessage.voiceDuration ?? null,
        reply_quote: optimisticMessage.quote ?? null,
      });

      if (error) {
        setRoomStatus(`消息已显示在本地，但数据库保存失败：${error.message}`);
        return;
      }
    }

    enqueueTranslation(async () => {
      try {
        const translations = await translateText(textForTranslation, sender.language, { silent: true });
        const nextMessage: Message = {
          ...optimisticMessage,
          translations,
          isPending: false,
        };

        setMessages((current) => current.map((message) => (message.id === optimisticMessage.id ? nextMessage : message)));

        if (isDbRoom && currentRoomId && sessionUserId && activeViewer.id === sessionUserId) {
          const { error } = await supabase
            .from("messages")
            .update({
              translations: nextMessage.translations,
            })
            .eq("id", nextMessage.id);

          if (error) {
            setRoomStatus(`消息已显示在本地，但翻译保存失败：${error.message}`);
            return;
          }
        }
      } catch (error) {
        console.error(error);
        setMessages((current) =>
          current.map((message) =>
            message.id === optimisticMessage.id ? { ...message, isPending: false } : message,
          ),
        );
        setRoomStatus("消息已显示在本地，但翻译生成失败。");
      }
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
      const { error } = await insertDbMessage({
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
    if (isRoomConnectionLost) {
      setRoomStatus(roomConnectionText.syncExpired);
      return;
    }
    if (!text || recorderStateRef.current !== "idle") return;

    const sender = isPublicDemoRoom ? currentMember : activeViewer;
    const firstPassTranslations = pendingTranslations(sender.language);
    const quote = replyQuote;
    const optimisticMessage: Message = {
      id: crypto.randomUUID(),
      senderId: sender.id,
      kind: "text",
      originalLanguage: sender.language,
      originalText: text,
      translations: firstPassTranslations,
      createdAt: nowLabel(),
      isPending: true,
      quote,
    };

    setMessageText("");
    setReplyQuote(null);
    messageTextRef.current = "";
    broadcastTyping(false);
    setMessages((current) => [...current, optimisticMessage]);
    void publishMessage(optimisticMessage, text, sender);
  }

  async function startVoiceRecording() {
    if (isRoomConnectionLost) {
      setRoomStatus(roomConnectionText.syncExpired);
      return;
    }

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
    if (isRoomConnectionLost) {
      updateRecorderState("idle");
      setRecordingSeconds(0);
      setRoomStatus(roomConnectionText.syncExpired);
      return;
    }

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

      if (isDbRoom && currentRoomId && sessionUserId && message.senderId === sessionUserId) {
        const { error } = await supabase
          .from("messages")
          .update({
            original_text: updatedMessage.originalText,
            translations: updatedMessage.translations,
          })
          .eq("id", updatedMessage.id);

        if (error) {
          setRoomStatus(`语音已在本机转写，但保存到数据库失败：${error.message}`);
          return transcript;
        }
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
    if (isRoomConnectionLost) {
      setRoomStatus(roomConnectionText.syncExpired);
      return;
    }

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
      setIsAiPanelOpen(true);

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
      setIsAiPanelOpen(true);

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
    if (isRoomConnectionLost) {
      setRoomStatus(roomConnectionText.syncExpired);
      return;
    }

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
    const isPasswordManagementMode = authMode === "reset" || authMode === "change";
    const showPasswordField = authMode !== "forgot";
    const showPasswordStrength = authMode === "signUp" || isPasswordManagementMode;
    const primaryAuthAction =
      authMode === "signIn"
        ? signInWithPassword
        : authMode === "signUp"
          ? signUpWithPassword
          : authMode === "forgot"
            ? sendPasswordResetEmail
            : updateAccountPassword;
    const primaryAuthLabel =
      authMode === "signIn"
        ? copy.signIn
        : authMode === "signUp"
          ? copy.signUp
          : authMode === "forgot"
            ? authText.sendResetEmail
            : authText.updatePassword;

    return (
      <main className="center-shell">
        <section className="panel auth-panel">
          <div className="auth-top">
            <div className="brand-row auth-brand">
              <div className="brand-mark" aria-hidden="true" />
              <div>
                <h1>폴리톡</h1>
              </div>
            </div>
            <label className="language-menu">
              <span>Language</span>
              <select
                aria-label="Language"
                value={language}
                onChange={(event) => setLanguage(event.target.value as Language)}
              >
                {supportedLanguages.map((item) => (
                  <option key={item} value={item}>
                    {languageLabels[item]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="form-grid">
            {authMode === "signIn" || authMode === "signUp" ? (
              <div className="auth-tabs">
                {(["signIn", "signUp"] as AuthMode[]).map((item) => (
                  <button
                    className={authMode === item ? "active" : ""}
                    key={item}
                    onClick={() => setAuthModeSafely(item)}
                    type="button"
                  >
                    {item === "signIn" ? authText.loginTab : authText.registerTab}
                  </button>
                ))}
              </div>
            ) : null}

            {authMode === "forgot" ? <p className="auth-helper">{authText.forgotSubtitle}</p> : null}
            {authMode === "reset" ? <p className="auth-helper">{authText.resetSubtitle}</p> : null}

            {!isPasswordManagementMode ? (
              <label>
                <span>{copy.schoolEmail}</span>
                <input
                  autoComplete="email"
                  placeholder={authText.emailPlaceholder}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
            ) : null}

            {showPasswordField ? (
              <label>
                <span>{isPasswordManagementMode ? authText.setNewPassword : copy.alphaPassword}</span>
                <input
                  autoComplete={isPasswordManagementMode ? "new-password" : "current-password"}
                  minLength={authMode === "signUp" || isPasswordManagementMode ? 8 : 6}
                  placeholder={isPasswordManagementMode ? authText.newPasswordPlaceholder : authText.passwordPlaceholder}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
            ) : null}

            {showPasswordStrength ? (
              <div className="password-strength" aria-live="polite">
                <div className="password-meter">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <span className={index < currentPasswordStrength.score ? "active" : ""} key={index} />
                  ))}
                </div>
                <small>
                  {currentPasswordStrength.isStrongEnough ? authText.strongPassword : authText.weakPassword} ·{" "}
                  {authText.passwordHint}
                </small>
              </div>
            ) : null}

            {isPasswordManagementMode ? (
              <label>
                <span>{authText.confirmPassword}</span>
                <input
                  autoComplete="new-password"
                  minLength={8}
                  placeholder={authText.confirmPasswordPlaceholder}
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </label>
            ) : null}

            {authMode === "signUp" ? (
              <>
                <label>
                  <span>{copy.displayName}</span>
                  <input
                    autoComplete="name"
                    placeholder={authText.displayNamePlaceholder}
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                  />
                </label>
              </>
            ) : null}

            <button
              className="primary-action"
              disabled={isAuthenticating || (authMode === "signIn" && loginCooldownRemaining > 0)}
              onClick={primaryAuthAction}
              type="button"
            >
              {isAuthenticating ? <Loader2 className="spin" size={18} /> : null}
              {primaryAuthLabel}
            </button>

            <div className="auth-actions">
              {authMode === "signIn" ? (
                <button className="text-button" onClick={() => setAuthModeSafely("forgot")} type="button">
                  {authText.forgotPassword}
                </button>
              ) : null}
              {authMode === "forgot" ? (
                <button className="text-button" onClick={() => setAuthModeSafely("signIn")} type="button">
                  {authText.loginTab}
                </button>
              ) : null}
              {authMode === "reset" ? (
                <button className="text-button" onClick={() => setAuthModeSafely("forgot")} type="button">
                  {authText.resendReset}
                </button>
              ) : null}
              {authMode === "change" ? (
                <button className="text-button" onClick={() => setStage("home")} type="button">
                  {homeText.close}
                </button>
              ) : null}
            </div>

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
              <h1>PolyTalk</h1>
            </div>
          </div>

          <section className="home-start">
            <div className="form-grid">
              <label>
                <span>{homeText.displayName}</span>
                <input
                  autoComplete="name"
                  placeholder={authText.displayNamePlaceholder}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
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
                <span>{homeText.start}</span>
              </button>

              <div className="home-secondary-actions">
                {sessionUserId ? (
                  <div className="account-pill">
                    <span>{homeText.accountLabel}</span>
                    <strong>{email}</strong>
                  </div>
                ) : (
                  <button className="text-button" onClick={openSignIn} type="button">
                    {homeText.login}
                  </button>
                )}
                <button className="text-button history-trigger" onClick={() => setIsHistoryOpen(true)} type="button">
                  <History size={16} />
                  {homeText.history}
                </button>
                {sessionUserId ? (
                  <button
                    className="text-button"
                    onClick={() => {
                      setPassword("");
                      setConfirmPassword("");
                      setAuthModeSafely("change");
                      setStage("auth");
                    }}
                    type="button"
                  >
                    {authText.changePassword}
                  </button>
                ) : null}
                {sessionUserId ? (
                  <button className="text-button" onClick={signOutAccount} type="button">
                    {homeText.logout}
                  </button>
                ) : null}
              </div>
            </div>

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
                      <article className="history-card" key={record.id}>
                        <button className="history-card-main" onClick={() => openHistory(record)} type="button">
                          <strong>{record.title}</strong>
                          <span>{record.endedAt}</span>
                          <small>{homeText.historyMeta(record.messages.length, record.files.length, record.aiResults.length)}</small>
                        </button>
                        <button
                          aria-label={homeText.deleteHistory}
                          className="history-delete-button"
                          onClick={() => {
                            void deleteHistoryRecord(record);
                          }}
                          title={homeText.deleteHistory}
                          type="button"
                        >
                          <Trash2 size={15} />
                        </button>
                      </article>
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
              <button className="primary-action" onClick={() => setRoomDialog("create")} type="button">
                {roomChoice.create}
              </button>
            </article>

            <article className="option-card">
              <div className="card-title">
                <Users size={20} />
                <h2>{roomChoice.joinTitle}</h2>
              </div>
              <p className="option-description">{roomChoice.joinDescription}</p>
              <button className="secondary-action" onClick={() => setRoomDialog("join")} type="button">
                {roomChoice.join}
              </button>
            </article>
          </div>

          {roomDialog ? (
            <div className="history-overlay" role="dialog" aria-modal="true" aria-label={roomDialog === "create" ? roomChoice.createTitle : roomChoice.joinTitle}>
              <button className="history-backdrop" onClick={() => setRoomDialog(null)} type="button" />
              <section className="history-panel history-modal room-form-modal">
                <div className="side-title-row">
                  <div>
                    <p className="label">{roomDialog === "create" ? roomChoice.createTitle : roomChoice.joinTitle}</p>
                    <small>{roomDialog === "create" ? roomChoice.createDescription : roomChoice.joinDescription}</small>
                  </div>
                  <button className="mini-action" onClick={() => setRoomDialog(null)} type="button">
                    {homeText.close}
                  </button>
                </div>

                <div className="form-grid">
                  {roomDialog === "create" ? (
                    <>
                      <label>
                        <span>{copy.roomName}</span>
                        <input value={roomTitle} onChange={(event) => setRoomTitle(event.target.value)} />
                      </label>
                      <button className="primary-action" onClick={createRoom} type="button">
                        {roomChoice.create}
                      </button>
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>
              </section>
            </div>
          ) : null}
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
              <button className="summary-action" disabled={isSummarizing || isRoomConnectionLost} onClick={summarizeDiscussion} type="button">
                {isSummarizing ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
                {isSummarizing ? copy.summarizing : copy.summarize}
              </button>
              {privateAiResults.length ? (
                <button className="summary-action" onClick={() => setIsAiPanelOpen(true)} type="button">
                  <Sparkles size={18} />
                  {copy.myAiResults}
                </button>
              ) : null}
              <button className="text-button end-action" disabled={isSavingHistory} onClick={endDiscussion} type="button">
                {isSavingHistory ? <Loader2 className="spin" size={17} /> : null}
                {copy.endAndSave}
              </button>
            </>
          )}
        </div>
      </header>

      {roomStatus ? (
        <div className={isRoomConnectionLost ? "room-status lost" : "room-status"}>
          <span>{roomStatus}</span>
          {isRoomConnectionLost ? (
            <button onClick={() => returnHome()} type="button">
              {copy.backHome}
            </button>
          ) : null}
        </div>
      ) : null}

      <section className={filePreview ? "room-grid has-side-panel" : "room-grid chat-only"}>
        <div className="chat-area">
          <div className="message-list">
            {messages.map((message) => {
              const sender = members.find((member) => member.id === message.senderId);
              const isMine = message.senderId === activeViewer.id;
              const isAi = message.senderId === "ai";
              const isFileCard = Boolean(message.fileName && message.attachmentId);
              const isSummaryMessage = !isFileCard && (message.kind === "file_summary" || message.kind === "discussion_summary");
              const shouldShowSummaryOriginal = isSummaryMessage && message.originalLanguage !== activeViewer.language;

              return (
                <article className={`message ${isMine ? "mine" : ""} ${isAi ? "ai" : ""} ${message.kind === "voice" ? "voice-message" : ""}`} key={message.id}>
                  <div className="message-meta">
                    <span>
                      {isAi ? "AI" : sender?.name} · {message.createdAt}
                      {message.isPending ? ` · ${copy.translating}` : ""}
                    </span>
                    {!isHistoryView && !message.isPending ? (
                      <button
                        aria-label={copy.reply}
                        className="message-reply-button"
                        onClick={() => replyToMessage(message, sender)}
                        title={copy.reply}
                        type="button"
                      >
                        <Reply size={13} />
                        {copy.reply}
                      </button>
                    ) : null}
                  </div>
                  <div className="bubble">
                    {message.quote ? (
                      <div className="quote-preview">
                        <strong>{message.quote.senderName}</strong>
                        <span>{quoteText(message.quote)}</span>
                      </div>
                    ) : null}
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
                                    <button
                                      key={item}
                                      onClick={() => {
                                        setActiveVoiceMenuId(null);
                                        void transcribeVoiceMessage(message, item);
                                      }}
                                      type="button"
                                    >
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
                  </div>
                </article>
              );
            })}
          </div>

          {isHistoryView ? (
            <div className="history-readonly">这是已保存的历史记录，完整聊天保留为只读。</div>
          ) : (
            <form className="composer" onSubmit={sendMessage}>
              {activeTypingMembers.length ? (
                <p className="typing-indicator">
                  {typingIndicatorCopy[activeViewer.language](activeTypingMembers.map((member) => member.name))}
                </p>
              ) : null}
              {replyQuote ? (
                <div className="reply-composer-preview">
                  <Reply size={15} />
                  <div>
                    <strong>{copy.replyingTo(replyQuote.senderName)}</strong>
                    <span>{quoteText(replyQuote)}</span>
                  </div>
                  <button aria-label={copy.cancelReply} onClick={() => setReplyQuote(null)} title={copy.cancelReply} type="button">
                    <X size={15} />
                  </button>
                </div>
              ) : null}
              <div className="composer-bar">
                <label className={composerDisabled || isUploadingFile ? "file-button disabled" : "file-button"} title={copy.uploadFile}>
                  {isUploadingFile ? <Loader2 className="spin" size={18} /> : <Plus size={20} />}
                  <input
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.txt,.md,.csv"
                    disabled={composerDisabled || isUploadingFile}
                    onChange={(event) => handleFile(event.target.files)}
                    type="file"
                  />
                </label>
                <input
                  disabled={composerDisabled}
                  placeholder={isRoomConnectionLost ? roomConnectionText.syncExpired : copy.messagePlaceholder(activeViewer.name)}
                  value={messageText}
                  onChange={(event) => handleMessageTextChange(event.target.value)}
                />
                <button
                  aria-label={copy.voiceTitle}
                  className={recorderState === "recording" ? "voice-hold-button recording" : "voice-hold-button"}
                  disabled={!voiceSupported || composerDisabled}
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
                <button className="send-button" disabled={composerDisabled || !messageText.trim()} type="submit">
                  <ArrowUp size={18} />
                </button>
              </div>
            </form>
          )}
        </div>

        {filePreview ? (
        <aside className="side-panel">
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
        </aside>
        ) : null}
      </section>

      {isAiPanelOpen ? (
        <div className="history-overlay" role="dialog" aria-modal="true" aria-label={copy.myAiResults}>
          <button className="history-backdrop" onClick={() => setIsAiPanelOpen(false)} type="button" />
          <section className="history-panel history-modal ai-results-modal">
            <div className="side-title-row">
              <div>
                <p className="label">{copy.myAiResults}</p>
                <small>{privateAiResults.length ? `${privateAiResults.length}` : "0"}</small>
              </div>
              <button className="mini-action" onClick={() => setIsAiPanelOpen(false)} type="button">
                {copy.close}
              </button>
            </div>

            {privateAiResults.length ? (
              <div className="private-ai-list ai-results-list">
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
            ) : (
              <p className="empty-history">{copy.myAiResults}</p>
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}



