import type { Availability, Group, Participant, Recommendation } from "@/lib/types";

export function toMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function toTime(minutes: number) {
  const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
  const minute = String(minutes % 60).padStart(2, "0");
  return `${hour}:${minute}`;
}

export function dateRange(start: string, end: string) {
  const result: string[] = [];
  const current = parseDateKey(start);
  const last = parseDateKey(end);

  while (current <= last && result.length < 45) {
    result.push(formatDateKey(current));
    current.setDate(current.getDate() + 1);
  }

  return result;
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function timeSlots(group: Pick<Group, "timeStart" | "timeEnd" | "slotMinutes">) {
  const start = toMinutes(group.timeStart);
  const end = toMinutes(group.timeEnd);
  const slots: Array<{ start: string; end: string }> = [];

  for (let minute = start; minute < end; minute += group.slotMinutes) {
    slots.push({
      start: toTime(minute),
      end: toTime(Math.min(minute + group.slotMinutes, end)),
    });
  }

  return slots;
}

export function slotKey(date: string, start: string) {
  return `${date}|${start}`;
}

export function parseSlotKey(key: string) {
  const [date, start] = key.split("|");
  return { date, start };
}

export function availabilityCounts(availability: Availability[]) {
  const counts = new Map<string, string[]>();

  availability.forEach((slot) => {
    const key = slotKey(slot.date, slot.start);
    const ids = counts.get(key) ?? [];
    if (!ids.includes(slot.participantId)) ids.push(slot.participantId);
    counts.set(key, ids);
  });

  return counts;
}

export function buildRecommendations(
  group: Group,
  participants: Participant[],
  availability: Availability[],
) {
  const counts = availabilityCounts(availability.filter((slot) => slot.groupId === group.id));
  const participantIds = participants.filter((item) => item.groupId === group.id).map((item) => item.id);
  const slotEndLookup = new Map(timeSlots(group).map((slot) => [slot.start, slot.end]));

  return Array.from(counts.entries())
    .map<Recommendation>(([key, availableIds]) => {
      const { date, start } = parseSlotKey(key);
      return {
        key,
        date,
        start,
        end: slotEndLookup.get(start) ?? start,
        count: availableIds.length,
        availableIds,
        unavailableIds: participantIds.filter((id) => !availableIds.includes(id)),
      };
    })
    .sort((a, b) => b.count - a.count || a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}

export function displayName(participants: Participant[], participant: Participant) {
  const sameNames = participants.filter((item) => item.groupId === participant.groupId && item.name === participant.name);
  if (sameNames.length < 2) return participant.name;
  return `${participant.name} ${sameNames.findIndex((item) => item.id === participant.id) + 1}`;
}

export function isDeadlinePassed(deadline: string) {
  return Boolean(deadline && new Date(deadline) < new Date());
}
