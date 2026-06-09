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

export async function POST(request: Request) {
  const body = (await request.json()) as {
    action: "create" | "join" | "sync" | "send" | "updateMessage" | "addFile" | "react";
    title?: string;
    joinCode?: string;
    roomId?: string;
    member?: DemoMember;
    message?: DemoMessage;
    messageId?: string;
    fileName?: string;
    reactionKey?: ReactionKey;
    memberCount?: number;
    messageCount?: number;
    fileCount?: number;
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
      updatedAt: Date.now(),
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

  if (body.action === "react" && body.messageId && body.reactionKey && body.member) {
    const message = room.messages.find((item) => item.id === body.messageId);
    if (message) {
      toggleReaction(message, body.reactionKey, body.member.id);
      room.updatedAt = Date.now();
    }
  }

  return NextResponse.json({
    room: serializeRoom(
      room,
      body.action === "sync"
        ? {
            memberCount: body.memberCount,
            messageCount: body.messageCount,
            fileCount: body.fileCount,
          }
        : undefined,
    ),
  });
}
