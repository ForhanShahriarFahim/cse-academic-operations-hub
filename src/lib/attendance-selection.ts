export type AttendanceQuery = Record<string, string | string[] | undefined>;
export type Choice = { value: string; label: string };
export type BrowseBatch = Choice & { department: string; stream: string; offered: boolean };
export type AttendanceGroup = {
  id: number; courseCode: string; courseTitle: string; audience: string;
  department: string; assigned: boolean; batches: string[];
};

const streams: Choice[] = [
  { value: "hsc", label: "HSC" },
  { value: "diploma", label: "Diploma" },
  { value: "other", label: "External / other" },
];

export function attendanceId(value: AttendanceQuery[string]) {
  if (typeof value !== "string" || !/^[1-9]\d{0,9}$/.test(value)) return undefined;
  const id = Number(value);
  return id <= 2147483647 ? id : undefined;
}

function selection(choices: Choice[], raw: AttendanceQuery[string]) {
  if (raw === undefined) return { value: choices.length === 1 ? choices[0].value : undefined, invalid: false };
  const value = choices.find(choice => choice.value === raw)?.value;
  return { value, invalid: value === undefined };
}

export function resolveAttendance(query: AttendanceQuery, teacher: boolean, departments: Choice[], batches: BrowseBatch[], groups: AttendanceGroup[]) {
  const view = query.view === "find" || !teacher ? "find" : "mine";
  const badView = query.view !== undefined && query.view !== "find" && !(query.view === "mine" && teacher);
  const hasFilters = ["department", "stream", "batch"].some(key => query[key] !== undefined);
  const department = selection(departments, query.department);
  const departmentBatches = batches.filter(batch => batch.department === department.value);
  const availableStreams = streams.filter(stream => departmentBatches.some(batch => batch.stream === stream.value));
  const stream = selection(availableStreams, query.stream);
  const availableBatches = departmentBatches.filter(batch => batch.stream === stream.value);
  const batch = selection(availableBatches, query.batch);
  const options = { department: departments, stream: availableStreams, batch: availableBatches };
  const filters = { department: department.value, stream: stream.value, batch: batch.value };
  const invalidFilters = department.invalid || stream.invalid || batch.invalid;
  const matches = groups.filter(group => group.department === department.value && batch.value !== undefined && group.batches.includes(batch.value));
  const eligible = hasFilters ? (invalidFilters || !batch.value ? [] : matches) : groups;
  const selected = eligible.find(group => group.id === attendanceId(query.group));
  return {
    view, filters, options, matches, selected,
    offered: availableBatches.find(choice => choice.value === batch.value)?.offered ?? false,
    badFilters: badView || invalidFilters,
    badGroup: query.group !== undefined && !selected,
  };
}

export function attendanceHref(query: Record<string, string | number | undefined>, anchor?: string) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return `/attendance${params.size ? `?${params}` : ""}${anchor ? `#${anchor}` : ""}`;
}

export function exactSlotSession<T extends { groupId: number; startMinutes: number | null; endMinutes: number | null }>(
  sessions: T[], slot: { teachingGroupId: number; startMinutes: number; endMinutes: number },
) {
  const matches = sessions.filter(session => session.groupId === slot.teachingGroupId
    && session.startMinutes === slot.startMinutes && session.endMinutes === slot.endMinutes);
  return matches.length === 1 ? matches[0] : undefined;
}
