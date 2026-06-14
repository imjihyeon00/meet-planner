export type GroupStatus = "open" | "closed" | "deleted";
export type Visibility = "link" | "private";

export type Group = {
  id: string;
  title: string;
  description: string;
  creatorKey: string;
  inviteCode: string;
  dateStart: string;
  dateEnd: string;
  timeStart: string;
  timeEnd: string;
  slotMinutes: 30 | 60;
  deadline: string;
  visibility: Visibility;
  status: GroupStatus;
  createdAt: string;
  finalizedSlot?: Recommendation | null;
};

export type Participant = {
  id: string;
  groupId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type Availability = {
  id: string;
  groupId: string;
  participantId: string;
  date: string;
  start: string;
  end: string;
};

export type Recommendation = {
  key: string;
  date: string;
  start: string;
  end: string;
  count: number;
  availableIds: string[];
  unavailableIds: string[];
};

export type AppData = {
  groups: Group[];
  participants: Participant[];
  availability: Availability[];
};
