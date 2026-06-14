"use client";

import type { AppData, Availability, Group, Participant } from "@/lib/types";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";

const STORAGE_KEY = "meet-planner-next-state-v1";

const emptyData: AppData = {
  groups: [],
  participants: [],
  availability: [],
};

export async function loadAppData(): Promise<AppData> {
  if (hasSupabaseConfig && supabase) {
    const [groups, participants, availability] = await Promise.all([
      supabase.from("groups").select("*").neq("status", "deleted").order("created_at", { ascending: false }),
      supabase.from("participants").select("*").order("created_at", { ascending: true }),
      supabase.from("availability").select("*").order("date", { ascending: true }),
    ]);

    if (groups.error || participants.error || availability.error) {
      throw new Error(groups.error?.message || participants.error?.message || availability.error?.message);
    }

    return {
      groups: (groups.data ?? []).map(fromGroupRow),
      participants: (participants.data ?? []).map(fromParticipantRow),
      availability: (availability.data ?? []).map(fromAvailabilityRow),
    };
  }

  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "") || emptyData;
  } catch {
    return emptyData;
  }
}

export async function saveLocalData(data: AppData) {
  if (!hasSupabaseConfig) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
}

export async function upsertGroup(group: Group) {
  if (!hasSupabaseConfig || !supabase) return;
  const { error } = await supabase.from("groups").upsert(toGroupRow(group));
  if (error) throw new Error(error.message);
}

export async function upsertParticipant(participant: Participant) {
  if (!hasSupabaseConfig || !supabase) return;
  const { error } = await supabase.from("participants").upsert(toParticipantRow(participant));
  if (error) throw new Error(error.message);
}

export async function replaceParticipantAvailability(participantId: string, slots: Availability[]) {
  if (!hasSupabaseConfig || !supabase) return;
  const deleted = await supabase.from("availability").delete().eq("participant_id", participantId);
  if (deleted.error) throw new Error(deleted.error.message);
  if (!slots.length) return;
  const inserted = await supabase.from("availability").insert(slots.map(toAvailabilityRow));
  if (inserted.error) throw new Error(inserted.error.message);
}

type GroupRow = {
  id: string;
  title: string;
  description: string | null;
  creator_key: string;
  invite_code: string;
  date_start: string;
  date_end: string;
  time_start: string;
  time_end: string;
  slot_minutes: 30 | 60;
  deadline: string;
  visibility: "link" | "private";
  status: "open" | "closed" | "deleted";
  created_at: string;
  finalized_slot: Group["finalizedSlot"];
};

type ParticipantRow = {
  id: string;
  group_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

type AvailabilityRow = {
  id: string;
  group_id: string;
  participant_id: string;
  date: string;
  start_time: string;
  end_time: string;
};

function fromGroupRow(row: GroupRow): Group {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    creatorKey: row.creator_key,
    inviteCode: row.invite_code,
    dateStart: row.date_start,
    dateEnd: row.date_end,
    timeStart: row.time_start,
    timeEnd: row.time_end,
    slotMinutes: row.slot_minutes,
    deadline: row.deadline,
    visibility: row.visibility,
    status: row.status,
    createdAt: row.created_at,
    finalizedSlot: row.finalized_slot,
  };
}

function toGroupRow(group: Group) {
  return {
    id: group.id,
    title: group.title,
    description: group.description,
    creator_key: group.creatorKey,
    invite_code: group.inviteCode,
    date_start: group.dateStart,
    date_end: group.dateEnd,
    time_start: group.timeStart,
    time_end: group.timeEnd,
    slot_minutes: group.slotMinutes,
    deadline: group.deadline,
    visibility: group.visibility,
    status: group.status,
    created_at: group.createdAt,
    finalized_slot: group.finalizedSlot ?? null,
  };
}

function fromParticipantRow(row: ParticipantRow): Participant {
  return {
    id: row.id,
    groupId: row.group_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toParticipantRow(participant: Participant) {
  return {
    id: participant.id,
    group_id: participant.groupId,
    name: participant.name,
    created_at: participant.createdAt,
    updated_at: participant.updatedAt,
  };
}

function fromAvailabilityRow(row: AvailabilityRow): Availability {
  return {
    id: row.id,
    groupId: row.group_id,
    participantId: row.participant_id,
    date: row.date,
    start: row.start_time,
    end: row.end_time,
  };
}

function toAvailabilityRow(slot: Availability) {
  return {
    id: slot.id,
    group_id: slot.groupId,
    participant_id: slot.participantId,
    date: slot.date,
    start_time: slot.start,
    end_time: slot.end,
  };
}
