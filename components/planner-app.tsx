"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  Check,
  Clipboard,
  Clock,
  Copy,
  Home,
  Link2,
  Plus,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  availabilityCounts,
  buildRecommendations,
  candidateDates,
  dateRange,
  displayName,
  isDeadlinePassed,
  parseSlotKey,
  slotKey,
  timeSlots,
  toMinutes,
} from "@/lib/schedule";
import {
  loadAppData,
  replaceParticipantAvailability,
  saveLocalData,
  upsertGroup,
  upsertParticipant,
} from "@/lib/repository";
import { hasSupabaseConfig } from "@/lib/supabase";
import type { AppData, Availability, Group, Participant, Recommendation, Visibility } from "@/lib/types";
import { cn } from "@/lib/utils";

const emptyData: AppData = { groups: [], participants: [], availability: [] };
const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAY_OPTIONS = [
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" },
  { value: 0, label: "일" },
];
const WEEKDAY_PRESETS = [
  { label: "전체", values: ALL_WEEKDAYS },
  { label: "평일", values: [1, 2, 3, 4, 5] },
  { label: "주말", values: [0, 6] },
];

export function PlannerApp() {
  const [data, setData] = useState<AppData>(emptyData);
  const [activeInvite, setActiveInvite] = useState("");
  const [activeParticipantId, setActiveParticipantId] = useState("");
  const [draftSlots, setDraftSlots] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [dragMode, setDragMode] = useState<"add" | "remove" | null>(null);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAppData()
      .then(setData)
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const readHash = () => {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      setActiveInvite((params.get("invite") || "").toUpperCase());
    };
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);

  useEffect(() => {
    const release = () => setDragMode(null);
    window.addEventListener("pointerup", release);
    return () => window.removeEventListener("pointerup", release);
  }, []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const activeGroup = useMemo(
    () => data.groups.find((group) => group.inviteCode === activeInvite && group.status !== "deleted") ?? null,
    [activeInvite, data.groups],
  );

  const groupParticipants = useMemo(
    () => (activeGroup ? data.participants.filter((item) => item.groupId === activeGroup.id) : []),
    [activeGroup, data.participants],
  );

  const groupAvailability = useMemo(
    () => (activeGroup ? data.availability.filter((item) => item.groupId === activeGroup.id) : []),
    [activeGroup, data.availability],
  );

  const activeParticipant = useMemo(
    () => groupParticipants.find((item) => item.id === activeParticipantId) ?? null,
    [activeParticipantId, groupParticipants],
  );

  async function commit(next: AppData) {
    setData(next);
    await saveLocalData(next);
  }

  function showMessage(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  function goHome() {
    window.history.replaceState(null, "", window.location.pathname);
    setActiveInvite("");
    setActiveParticipantId("");
    setDraftSlots(new Set());
    setDirty(false);
  }

  async function handleCreate(formData: FormData) {
    const title = String(formData.get("title") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const dateStart = String(formData.get("dateStart"));
    const dateEnd = String(formData.get("dateEnd"));
    const timeStart = String(formData.get("timeStart"));
    const timeEnd = String(formData.get("timeEnd"));
    const slotMinutes = Number(formData.get("slotMinutes")) as 30 | 60;
    const deadline = String(formData.get("deadline"));
    const visibility = String(formData.get("visibility")) as Visibility;
    const allowedWeekdays = formData
      .getAll("allowedWeekdays")
      .map((value) => Number(value))
      .filter((value) => ALL_WEEKDAYS.includes(value));

    if (!title) return setError("그룹명을 입력해 주세요.");
    if (dateStart > dateEnd) return setError("후보 종료일은 시작일 이후여야 합니다.");
    if (toMinutes(timeStart) >= toMinutes(timeEnd)) return setError("종료 시간은 시작 시간 이후여야 합니다.");
    if (dateRange(dateStart, dateEnd).length > 45) return setError("후보 날짜 범위는 45일 이내로 설정해 주세요.");
    if (!allowedWeekdays.length) return setError("후보 요일을 하나 이상 선택해 주세요.");

    const group: Group = {
      id: crypto.randomUUID(),
      title,
      description,
      creatorKey: crypto.randomUUID(),
      inviteCode: createInviteCode(),
      dateStart,
      dateEnd,
      allowedWeekdays,
      timeStart,
      timeEnd,
      slotMinutes,
      deadline,
      visibility,
      status: "open",
      createdAt: new Date().toISOString(),
      finalizedSlot: null,
    };

    if (!candidateDates(group).length) {
      return setError("선택한 날짜 범위 안에 후보 요일이 없습니다.");
    }

    try {
      await upsertGroup(group);
      await commit({ ...data, groups: [group, ...data.groups] });
      window.history.replaceState(null, "", `${window.location.pathname}#invite=${group.inviteCode}`);
      setActiveInvite(group.inviteCode);
      showMessage("그룹을 생성했습니다.");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "그룹 생성에 실패했습니다.");
    }
  }

  async function handleJoin(formData: FormData) {
    const code = normalizeInvite(String(formData.get("invite") || ""));
    const group = data.groups.find((item) => item.inviteCode === code && item.status !== "deleted");
    if (!group) {
      setError("초대 링크가 만료되었거나 그룹을 찾을 수 없습니다.");
      return;
    }
    window.history.replaceState(null, "", `${window.location.pathname}#invite=${group.inviteCode}`);
    setActiveInvite(group.inviteCode);
    setError("");
  }

  async function joinAsParticipant(formData: FormData) {
    if (!activeGroup) return;
    const name = String(formData.get("name") || "").trim();
    if (!name) return;

    const participant: Participant = {
      id: crypto.randomUUID(),
      groupId: activeGroup.id,
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await upsertParticipant(participant);
      const next = { ...data, participants: [...data.participants, participant] };
      await commit(next);
      setActiveParticipantId(participant.id);
      setDraftSlots(new Set());
      setDirty(false);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "참여자 저장에 실패했습니다.");
    }
  }

  function selectParticipant(participant: Participant) {
    setActiveParticipantId(participant.id);
    setDraftSlots(
      new Set(
        data.availability
          .filter((slot) => slot.participantId === participant.id)
          .map((slot) => slotKey(slot.date, slot.start)),
      ),
    );
    setDirty(false);
  }

  function toggleDraft(key: string, mode: "add" | "remove") {
    setDraftSlots((current) => {
      const next = new Set(current);
      if (mode === "add") next.add(key);
      if (mode === "remove") next.delete(key);
      return next;
    });
    setDirty(true);
  }

  async function saveSlots() {
    if (!activeGroup || !activeParticipant) return;
    const endLookup = new Map(timeSlots(activeGroup).map((slot) => [slot.start, slot.end]));
    const slots: Availability[] = Array.from(draftSlots).map((key) => {
      const parsed = parseSlotKey(key);
      return {
        id: crypto.randomUUID(),
        groupId: activeGroup.id,
        participantId: activeParticipant.id,
        date: parsed.date,
        start: parsed.start,
        end: endLookup.get(parsed.start) ?? parsed.start,
      };
    });

    try {
      await replaceParticipantAvailability(activeParticipant.id, slots);
      const next: AppData = {
        ...data,
        availability: [
          ...data.availability.filter((slot) => slot.participantId !== activeParticipant.id),
          ...slots,
        ],
        participants: data.participants.map((participant) =>
          participant.id === activeParticipant.id
            ? { ...participant, updatedAt: new Date().toISOString() }
            : participant,
        ),
      };
      await commit(next);
      setDirty(false);
      showMessage("일정을 저장했습니다.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "저장에 실패했습니다. 다시 시도해 주세요.");
    }
  }

  async function updateGroup(group: Group) {
    try {
      await upsertGroup(group);
      await commit({ ...data, groups: data.groups.map((item) => (item.id === group.id ? group : item)) });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "그룹 변경에 실패했습니다.");
    }
  }

  async function finalize(slot: Recommendation) {
    if (!activeGroup) return;
    await updateGroup({ ...activeGroup, finalizedSlot: slot, status: "closed" });
    showMessage("최종 일정을 확정했습니다.");
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">불러오는 중</div>;
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/88 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <button className="flex items-center gap-3 text-left" onClick={goHome} aria-label="메인 화면으로 이동">
            <span className="grid h-10 w-10 place-items-center rounded-md bg-primary text-primary-foreground">
              <CalendarCheck size={20} />
            </span>
            <span>
              <strong className="block text-base">약속정하기</strong>
              <span className="block text-xs text-muted-foreground">친구 일정 조율</span>
            </span>
          </button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={goHome}>
              <Home size={16} />
              홈
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        {error ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {toast ? (
          <div className="fixed right-4 top-20 z-50 rounded-md bg-foreground px-4 py-3 text-sm font-semibold text-background shadow-panel">
            {toast}
          </div>
        ) : null}
        {activeGroup ? (
          <GroupView
            group={activeGroup}
            participants={groupParticipants}
            availability={groupAvailability}
            activeParticipant={activeParticipant}
            draftSlots={draftSlots}
            dragMode={dragMode}
            setDragMode={setDragMode}
            selectParticipant={selectParticipant}
            joinAsParticipant={joinAsParticipant}
            toggleDraft={toggleDraft}
            clearDraft={() => {
              setDraftSlots(new Set());
              setDirty(true);
            }}
            saveSlots={saveSlots}
            finalize={finalize}
            updateGroup={updateGroup}
          />
        ) : (
          <HomeView groups={data.groups} handleCreate={handleCreate} handleJoin={handleJoin} openGroup={(group) => {
            window.history.replaceState(null, "", `${window.location.pathname}#invite=${group.inviteCode}`);
            setActiveInvite(group.inviteCode);
          }} />
        )}
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs text-muted-foreground sm:px-6">
        {hasSupabaseConfig ? "Supabase 연결됨" : "개발 모드: 브라우저 로컬 저장소 사용"}
      </footer>
    </div>
  );
}

function HomeView({
  groups,
  handleCreate,
  handleJoin,
  openGroup,
}: {
  groups: Group[];
  handleCreate: (formData: FormData) => void;
  handleJoin: (formData: FormData) => void;
  openGroup: (group: Group) => void;
}) {
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>(ALL_WEEKDAYS);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
      <section className="surface overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="border-b border-border bg-slate-950 p-6 text-white lg:border-b-0 lg:border-r">
            <p className="eyebrow text-amber-300">MVP 일정 조율</p>
            <h1 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">친구들이 가능한 시간을 모아 최적 시간을 고릅니다.</h1>
            <div className="mt-8 grid grid-cols-4 gap-2" aria-hidden="true">
              {Array.from({ length: 16 }).map((_, index) => (
                <span
                  key={index}
                  className={cn(
                    "h-12 rounded-md border border-white/15 bg-white/10",
                    [2, 5, 6, 10, 14].includes(index) && "bg-primary",
                    [7, 11].includes(index) && "bg-amber-400",
                  )}
                />
              ))}
            </div>
          </div>
          <form action={handleCreate} className="grid gap-4 p-5 sm:p-6">
            <SectionHeading eyebrow="새 그룹" title="약속 조율 그룹 생성" />
            <label className="label">
              그룹명
              <Input name="title" required placeholder="예: 7월 주말 모임" />
            </label>
            <label className="label">
              약속 설명
              <Textarea name="description" placeholder="장소 후보, 모임 목적 등을 적어주세요." />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="label">
                후보 시작일
                <Input name="dateStart" type="date" required defaultValue={today(3)} />
              </label>
              <label className="label">
                후보 종료일
                <Input name="dateEnd" type="date" required defaultValue={today(10)} />
              </label>
            </div>
            <WeekdayPicker selected={selectedWeekdays} onChange={setSelectedWeekdays} />
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="label">
                시작 시간
                <Input name="timeStart" type="time" required defaultValue="10:00" />
              </label>
              <label className="label">
                종료 시간
                <Input name="timeEnd" type="time" required defaultValue="22:00" />
              </label>
              <label className="label">
                시간 단위
                <Select name="slotMinutes" defaultValue="30">
                  <option value="30">30분</option>
                  <option value="60">1시간</option>
                </Select>
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="label">
                마감일
                <Input name="deadline" type="datetime-local" required defaultValue={`${today(2)}T20:00`} />
              </label>
              <label className="label">
                접근 방식
                <Select name="visibility" defaultValue="link">
                  <option value="link">링크 접근</option>
                  <option value="private">생성자 확인 후 공유</option>
                </Select>
              </label>
            </div>
            <Button type="submit" className="w-full">
              <Plus size={16} />
              그룹 생성
            </Button>
          </form>
        </div>
      </section>

      <aside className="grid content-start gap-6">
        <form action={handleJoin} className="surface grid gap-4 p-5 sm:p-6">
          <SectionHeading eyebrow="초대" title="초대 코드로 참여" />
          <label className="label">
            초대 코드 또는 링크
            <Input name="invite" placeholder="예: A1B2C3D4" />
          </label>
          <Button type="submit" variant="secondary" className="w-full">
            <Link2 size={16} />
            그룹 열기
          </Button>
        </form>

        <section className="surface p-5 sm:p-6">
          <SectionHeading eyebrow="최근" title="이 브라우저의 그룹" />
          <div className="mt-4 grid gap-2">
            {groups.filter((group) => group.status !== "deleted").slice(0, 7).map((group) => (
              <button
                key={group.id}
                className="flex items-center justify-between rounded-md border border-border bg-white px-3 py-3 text-left hover:bg-muted"
                onClick={() => openGroup(group)}
              >
                <span>
                  <strong className="block text-sm">{group.title}</strong>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(group.dateStart)} - {formatDate(group.dateEnd)}
                  </span>
                </span>
                <Clipboard size={16} className="text-muted-foreground" />
              </button>
            ))}
            {!groups.length ? <p className="text-sm text-muted-foreground">아직 생성한 그룹이 없습니다.</p> : null}
          </div>
        </section>
      </aside>
    </div>
  );
}

function WeekdayPicker({
  selected,
  onChange,
}: {
  selected: number[];
  onChange: (weekdays: number[]) => void;
}) {
  const normalized = normalizeWeekdays(selected);

  function applyPreset(values: number[]) {
    onChange(normalizeWeekdays(values));
  }

  function toggleWeekday(value: number) {
    const next = normalized.includes(value)
      ? normalized.filter((weekday) => weekday !== value)
      : [...normalized, value];
    if (!next.length) return;
    onChange(normalizeWeekdays(next));
  }

  return (
    <fieldset className="grid gap-3">
      <legend className="text-sm font-semibold text-foreground">후보 요일</legend>
      <div className="flex flex-wrap gap-2">
        {WEEKDAY_PRESETS.map((preset) => {
          const active = sameWeekdays(normalized, preset.values);
          return (
            <Button
              key={preset.label}
              type="button"
              size="sm"
              variant={active ? "default" : "outline"}
              onClick={() => applyPreset(preset.values)}
            >
              {preset.label}
            </Button>
          );
        })}
      </div>
      <div className="grid grid-cols-7 gap-2" aria-label="후보 요일 직접 선택">
        {WEEKDAY_OPTIONS.map((weekday) => {
          const checked = normalized.includes(weekday.value);
          return (
            <label
              key={weekday.value}
              className={cn(
                "grid h-10 cursor-pointer place-items-center rounded-md border text-sm font-black transition-colors",
                checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-white hover:bg-muted",
              )}
            >
              <input
                className="sr-only"
                type="checkbox"
                name="allowedWeekdays"
                value={weekday.value}
                checked={checked}
                onChange={() => toggleWeekday(weekday.value)}
              />
              {weekday.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function GroupView(props: {
  group: Group;
  participants: Participant[];
  availability: Availability[];
  activeParticipant: Participant | null;
  draftSlots: Set<string>;
  dragMode: "add" | "remove" | null;
  setDragMode: (mode: "add" | "remove" | null) => void;
  selectParticipant: (participant: Participant) => void;
  joinAsParticipant: (formData: FormData) => void;
  toggleDraft: (key: string, mode: "add" | "remove") => void;
  clearDraft: () => void;
  saveSlots: () => void;
  finalize: (slot: Recommendation) => void;
  updateGroup: (group: Group) => void;
}) {
  const {
    group,
    participants,
    availability,
    activeParticipant,
    draftSlots,
    dragMode,
    setDragMode,
    selectParticipant,
    joinAsParticipant,
    toggleDraft,
    clearDraft,
    saveSlots,
    finalize,
    updateGroup,
  } = props;

  const inviteLink = typeof window === "undefined" ? group.inviteCode : `${window.location.origin}${window.location.pathname}#invite=${group.inviteCode}`;
  const recommendations = buildRecommendations(group, participants, availability).slice(0, 10);
  const locked = group.status === "closed" || isDeadlinePassed(group.deadline);

  return (
    <div className="grid gap-6">
      <section className="surface grid gap-5 p-5 sm:p-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <p className="eyebrow">{group.status === "closed" ? "조율 종료" : "조율 중"}</p>
          <h1 className="mt-2 text-3xl font-black leading-tight">{group.title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{group.description || "설명이 없는 약속입니다."}</p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-slate-700">
            <span className="rounded-md bg-muted px-2.5 py-1.5">{formatDate(group.dateStart)} - {formatDate(group.dateEnd)}</span>
            <span className="rounded-md bg-muted px-2.5 py-1.5">{formatAllowedWeekdays(group.allowedWeekdays)}</span>
            <span className="rounded-md bg-muted px-2.5 py-1.5">{group.timeStart} - {group.timeEnd}</span>
            <span className="rounded-md bg-muted px-2.5 py-1.5">{group.slotMinutes}분 단위</span>
            <span className="rounded-md bg-muted px-2.5 py-1.5">마감 {formatDateTime(group.deadline)}</span>
          </div>
        </div>
        <div className="grid gap-3">
          <label className="label">
            초대 링크
            <div className="flex gap-2">
              <Input value={inviteLink} readOnly aria-label="초대 링크" />
              <Button
                type="button"
                size="icon"
                variant="outline"
                title="초대 링크 복사"
                aria-label="초대 링크 복사"
                onClick={() => navigator.clipboard.writeText(inviteLink)}
              >
                <Copy size={16} />
              </Button>
            </div>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => updateGroup({ ...group, status: group.status === "closed" ? "open" : "closed" })}>
              <Check size={16} />
              {group.status === "closed" ? "다시 열기" : "조율 종료"}
            </Button>
            <Button variant="destructive" onClick={() => updateGroup({ ...group, status: "deleted" })}>
              <Trash2 size={16} />
              그룹 삭제
            </Button>
          </div>
        </div>
      </section>

      {group.finalizedSlot ? <FinalBanner group={group} participants={participants} /> : null}

      <div className="grid min-w-0 gap-6 lg:grid-cols-[20rem_1fr]">
        <aside className="grid content-start gap-6">
          <form action={joinAsParticipant} className="surface grid gap-4 p-5">
            <SectionHeading eyebrow="참여" title="내 일정 등록" />
            <label className="label">
              이름 또는 닉네임
              <Input name="name" required placeholder="예: 지현" />
            </label>
            <Button type="submit">
              <UserRound size={16} />
              닉네임으로 참여
            </Button>
          </form>

          <section className="surface p-5">
            <SectionHeading eyebrow="상태" title="참여자" />
            <div className="mt-4 grid gap-2">
              {participants.map((participant) => {
                const registered = availability.some((slot) => slot.participantId === participant.id);
                return (
                  <button
                    key={participant.id}
                    className={cn(
                      "flex items-center justify-between rounded-md border border-border px-3 py-3 text-left hover:bg-muted",
                      activeParticipant?.id === participant.id && "border-primary bg-primary/10",
                    )}
                    onClick={() => selectParticipant(participant)}
                  >
                    <span>
                      <strong className="block text-sm">{displayName(participants, participant)}</strong>
                      <span className="text-xs text-muted-foreground">{registered ? "등록 완료" : "미등록"}</span>
                    </span>
                    <span className={cn("rounded-md px-2 py-1 text-xs font-bold", registered ? "bg-primary text-white" : "bg-amber-100 text-amber-900")}>
                      {registered ? "완료" : "대기"}
                    </span>
                  </button>
                );
              })}
              {!participants.length ? <p className="text-sm text-muted-foreground">아직 참여자가 없습니다.</p> : null}
            </div>
          </section>
        </aside>

        <section className="grid min-w-0 gap-6">
          <ScheduleEditor
            group={group}
            activeParticipant={activeParticipant}
            participants={participants}
            draftSlots={draftSlots}
            locked={locked}
            dragMode={dragMode}
            setDragMode={setDragMode}
            toggleDraft={toggleDraft}
            clearDraft={clearDraft}
            saveSlots={saveSlots}
          />
          <Heatmap group={group} participants={participants} availability={availability} />
          <RecommendationList
            group={group}
            participants={participants}
            recommendations={recommendations}
            finalize={finalize}
          />
        </section>
      </div>
    </div>
  );
}

function ScheduleEditor(props: {
  group: Group;
  activeParticipant: Participant | null;
  participants: Participant[];
  draftSlots: Set<string>;
  locked: boolean;
  dragMode: "add" | "remove" | null;
  setDragMode: (mode: "add" | "remove" | null) => void;
  toggleDraft: (key: string, mode: "add" | "remove") => void;
  clearDraft: () => void;
  saveSlots: () => void;
}) {
  const { group, activeParticipant, participants, draftSlots, locked, dragMode, setDragMode, toggleDraft, clearDraft, saveSlots } = props;
  const dates = candidateDates(group);
  const slots = timeSlots(group);

  return (
    <section className="surface p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <SectionHeading
          eyebrow="가능 시간"
          title={activeParticipant ? `${displayName(participants, activeParticipant)}님의 시간표` : "닉네임을 입력하면 시간표가 열립니다"}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!activeParticipant || locked || !draftSlots.size} onClick={clearDraft}>
            선택 해제
          </Button>
          <Button disabled={!activeParticipant || locked} onClick={saveSlots}>
            일정 저장
          </Button>
        </div>
      </div>

      {!activeParticipant ? (
        <div className="mt-5 rounded-md border border-dashed border-border bg-muted/50 p-8 text-center text-sm text-muted-foreground">
          먼저 닉네임으로 참여하세요.
        </div>
      ) : (
        <div className="scrollbar-thin mt-5 overflow-auto">
          <div
            className="grid min-w-max overflow-hidden rounded-md border border-border"
            style={{ gridTemplateColumns: `6rem repeat(${dates.length}, minmax(5.75rem, 1fr))` }}
          >
            <div className="slot-cell border-b border-r border-border bg-muted p-2 text-xs font-bold">시간</div>
            {dates.map((date) => (
              <div key={date} className="slot-cell border-b border-r border-border bg-muted p-2 text-center text-xs font-bold">
                <span className="block">{formatDate(date)}</span>
                <span className="block text-muted-foreground">{date.slice(5)}</span>
              </div>
            ))}
            {slots.map((slot) => (
              <RowSlots
                key={slot.start}
                slot={slot}
                dates={dates}
                draftSlots={draftSlots}
                locked={locked}
                dragMode={dragMode}
                setDragMode={setDragMode}
                toggleDraft={toggleDraft}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function RowSlots(props: {
  slot: { start: string; end: string };
  dates: string[];
  draftSlots: Set<string>;
  locked: boolean;
  dragMode: "add" | "remove" | null;
  setDragMode: (mode: "add" | "remove" | null) => void;
  toggleDraft: (key: string, mode: "add" | "remove") => void;
}) {
  const { slot, dates, draftSlots, locked, dragMode, setDragMode, toggleDraft } = props;
  return (
    <>
      <div className="slot-cell border-b border-r border-border bg-white p-2 text-xs font-bold">
        <span className="block">{slot.start}</span>
        <span className="block text-muted-foreground">{slot.end}</span>
      </div>
      {dates.map((date) => {
        const key = slotKey(date, slot.start);
        const selected = draftSlots.has(key);
        return (
          <button
            key={key}
            type="button"
            disabled={locked}
            aria-pressed={selected}
            aria-label={`${formatDateFull(date)} ${slot.start}-${slot.end} 가능 시간 ${selected ? "선택됨" : "선택 안 됨"}`}
            className={cn(
              "slot-cell border-b border-r border-border text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              selected ? "bg-primary text-primary-foreground" : "bg-white hover:bg-secondary",
            )}
            onPointerDown={(event) => {
              event.preventDefault();
              const mode = selected ? "remove" : "add";
              setDragMode(mode);
              toggleDraft(key, mode);
            }}
            onPointerEnter={() => {
              if (dragMode) toggleDraft(key, dragMode);
            }}
          >
            {selected ? "가능" : ""}
          </button>
        );
      })}
    </>
  );
}

function Heatmap({ group, participants, availability }: { group: Group; participants: Participant[]; availability: Availability[] }) {
  const dates = candidateDates(group);
  const slots = timeSlots(group);
  const counts = availabilityCounts(availability);
  const max = Math.max(1, participants.length);

  return (
    <section className="surface p-5">
      <SectionHeading eyebrow="현황" title="전체 가능 시간" />
      <div className="scrollbar-thin mt-5 overflow-auto">
        <div className="grid min-w-max overflow-hidden rounded-md border border-border" style={{ gridTemplateColumns: `6rem repeat(${dates.length}, minmax(5.75rem, 1fr))` }}>
          <div className="slot-cell border-b border-r border-border bg-muted p-2 text-xs font-bold">시간</div>
          {dates.map((date) => (
            <div key={date} className="slot-cell border-b border-r border-border bg-muted p-2 text-center text-xs font-bold">{formatDate(date)}</div>
          ))}
          {slots.map((slot) => (
            <HeatRow key={slot.start} dates={dates} slot={slot} counts={counts} total={participants.length} max={max} />
          ))}
        </div>
      </div>
    </section>
  );
}

function HeatRow({
  dates,
  slot,
  counts,
  total,
  max,
}: {
  dates: string[];
  slot: { start: string; end: string };
  counts: Map<string, string[]>;
  total: number;
  max: number;
}) {
  return (
    <>
      <div className="slot-cell border-b border-r border-border bg-white p-2 text-xs font-bold">
        {slot.start}-{slot.end}
      </div>
      {dates.map((date) => {
        const count = counts.get(slotKey(date, slot.start))?.length ?? 0;
        const ratio = count / max;
        return (
          <div
            key={`${date}-${slot.start}`}
            className={cn(
              "slot-cell grid place-items-center border-b border-r border-border text-xs font-black",
              ratio >= 0.75 && "bg-primary text-white",
              ratio >= 0.5 && ratio < 0.75 && "bg-teal-100 text-teal-950",
              ratio > 0 && ratio < 0.5 && "bg-amber-100 text-amber-950",
              ratio === 0 && "bg-white text-muted-foreground",
            )}
          >
            {count}/{total}
          </div>
        );
      })}
    </>
  );
}

function RecommendationList({
  group,
  participants,
  recommendations,
  finalize,
}: {
  group: Group;
  participants: Participant[];
  recommendations: Recommendation[];
  finalize: (slot: Recommendation) => void;
}) {
  return (
    <section className="surface p-5">
      <SectionHeading eyebrow="추천" title="가장 많이 겹치는 시간" />
      <div className="mt-5 grid gap-3">
        {recommendations.map((slot, index) => {
          const available = slot.availableIds.map((id) => participants.find((item) => item.id === id)).filter(Boolean) as Participant[];
          const unavailable = slot.unavailableIds.map((id) => participants.find((item) => item.id === id)).filter(Boolean) as Participant[];
          const finalized = group.finalizedSlot?.key === slot.key;
          return (
            <article key={slot.key} className={cn("grid gap-3 rounded-md border border-border bg-white p-4 sm:grid-cols-[3rem_1fr_auto]", finalized && "border-primary bg-primary/10")}>
              <div className="grid h-10 w-10 place-items-center rounded-md bg-slate-950 text-sm font-black text-white">{index + 1}</div>
              <div>
                <h3 className="font-black">{formatDateFull(slot.date)} {slot.start}-{slot.end}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  <strong className="text-foreground">{slot.count}명 가능</strong> · 가능: {available.map((item) => displayName(participants, item)).join(", ")}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  불가능: {unavailable.length ? unavailable.map((item) => displayName(participants, item)).join(", ") : "없음"}
                </p>
              </div>
              <Button variant={finalized ? "default" : "secondary"} onClick={() => finalize(slot)}>
                {finalized ? "확정됨" : "최종 확정"}
              </Button>
            </article>
          );
        })}
        {!recommendations.length ? <p className="rounded-md border border-dashed border-border bg-muted/50 p-8 text-center text-sm text-muted-foreground">저장된 가능 시간이 생기면 추천 결과가 표시됩니다.</p> : null}
      </div>
    </section>
  );
}

function FinalBanner({ group, participants }: { group: Group; participants: Participant[] }) {
  if (!group.finalizedSlot) return null;
  const slot = group.finalizedSlot;
  const available = slot.availableIds.map((id) => participants.find((item) => item.id === id)).filter(Boolean) as Participant[];
  const unavailable = slot.unavailableIds.map((id) => participants.find((item) => item.id === id)).filter(Boolean) as Participant[];

  return (
    <section className="surface border-primary bg-primary/10 p-5">
      <p className="eyebrow">최종 확정</p>
      <h2 className="mt-2 text-2xl font-black">{formatDateFull(slot.date)} {slot.start}-{slot.end}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        가능: {available.map((item) => displayName(participants, item)).join(", ")} · 불가능: {unavailable.length ? unavailable.map((item) => displayName(participants, item)).join(", ") : "없음"}
      </p>
    </section>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-black leading-tight">{title}</h2>
    </div>
  );
}

function createInviteCode() {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join("").toUpperCase();
}

function normalizeInvite(value: string) {
  const raw = value.trim();
  if (raw.includes("#invite=")) return raw.split("#invite=").pop()?.split("&")[0].toUpperCase() ?? "";
  return raw.toUpperCase();
}

function today(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", weekday: "short" }).format(new Date(`${date}T00:00:00`));
}

function formatDateFull(date: string) {
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date(`${date}T00:00:00`));
}

function formatDateTime(date: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

function normalizeWeekdays(values: number[]) {
  return ALL_WEEKDAYS.filter((weekday) => values.includes(weekday));
}

function sameWeekdays(a: number[], b: number[]) {
  const left = normalizeWeekdays(a);
  const right = normalizeWeekdays(b);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function formatAllowedWeekdays(values: number[] = ALL_WEEKDAYS) {
  const normalized = normalizeWeekdays(values.length ? values : ALL_WEEKDAYS);
  const preset = WEEKDAY_PRESETS.find((item) => sameWeekdays(normalized, item.values));
  if (preset) return `후보 요일 ${preset.label}`;
  return `후보 요일 ${WEEKDAY_OPTIONS.filter((item) => normalized.includes(item.value)).map((item) => item.label).join(", ")}`;
}
