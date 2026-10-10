import type { Speaker, VoiceRoom } from "../data/mock";

export type DbRoomHost = {
  id?: string;
  display_name?: string | null;
  avatar_url?: string | null;
  country_flag?: string | null;
  current_level?: string | null;
};

export type DbVoiceRoomRow = {
  id: string;
  name: string;
  type?: "VOICE" | "VIDEO" | "STREAM" | string | null;
  topic?: string | null;
  level?: string | null;
  language1?: string | null;
  language2?: string | null;
  host_id?: string | null;
  max_speakers?: number | null;
  speaker_count?: number | null;
  listener_count?: number | null;
  created_at?: string | null;
  host?: DbRoomHost | DbRoomHost[] | null;
};

const LANG_FLAGS: Record<string, string> = {
  english: "gb", turkish: "tr", spanish: "es", french: "fr", german: "de",
  japanese: "jp", korean: "kr", chinese: "cn", mandarin: "cn", portuguese: "br",
  arabic: "sa", hindi: "in", italian: "it", russian: "ru", ukrainian: "ua",
  dutch: "nl", polish: "pl", vietnamese: "vn", thai: "th", indonesian: "id",
};

export function languageFlag(language?: string | null) {
  return LANG_FLAGS[(language || "").trim().toLowerCase()] || "gb";
}

function initialsFromName(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "LL";
}

function roomAccent(id: string) {
  const colors = ["#6C5CE7", "#00B894", "#E84393", "#0984E3", "#E17055", "#00CEC9"];
  const hash = [...id].reduce((n, c) => n + c.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

function roomAge(createdAt?: string | null) {
  const ms = createdAt ? Date.now() - new Date(createdAt).getTime() : 0;
  const minutes = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 60_000)) : 0;
  if (minutes < 1) return "live now";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function mapDbVoiceRoom(row: DbVoiceRoomRow): VoiceRoom {
  const host = Array.isArray(row.host) ? row.host[0] : row.host;
  const hostName = host?.display_name || "Room host";
  const ageMs = row.created_at ? Date.now() - new Date(row.created_at).getTime() : Number.POSITIVE_INFINITY;
  const langs: [string, string] = [row.language1 || "Turkish", row.language2 || "English"];
  const speakers: Speaker[] = host ? [{
    name: hostName,
    initials: initialsFromName(hostName),
    avatarUrl: host.avatar_url ?? null,
    color: roomAccent(row.id),
    flag: host.country_flag || languageFlag(langs[0]),
    level: (host.current_level || "A1") as Speaker["level"],
  }] : [];

  return {
    id: row.id,
    name: row.name,
    topic: row.topic || "Daily Chat",
    level: row.level || "All levels",
    flags: [languageFlag(langs[0]), languageFlag(langs[1])],
    langs,
    speakers,
    speakerCount: Number(row.speaker_count) || 0,
    listeners: Number(row.listener_count) || 0,
    duration: roomAge(row.created_at),
    isNew: ageMs < 5 * 60_000,
    accent: roomAccent(row.id),
    roomMode: row.type === "VIDEO" ? "VIDEO" : row.type === "STREAM" ? "STREAM" : "VOICE",
    backendRoom: true,
    backendId: row.id,
    backendHostId: row.host_id || null,
    zegoRoomId: row.id.replace(/-/g, ""),
    maxParticipants: Number(row.max_speakers) || 15,
    createdAt: row.created_at || undefined,
  };
}
