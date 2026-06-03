import { NextResponse } from "next/server";

type Language = "zh" | "ko" | "en";
type ReactionKey = "got_it" | "agree" | "question" | "watching" | "thanks";
type MessageReactions = Partial<Record<ReactionKey, string[]>>;

type DemoMember = {
  id: string;
  name: string;
  email: string;
  language: Language;
};

type DemoMessage = {
  id: string;
  senderId: string;
  kind: "text" | "file" | "file_summary" | "discussion_summary";
  originalLanguage: Language;
  originalText: string;
  translations: Partial<Record<Language, string>>;
  attachmentId?: string | null;
  fileName?: string;
  createdAt: string;
  reactions?: MessageReactions;
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

function toggleReaction(message: DemoMessage, reactionKey: ReactionKey, userId: string) {
  const currentReactions: MessageReactions = message.reactions ?? {};
  const users = currentReactions[reactionKey] ?? [];
  const nextUsers = users.includes(userId) ? users.filter((id) => id !== userId) : [...users, userId];
  message.reactions = {
    ...currentReactions,
    [reactionKey]: nextUsers,
  };
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
    action: "create" | "join" | "sync" | "send" | "addFile" | "react";
    title?: string;
    joinCode?: string;
    roomId?: string;
    member?: DemoMember;
    message?: DemoMessage;
    messageId?: string;
    fileName?: string;
    reactionKey?: ReactionKey;
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

  if (body.action === "react" && body.messageId && body.reactionKey && body.member) {
    const message = room.messages.find((item) => item.id === body.messageId);
    if (message) {
      toggleReaction(message, body.reactionKey, body.member.id);
    }
  }

  return NextResponse.json({ room: serializeRoom(room) });
}
