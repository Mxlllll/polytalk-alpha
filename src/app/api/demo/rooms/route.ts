import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cleanText, isSupportedLanguage, safeFileName } from "@/lib/ai/validation";

type Language = "zh" | "ko" | "en";

type DemoMember = {
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

type DemoMessage = {
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

type DemoRoom = {
  id: string;
  title: string;
  joinCode: string;
  members: DemoMember[];
  messages: DemoMessage[];
  files: string[];
  createdAt: number;
  updatedAt: number;
};

type DemoStore = {
  rooms: Map<string, DemoRoom>;
};

type DemoRoomRecord = {
  id: string;
  title: string;
  join_code: string;
  members: DemoMember[] | null;
  messages: DemoMessage[] | null;
  files: string[] | null;
  created_at?: string;
  updated_at?: string;
};

const globalStore = globalThis as typeof globalThis & {
  __polytalkDemoStore?: DemoStore;
};

const store =
  globalStore.__polytalkDemoStore ??
  (globalStore.__polytalkDemoStore = {
    rooms: new Map<string, DemoRoom>(),
  });

function createDemoSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function normalizeJoinCode(input = "") {
  const digits = input.replace(/\D/g, "");
  if (digits.length >= 4) return digits.slice(0, 4);
  return input.trim().replace(/\s+/g, " ");
}

function upsertMember(room: DemoRoom, member: DemoMember) {
  const existingIndex = room.members.findIndex((item) => item.id === member.id);
  if (existingIndex >= 0) {
    room.members[existingIndex] = member;
    return;
  }

  room.members.push(member);
}

function serializeRoom(room: DemoRoom, options?: { memberCount?: number; messageCount?: number; fileCount?: number }) {
  const memberCount = Math.max(0, options?.memberCount ?? 0);
  const messageCount = Math.max(0, options?.messageCount ?? 0);
  const fileCount = Math.max(0, options?.fileCount ?? 0);
  const messageStart = options ? Math.max(0, messageCount - 20) : 0;

  return {
    id: room.id,
    title: room.title,
    joinCode: room.joinCode,
    members: room.members.slice(memberCount),
    messages: room.messages.slice(messageStart),
    files: room.files.slice(fileCount),
    memberCount: room.members.length,
    messageCount: room.messages.length,
    fileCount: room.files.length,
    updatedAt: room.updatedAt,
  };
}

function roomFromRecord(record: DemoRoomRecord): DemoRoom {
  return {
    id: record.id,
    title: record.title,
    joinCode: normalizeJoinCode(record.join_code),
    members: record.members ?? [],
    messages: record.messages ?? [],
    files: record.files ?? [],
    createdAt: record.created_at ? new Date(record.created_at).getTime() : Date.now(),
    updatedAt: record.updated_at ? new Date(record.updated_at).getTime() : Date.now(),
  };
}

async function findPersistentRoom(body: DemoRoomRequestBody) {
  const supabase = createDemoSupabaseClient();
  if (!supabase) return null;

  if (body.roomId) {
    const { data, error } = await supabase.from("demo_rooms").select("*").eq("id", body.roomId).maybeSingle<DemoRoomRecord>();
    if (error) throw error;
    if (data) return roomFromRecord(data);
  }

  if (!body.joinCode) return null;
  const { data, error } = await supabase
    .from("demo_rooms")
    .select("*")
    .eq("join_code", normalizeJoinCode(body.joinCode))
    .maybeSingle<DemoRoomRecord>();
  if (error) throw error;
  return data ? roomFromRecord(data) : null;
}

function rememberRoom(room: DemoRoom) {
  store.rooms.set(room.id, room);
}

async function savePersistentRoom(room: DemoRoom) {
  const supabase = createDemoSupabaseClient();
  if (!supabase) return false;

  const { error } = await supabase.from("demo_rooms").upsert({
    id: room.id,
    title: room.title,
    join_code: normalizeJoinCode(room.joinCode),
    members: room.members,
    messages: room.messages,
    files: room.files,
    updated_at: new Date(room.updatedAt).toISOString(),
  });

  if (error) throw error;
  return true;
}

function findMemoryRoom(body: DemoRoomRequestBody) {
  const roomById = body.roomId ? store.rooms.get(body.roomId) : undefined;
  if (roomById) return roomById;
  return [...store.rooms.values()].find((item) => normalizeJoinCode(item.joinCode) === normalizeJoinCode(body.joinCode));
}

type DemoRoomRequestBody = {
  action: "create" | "join" | "sync" | "send" | "updateMessage" | "addFile";
  title?: string;
  joinCode?: string;
  roomId?: string;
  member?: DemoMember;
  message?: DemoMessage;
  messageId?: string;
  fileName?: string;
  memberCount?: number;
  messageCount?: number;
  fileCount?: number;
};

const actions = ["create", "join", "sync", "send", "updateMessage", "addFile"] as const;
const messageKinds = ["text", "voice", "file", "file_summary", "discussion_summary"] as const;
const MAX_MEMBERS = 20;
const MAX_MESSAGES = 500;
const MAX_FILES = 100;
const MAX_MESSAGE_TEXT = 2500;
const MAX_VOICE_URL_CHARS = 1_200_000;

function isDemoAction(value: unknown): value is DemoRoomRequestBody["action"] {
  return typeof value === "string" && actions.includes(value as DemoRoomRequestBody["action"]);
}

function isMessageKind(value: unknown): value is DemoMessage["kind"] {
  return typeof value === "string" && messageKinds.includes(value as DemoMessage["kind"]);
}

function normalizeMember(value: unknown): DemoMember | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<DemoMember>;
  if (!isSupportedLanguage(record.language)) return null;

  const id = cleanText(record.id, 80);
  const name = cleanText(record.name, 80) || "Guest";
  if (!id) return null;

  return {
    id,
    name,
    email: cleanText(record.email, 120),
    language: record.language,
  };
}

function normalizeQuote(value: unknown): MessageQuote | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<MessageQuote>;
  if (!isSupportedLanguage(record.originalLanguage)) return null;

  const messageId = cleanText(record.messageId, 80);
  const senderId = cleanText(record.senderId, 80);
  const originalText = cleanText(record.originalText, 800);
  if (!messageId || !senderId || !originalText) return null;

  return {
    messageId,
    senderId,
    senderName: cleanText(record.senderName, 80) || "Unknown",
    originalLanguage: record.originalLanguage,
    originalText,
    translations: record.translations ?? {},
  };
}

function normalizeMessage(value: unknown): DemoMessage | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<DemoMessage>;
  if (!isMessageKind(record.kind) || !isSupportedLanguage(record.originalLanguage)) return null;

  const id = cleanText(record.id, 80);
  const senderId = cleanText(record.senderId, 80);
  const originalText = cleanText(record.originalText, MAX_MESSAGE_TEXT);
  if (!id || !senderId || !originalText) return null;

  const voiceUrl = typeof record.voiceUrl === "string" ? record.voiceUrl.slice(0, MAX_VOICE_URL_CHARS) : undefined;

  return {
    id,
    senderId,
    kind: record.kind,
    originalLanguage: record.originalLanguage,
    originalText,
    translations: record.translations ?? {},
    attachmentId: cleanText(record.attachmentId, 80) || null,
    fileName: record.fileName ? safeFileName(record.fileName) : undefined,
    filePath: cleanText(record.filePath, 300) || undefined,
    fileType: cleanText(record.fileType, 120) || null,
    voiceUrl,
    voiceDuration: typeof record.voiceDuration === "number" ? Math.max(0, Math.min(600, record.voiceDuration)) : undefined,
    createdAt: cleanText(record.createdAt, 40) || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    isPending: Boolean(record.isPending),
    quote: normalizeQuote(record.quote),
  };
}

function trimRoom(room: DemoRoom) {
  if (room.members.length > MAX_MEMBERS) room.members = room.members.slice(-MAX_MEMBERS);
  if (room.messages.length > MAX_MESSAGES) room.messages = room.messages.slice(-MAX_MESSAGES);
  if (room.files.length > MAX_FILES) room.files = room.files.slice(-MAX_FILES);
}

export async function POST(request: Request) {
  let body: DemoRoomRequestBody;

  try {
    body = (await request.json()) as DemoRoomRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isDemoAction(body.action)) {
    return NextResponse.json({ error: "Invalid demo room action." }, { status: 400 });
  }

  if (body.action === "create") {
    const member = normalizeMember(body.member);
    const title = cleanText(body.title, 80);
    const joinCode = normalizeJoinCode(body.joinCode);

    if (!member || !title || !joinCode) {
      return NextResponse.json({ error: "Missing demo room fields." }, { status: 400 });
    }

    const room: DemoRoom = {
      id: crypto.randomUUID(),
      title,
      joinCode,
      members: [member],
      messages: [],
      files: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      await savePersistentRoom(room);
      rememberRoom(room);
      return NextResponse.json({ room: serializeRoom(room) });
    } catch (error) {
      console.error("Persistent demo room create failed, using memory fallback.", error);
    }

    rememberRoom(room);
    return NextResponse.json({ room: serializeRoom(room) });
  }

  let room: DemoRoom | undefined | null;
  let isPersistentRoom = false;

  try {
    room = await findPersistentRoom(body);
    isPersistentRoom = Boolean(room);
    if (room) rememberRoom(room);
  } catch (error) {
    console.error("Persistent demo room lookup failed, using memory fallback.", error);
  }

  room = room ?? findMemoryRoom(body);

  if (!room) {
    return NextResponse.json({ error: "Demo room not found." }, { status: 404 });
  }

  if (body.action === "sync") {
    return NextResponse.json({
      room: serializeRoom(room, {
        memberCount: body.memberCount,
        messageCount: body.messageCount,
        fileCount: body.fileCount,
      }),
    });
  }

  const member = normalizeMember(body.member);

  if (member) {
    upsertMember(room, member);
    room.updatedAt = Date.now();
  }

  if (body.action === "send" && body.message) {
    const message = normalizeMessage(body.message);
    if (!message) return NextResponse.json({ error: "Invalid demo message." }, { status: 400 });

    if (!room.members.some((item) => item.id === message.senderId) && message.senderId !== "ai") {
      return NextResponse.json({ error: "Sender is not a room member." }, { status: 403 });
    }

    if (!room.messages.some((item) => item.id === message.id)) {
      room.messages.push(message);
      room.updatedAt = Date.now();
    }
  }

  if (body.action === "updateMessage" && body.message) {
    const message = normalizeMessage(body.message);
    if (!message) return NextResponse.json({ error: "Invalid demo message update." }, { status: 400 });

    const existingIndex = room.messages.findIndex((item) => item.id === message.id);
    if (existingIndex >= 0) {
      room.messages[existingIndex] = {
        ...room.messages[existingIndex],
        ...message,
        quote: message.quote ?? room.messages[existingIndex].quote ?? null,
      };
      room.updatedAt = Date.now();
    }
  }

  if (body.action === "addFile" && body.fileName) {
    const fileName = safeFileName(body.fileName);
    if (fileName && !room.files.includes(fileName)) {
      room.files.push(fileName);
      room.updatedAt = Date.now();
    }
  }

  trimRoom(room);
  room.updatedAt = Date.now();

  rememberRoom(room);

  if (isPersistentRoom || createDemoSupabaseClient()) {
    try {
      await savePersistentRoom(room);
    } catch (error) {
      console.error("Persistent demo room save failed.", error);
    }
  }

  return NextResponse.json({
    room: serializeRoom(room),
  });
}
