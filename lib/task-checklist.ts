export type TaskChecklistItem = {
  id: string;
  text: string;
  done: boolean;
  created_at: string;
  completed_at: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function toBoolean(value: unknown) {
  return value === true;
}

function toOptionalIso(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function buildChecklistItemId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createTaskChecklistItem(text: string): TaskChecklistItem {
  return {
    id: buildChecklistItemId(),
    text: text.trim(),
    done: false,
    created_at: new Date().toISOString(),
    completed_at: null
  };
}

export function normalizeTaskChecklistItems(value: unknown): TaskChecklistItem[] {
  if (!Array.isArray(value)) return [];

  const normalized: TaskChecklistItem[] = [];

  for (const rawItem of value) {
    if (!isRecord(rawItem)) continue;

    const text = toText(rawItem.text);
    if (!text) continue;

    const done = toBoolean(rawItem.done);
    const completedAt = done ? toOptionalIso(rawItem.completed_at) : null;
    const createdAt = toOptionalIso(rawItem.created_at) ?? new Date().toISOString();
    const itemId = toText(rawItem.id) || buildChecklistItemId();

    normalized.push({
      id: itemId,
      text,
      done,
      created_at: createdAt,
      completed_at: completedAt
    });
  }

  return normalized;
}

export function getTaskChecklistProgress(items: TaskChecklistItem[]) {
  const total = items.length;
  const completed = items.filter((item) => item.done).length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  return {
    total,
    completed,
    percent
  };
}

export function getTaskProgressPercent({
  checklistItems,
  status
}: {
  checklistItems: TaskChecklistItem[];
  status: string;
}) {
  const checklistProgress = getTaskChecklistProgress(checklistItems);

  if (checklistProgress.total > 0) {
    return checklistProgress.percent;
  }

  switch (status) {
    case "concluido":
      return 100;
    case "revisao":
      return 75;
    case "em_andamento":
      return 45;
    default:
      return 0;
  }
}
