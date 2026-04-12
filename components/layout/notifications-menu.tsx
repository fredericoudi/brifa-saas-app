"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { AgencyNotificationItem } from "@/lib/notifications";
import { cn } from "@/lib/utils";

function formatNotificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

const toneClassMap: Record<AgencyNotificationItem["tone"], string> = {
  info: "bg-brand",
  warning: "bg-amber-500",
  danger: "bg-rose-500"
};

export function NotificationsMenu({
  notifications,
  readStateKey,
  avatarName,
  avatarUrl,
  avatarUpdatedAt
}: {
  notifications: AgencyNotificationItem[];
  readStateKey: string;
  avatarName: string;
  avatarUrl: string | null;
  avatarUpdatedAt?: string;
}) {
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [hasLoadedReadState, setHasLoadedReadState] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const storageKey = `app.notifications.read:${readStateKey}`;

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    setHasLoadedReadState(false);
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setReadIds([]);
        setHasLoadedReadState(true);
        return;
      }

      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        setReadIds(parsed.filter((value): value is string => typeof value === "string"));
      } else {
        setReadIds([]);
      }
    } catch {
      setReadIds([]);
    }
    setHasLoadedReadState(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hasLoadedReadState) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(readIds));
    } catch {
      // Ignora falha de persistência local.
    }
  }, [hasLoadedReadState, readIds, storageKey]);

  function markNotificationsAsRead(ids: string[]) {
    if (ids.length === 0) return;
    setReadIds((current) => {
      const next = new Set(current);
      for (const id of ids) {
        next.add(id);
      }
      return [...next];
    });
  }

  const readSet = useMemo(() => new Set(readIds), [readIds]);
  const unreadCount = useMemo(
    () => notifications.reduce((total, notification) => total + (readSet.has(notification.id) ? 0 : 1), 0),
    [notifications, readSet]
  );
  const visibleNotifications = useMemo(() => notifications.slice(0, 10), [notifications]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="inline-flex items-center gap-2"
        aria-label="Abrir notificações"
        onClick={() =>
          setOpen((prev) => {
            const nextOpen = !prev;
            if (nextOpen) {
              markNotificationsAsRead(notifications.map((notification) => notification.id));
            }
            return nextOpen;
          })
        }
      >
        <span className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/80 bg-panel text-muted transition hover:bg-panelAlt hover:text-text">
          <Bell className="h-[18px] w-[18px]" />
          {unreadCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </span>
        <UserAvatar
          name={avatarName}
          avatarUrl={avatarUrl}
          updatedAt={avatarUpdatedAt}
          className="h-11 w-11 border-border/80 bg-panelAlt text-sm"
          fallbackClassName="text-sm"
        />
      </button>

      {open ? (
        <div className="absolute right-0 top-12 z-50 w-[22rem] overflow-hidden rounded-[24px] border border-border bg-panel shadow-panel">
          <div className="border-b border-border/80 px-4 py-3">
            <p className="text-sm font-semibold text-text">Notificações</p>
            <p className="text-xs text-muted">Atualizações da sua pauta e prazos</p>
          </div>

          {visibleNotifications.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted">Sem notificações no momento.</div>
          ) : (
            <div className="max-h-[22rem] overflow-y-auto">
              {visibleNotifications.map((notification, index) => (
                <Link
                  key={notification.id}
                  href={notification.path}
                  onClick={() => {
                    markNotificationsAsRead([notification.id]);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3 transition hover:bg-panelAlt",
                    index > 0 ? "border-t border-border/70" : ""
                  )}
                >
                  <span className={cn("mt-1 h-2.5 w-2.5 rounded-full", toneClassMap[notification.tone])} />
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-text">{notification.title}</p>
                    <p className="line-clamp-3 text-xs text-muted">{notification.message}</p>
                    <p className="text-[11px] text-muted">{formatNotificationTime(notification.createdAt)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
