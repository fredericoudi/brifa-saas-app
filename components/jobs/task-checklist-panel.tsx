"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  getTaskChecklistProgress,
  normalizeTaskChecklistItems,
  type TaskChecklistItem
} from "@/lib/task-checklist";

type TaskChecklistPanelProps = {
  taskId: string;
  initialItems: unknown;
  editable?: boolean;
  className?: string;
  listClassName?: string;
  itemTextClassName?: string;
  emptyStateClassName?: string;
};

function toggleChecklist(items: TaskChecklistItem[], itemId: string, done: boolean) {
  const timestamp = done ? new Date().toISOString() : null;

  return items.map((item) =>
    item.id === itemId
      ? {
          ...item,
          done,
          completed_at: timestamp
        }
      : item
  );
}

export function TaskChecklistPanel({
  taskId,
  initialItems,
  editable = true,
  className,
  listClassName,
  itemTextClassName,
  emptyStateClassName
}: TaskChecklistPanelProps) {
  const [items, setItems] = useState<TaskChecklistItem[]>(() => normalizeTaskChecklistItems(initialItems));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setItems(normalizeTaskChecklistItems(initialItems));
  }, [initialItems]);

  const progress = useMemo(() => getTaskChecklistProgress(items), [items]);

  async function handleToggle(itemId: string, done: boolean) {
    if (!editable || saving) return;

    const previousItems = items;
    const nextItems = toggleChecklist(items, itemId, done);

    setItems(nextItems);
    setSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/tasks/${taskId}/checklist`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ items: nextItems })
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        items?: unknown;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível atualizar o checklist.");
      }

      setItems(normalizeTaskChecklistItems(payload.items ?? nextItems));
    } catch (toggleError) {
      setItems(previousItems);
      setError(toggleError instanceof Error ? toggleError.message : "Não foi possível atualizar o checklist.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn("mt-3 rounded-xl border border-border/70 bg-panelAlt/60 p-3", className)}>
      <div className="flex items-center justify-between text-xs text-muted">
        <p className="font-semibold uppercase tracking-wide">Checklist</p>
        <p className="font-semibold">
          {progress.completed}/{progress.total} • {progress.percent}%
        </p>
      </div>

      <div className="mt-2 h-2 rounded-full bg-border/70">
        <span className="block h-2 rounded-full bg-brand transition-all duration-200" style={{ width: `${progress.percent}%` }} />
      </div>

      {items.length > 0 ? (
        <ul className={cn("mt-3 space-y-1", listClassName)}>
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={item.done}
                disabled={!editable || saving}
                onChange={(event) => {
                  void handleToggle(item.id, event.target.checked);
                }}
                className="h-4 w-4 shrink-0 rounded border border-border bg-white accent-[hsl(var(--brand))] disabled:cursor-not-allowed disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => {
                  void handleToggle(item.id, !item.done);
                }}
                disabled={!editable || saving}
                className={cn(
                  "min-w-0 text-left transition disabled:cursor-not-allowed disabled:opacity-60",
                  item.done ? "text-muted line-through" : "text-text",
                  itemTextClassName
                )}
              >
                {item.text}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={cn("mt-3 text-xs text-muted", emptyStateClassName)}>Nenhum item de checklist nesta tarefa.</p>
      )}

      {error ? <p className="mt-3 text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
