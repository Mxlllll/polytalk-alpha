import { NextResponse } from "next/server";

type Language = "zh" | "ko" | "en";

type DemoMember = {
  id: string;
  name: string;
  email: string;
  language: Language;
};

type DemoMessage = {
  id: string;
  senderId: string;
  kind: "text" | "file_summary" | "discussion_summary";
  originalLanguage: Language;
  originalText: string;
  translations: Partial<Record<Language, string>>;
  fileName?: string;
  createdAt: string;
};

type DemoRoom = {
  id: string;
  title: string;
  joinCode: string;
  members: DemoMember[];
  messages: DemoMessage[];
  files: string[];
  createdAt: number;
};

type DemoStore = {
  rooms: Map<string, DemoRoom>;
};

const globalStore = globalThis as typeof globalThis & {
  __polytalkDemoStore?: DemoStore;
};

const store =
  globalStore.__polytalkDemoStore ??
  (globalStore.__polytalkDemoStore = {
    rooms: new Map<string, DemoRoom>(),
  });

function normalizeJoinCode(input = "") {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
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

function serializeRoom(room: DemoRoom) {
  return {
    id: room.id,
    title: room.title,
    joinCode: room.joinCode,
    members: room.members,
    messages: room.messages,
    files: room.files,
  };
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    action: "create" | "join" | "sync" | "send" | "addFile";
    title?: string;
    joinCode?: string;
    roomId?: string;
    member?: DemoMember;
    message?: DemoMessage;
    fileName?: string;
  };

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
    };

    store.rooms.set(room.id, room);
    return NextResponse.json({ room: serializeRoom(room) });
  }

  const room =
    body.roomId
      ? store.rooms.get(body.roomId)
      : [...store.rooms.values()].find((item) => normalizeJoinCode(item.joinCode) === normalizeJoinCode(body.joinCode));

  if (!room) {
    return NextResponse.json({ error: "Demo room not found." }, { status: 404 });
  }

  if (body.member) {
    upsertMember(room, body.member);
  }

  if (body.action === "send" && body.message) {
    if (!room.messages.some((message) => message.id === body.message?.id)) {
      room.messages.push(body.message);
    }
  }

  if (body.action === "addFile" && body.fileName && !room.files.includes(body.fileName)) {
    room.files.push(body.fileName);
  }

  return NextResponse.json({ room: serializeRoom(room) });
}
