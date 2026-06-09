import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

export async function POST(request: Request) {
  const body = (await request.json()) as DemoRoomRequestBody;

  if (body.action === "create") {
    if (!body.member || !body.title || !body.joinCode) {
      return NextResponse.json({ error: "Missing demo room fields." }, { status: 400 });
    }

    const room: DemoRoom = {
      id: crypto.randomUUID(),
      title: body.title,
      joinCode: normalizeJoinCode(body.joinCode),
      members: [body.member],
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

  if (body.member) {
    upsertMember(room, body.member);
    room.updatedAt = Date.now();
  }

  if (body.action === "send" && body.message) {
    if (!room.messages.some((message) => message.id === body.message?.id)) {
      room.messages.push(body.message);
      room.updatedAt = Date.now();
    }
  }

  if (body.action === "updateMessage" && body.message) {
    const existingIndex = room.messages.findIndex((message) => message.id === body.message?.id);
    if (existingIndex >= 0) {
      room.messages[existingIndex] = {
        ...room.messages[existingIndex],
        ...body.message,
      };
      room.updatedAt = Date.now();
    }
  }

  if (body.action === "addFile" && body.fileName && !room.files.includes(body.fileName)) {
    room.files.push(body.fileName);
    room.updatedAt = Date.now();
  }

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
