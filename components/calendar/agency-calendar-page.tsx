"use client";

import { ChevronDown, ChevronLeft, ChevronRight, Star } from "lucide-react";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getHours,
  isSameDay,
  isSameMonth,
  parseISO,
  setDate,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths
} from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import { Select } from "@/components/ui/select";
import { cn, TASK_STATUS_LABEL } from "@/lib/utils";

export type AgencyCalendarTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string;
  dueTime: string | null;
  createdAt: string | null;
  progressPercent: number;
  checklistTotal: number;
  checklistCompleted: number;
  clientId: string | null;
  clientName: string | null;
  assigneeIds: string[];
  assigneeNames: string[];
  jobId: string;
  jobCode: string;
  jobTitle: string;
};

type SelectOption = {
  id: string;
  name: string;
};

type ViewMode = "daily" | "weekly" | "monthly";

const VIEW_MODE_LABEL: Record<ViewMode, string> = {
  daily: "Diária",
  weekly: "Semanal",
  monthly: "Mensal"
};

const STATUS_OPTIONS = [
  { value: "todos", label: "Status" },
  { value: "a_fazer", label: "A Fazer" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "revisao", label: "Revisão" },
  { value: "concluido", label: "Concluído" }
] as const;

const GRID_START_HOUR = 7;
const GRID_END_HOUR = 19;

function capitalize(text: string) {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatMonthTitle(date: Date) {
  return capitalize(
    new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric"
    }).format(date)
  );
}

function formatWeekday(date: Date) {
  return capitalize(
    new Intl.DateTimeFormat("pt-BR", {
      weekday: "long"
    }).format(date)
  );
}

function formatShortWeekday(date: Date) {
  return capitalize(
    new Intl.DateTimeFormat("pt-BR", {
      weekday: "short"
    })
      .format(date)
      .replace(".", "")
  );
}

function formatTimeLabel(hour: number) {
  return `${String(hour).padStart(2, "0")}h`;
}

function getTaskDate(task: Pick<AgencyCalendarTask, "dueDate" | "dueTime">) {
  const timePart = task.dueTime?.slice(0, 5) || "09:00";
  return parseISO(`${task.dueDate}T${timePart}:00`);
}

function getTaskHour(task: Pick<AgencyCalendarTask, "dueDate" | "dueTime">) {
  return getHours(getTaskDate(task));
}

function getCalendarWindowDays(selectedDate: Date) {
  return Array.from({ length: 5 }, (_, index) => addDays(selectedDate, index - 2));
}

function getWeeklyRange(date: Date) {
  return {
    start: startOfWeek(date, { weekStartsOn: 1 }),
    end: endOfWeek(date, { weekStartsOn: 1 })
  };
}

function getProgressDots(progressPercent: number) {
  if (progressPercent <= 0) return 0;
  if (progressPercent >= 100) return 4;
  return Math.max(1, Math.min(4, Math.ceil(progressPercent / 25)));
}

function getStatusColors(status: string) {
  switch (status) {
    case "em_andamento":
      return {
        accent: "bg-brand",
        soft: "bg-[#eef1ff]",
        subtle: "bg-brand/12",
        ring: "border-brand/45",
        text: "text-brand"
      };
    case "revisao":
      return {
        accent: "bg-[#f59e0b]",
        soft: "bg-[#fff4df]",
        subtle: "bg-[#f59e0b]/12",
        ring: "border-[#f59e0b]/45",
        text: "text-[#d97706]"
      };
    case "concluido":
      return {
        accent: "bg-[#55c36f]",
        soft: "bg-[#e9f8ee]",
        subtle: "bg-[#55c36f]/12",
        ring: "border-[#55c36f]/45",
        text: "text-[#2f9c4b]"
      };
    default:
      return {
        accent: "bg-[#d4d4d8]",
        soft: "bg-[#f5f5f7]",
        subtle: "bg-[#d4d4d8]/25",
        ring: "border-[#d4d4d8]",
        text: "text-[#7a7a86]"
      };
  }
}

function CalendarEventCard({ task }: { task: AgencyCalendarTask }) {
  const colors = getStatusColors(task.status);

  return (
    <div className={cn("flex h-full min-h-0 w-full flex-col justify-between p-3", colors.soft)}>
      <span className={cn("block h-[7px] w-10 rounded-full", colors.accent)} />
      <div className="mt-2 min-h-0 space-y-1">
        <p className="line-clamp-2 text-[13px] font-semibold leading-[1.25] text-text">{task.title}</p>
        <p className="line-clamp-1 text-[11px] text-muted">
          {task.clientName ?? task.jobTitle}
        </p>
        <p className="text-[11px] text-muted">{task.dueTime?.slice(0, 5) || "09:00"}</p>
      </div>
    </div>
  );
}

function SummaryTaskCard({ task }: { task: AgencyCalendarTask }) {
  const colors = getStatusColors(task.status);
  const dots = getProgressDots(task.progressPercent);

  return (
    <div className="rounded-[24px] border border-border/70 bg-white px-5 py-4 shadow-[0_16px_32px_-28px_rgba(15,23,42,0.28)]">
      <div className="flex items-start gap-4">
        <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full border bg-white", colors.ring)}>
          <Star className={cn("h-5 w-5 fill-current", colors.text)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-muted">
            {task.dueTime?.slice(0, 5) || "09:00"} - {task.assigneeNames[0] ?? "Sem responsável"}
          </p>
          <p className="mt-1 text-[1rem] font-semibold leading-tight text-text">{task.title}</p>
          <p className="mt-1 text-sm text-muted">
            {task.clientName ?? task.jobCode}
          </p>
          <div className="mt-3 flex items-center gap-1.5">
            {Array.from({ length: 4 }, (_, index) => (
              <span
                key={`${task.id}-dot-${index}`}
                className={cn(
                  "h-3 w-3 rounded-full transition",
                  index < dots ? colors.accent : "bg-[#d8d8dc]"
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AgencyCalendarPage({
  tasks,
  users,
  clients,
  isAdmin,
  currentUserId
}: {
  tasks: AgencyCalendarTask[];
  users: SelectOption[];
  clients: SelectOption[];
  isAdmin: boolean;
  currentUserId: string;
}) {
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [assigneeFilter, setAssigneeFilter] = useState<string>(isAdmin ? "todos" : currentUserId);
  const [clientFilter, setClientFilter] = useState<string>("todos");
  const [dayPickerOpen, setDayPickerOpen] = useState(false);
  const dayPickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!dayPickerRef.current) return;
      if (dayPickerRef.current.contains(event.target as Node)) return;
      setDayPickerOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const filteredTasks = useMemo(() => {
    return tasks
      .filter((task) => {
        if (statusFilter !== "todos" && task.status !== statusFilter) return false;
        if (assigneeFilter !== "todos" && !task.assigneeIds.includes(assigneeFilter)) return false;
        if (clientFilter !== "todos" && task.clientId !== clientFilter) return false;
        return true;
      })
      .sort((a, b) => getTaskDate(a).getTime() - getTaskDate(b).getTime());
  }, [assigneeFilter, clientFilter, statusFilter, tasks]);

  const calendarWindowDays = useMemo(() => getCalendarWindowDays(selectedDate), [selectedDate]);
  const timeSlots = useMemo(
    () => Array.from({ length: GRID_END_HOUR - GRID_START_HOUR + 1 }, (_, index) => GRID_START_HOUR + index),
    []
  );

  const calendarCells = useMemo(() => {
    const map = new Map<string, AgencyCalendarTask[]>();

    for (const task of filteredTasks) {
      const taskDate = getTaskDate(task);
      const inWindow = calendarWindowDays.some((day) => isSameDay(day, taskDate));
      if (!inWindow) continue;

      const taskHour = Math.max(GRID_START_HOUR, Math.min(GRID_END_HOUR, getTaskHour(task)));
      const key = `${format(taskDate, "yyyy-MM-dd")}-${taskHour}`;
      const list = map.get(key) ?? [];
      list.push(task);
      map.set(key, list);
    }

    return map;
  }, [calendarWindowDays, filteredTasks, timeSlots]);

  const summaryTasks = useMemo(() => {
    if (viewMode === "daily") {
      return filteredTasks.filter((task) => isSameDay(getTaskDate(task), selectedDate));
    }

    if (viewMode === "weekly") {
      const { start, end } = getWeeklyRange(selectedDate);
      return filteredTasks.filter((task) => {
        const taskDate = getTaskDate(task);
        return taskDate >= start && taskDate <= end;
      });
    }

    const monthStart = startOfMonth(selectedDate);
    const monthEnd = endOfMonth(selectedDate);
    return filteredTasks.filter((task) => {
      const taskDate = getTaskDate(task);
      return taskDate >= monthStart && taskDate <= monthEnd;
    });
  }, [filteredTasks, selectedDate, viewMode]);

  const summaryHeading =
    viewMode === "daily" ? "Tarefas do dia" : viewMode === "weekly" ? "Tarefas da semana" : "Tarefas do mês";

  const selectedMonthDays = useMemo(
    () => eachDayOfInterval({ start: startOfMonth(selectedDate), end: endOfMonth(selectedDate) }),
    [selectedDate]
  );

  const isToday = isSameDay(selectedDate, new Date());

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="rounded-[34px] bg-white p-4 shadow-[0_22px_44px_-34px_rgba(15,23,42,0.4)] md:p-6">
          <div className="rounded-full bg-[#ececec] p-1.5 shadow-[inset_0_1px_2px_rgba(15,23,42,0.08)]">
            <div className="grid gap-2 lg:grid-cols-3">
              <Select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-12 rounded-full border-border/70 bg-white shadow-none"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>

              <Select
                value={assigneeFilter}
                onChange={(event) => setAssigneeFilter(event.target.value)}
                className="h-12 rounded-full border-border/70 bg-white shadow-none"
              >
                <option value="todos">Responsável</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </Select>

              <Select
                value={clientFilter}
                onChange={(event) => setClientFilter(event.target.value)}
                className="h-12 rounded-full border-border/70 bg-white shadow-none"
              >
                <option value="todos">Cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="mt-7 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <h2 className="text-[2rem] font-semibold leading-none text-text">{formatMonthTitle(selectedDate)}</h2>

            <div className="flex flex-wrap items-center gap-3 xl:ml-auto">
              <div className="inline-flex rounded-full bg-[#efefef] p-1.5 shadow-[inset_0_1px_2px_rgba(15,23,42,0.08)]">
                {(Object.keys(VIEW_MODE_LABEL) as ViewMode[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setViewMode(option)}
                    className={cn(
                      "inline-flex min-w-[92px] items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition",
                      viewMode === option ? "bg-white text-text shadow-sm" : "text-muted hover:text-text"
                    )}
                  >
                    {VIEW_MODE_LABEL[option]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 overflow-x-auto">
            <div className="min-w-[860px]">
              <div className="grid grid-cols-[72px_repeat(5,minmax(0,1fr))] items-end gap-x-0">
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedDate((current) => addDays(current, -1))}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f3f3f6] text-muted transition hover:text-text"
                    aria-label="Dia anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedDate((current) => addDays(current, 1))}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand/10 text-brand transition hover:bg-brand hover:text-white"
                    aria-label="Próximo dia"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                {calendarWindowDays.map((day) => {
                  const selected = isSameDay(day, selectedDate);

                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() => setSelectedDate(day)}
                      className="px-3 py-4 text-center transition hover:bg-panelAlt/40"
                    >
                      <p className={cn("text-[1.1rem] font-semibold", selected ? "text-brand" : "text-text")}>
                        {format(day, "dd")}
                      </p>
                      <p className={cn("mt-2 text-sm", selected ? "font-semibold text-brand" : "text-muted")}>
                        {formatWeekday(day)}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 max-h-[620px] overflow-y-auto pr-2">
                <div className="grid grid-cols-[72px_repeat(5,minmax(0,1fr))] gap-x-0">
                  <div className="pt-2">
                    {timeSlots.map((hour) => (
                      <div key={`label-${hour}`} className="flex h-24 items-start pt-1 text-sm font-medium text-muted">
                        {formatTimeLabel(hour)}
                      </div>
                    ))}
                  </div>

                  {calendarWindowDays.map((day) => (
                    <div key={`column-${day.toISOString()}`} className="border-l border-border/70 first:border-l-0">
                      {timeSlots.map((hour) => {
                        const key = `${format(day, "yyyy-MM-dd")}-${hour}`;
                        const items = calendarCells.get(key) ?? [];
                        const [primaryTask] = items;

                        return (
                          <div
                            key={key}
                            className="relative h-24 min-h-24 border-t border-border/70 bg-white"
                          >
                            {primaryTask ? <CalendarEventCard task={primaryTask} /> : null}
                            {items.length > 1 ? (
                              <span className="absolute right-2 top-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white/90 px-1 text-[10px] font-semibold text-text">
                                +{items.length - 1}
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-5">
          <div ref={dayPickerRef} className="relative">
            <button
              type="button"
              onClick={() => setDayPickerOpen((current) => !current)}
              className="flex w-full items-center justify-between rounded-[16px] bg-brand px-6 py-5 text-left text-white shadow-[0_24px_44px_-30px_hsl(var(--brand)/0.95)]"
            >
              <div className="flex items-center gap-5">
                <span className="text-[3.9rem] font-semibold leading-none">{format(selectedDate, "dd")}</span>
                <div className="min-w-0">
                  <p className="text-[0.95rem] font-medium text-white/70">{isToday ? "Hoje" : formatMonthTitle(selectedDate)}</p>
                  <p className="truncate whitespace-nowrap text-[1.1rem] font-semibold leading-tight">{formatWeekday(selectedDate)}</p>
                </div>
              </div>
              <ChevronDown className={cn("h-5 w-5 transition", dayPickerOpen ? "rotate-180" : "")} />
            </button>

            {dayPickerOpen ? (
              <div className="absolute top-[calc(100%+12px)] z-20 w-full rounded-[24px] border border-border bg-white p-3 shadow-[0_24px_44px_-32px_rgba(15,23,42,0.42)]">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedDate((current) => subMonths(current, 1))}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-panelAlt text-muted transition hover:text-text"
                    aria-label="Mês anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <p className="text-sm font-semibold text-text">{formatMonthTitle(selectedDate)}</p>
                  <button
                    type="button"
                    onClick={() => setSelectedDate((current) => addMonths(current, 1))}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-panelAlt text-muted transition hover:text-text"
                    aria-label="Próximo mês"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto pr-1">
                  {selectedMonthDays.map((day) => (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() => {
                        setSelectedDate(startOfDay(day));
                        setDayPickerOpen(false);
                      }}
                      className={cn(
                        "rounded-[16px] px-3 py-2 text-left transition",
                        isSameDay(day, selectedDate)
                          ? "bg-brand text-white"
                          : "bg-panelAlt text-text hover:bg-brand/10 hover:text-brand"
                      )}
                    >
                      <span className="block text-lg font-semibold">{format(day, "dd")}</span>
                      <span className={cn("mt-1 block text-xs", isSameDay(day, selectedDate) ? "text-white/80" : "text-muted")}>
                        {formatShortWeekday(day)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-[30px] bg-white p-5 shadow-[0_22px_44px_-34px_rgba(15,23,42,0.4)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[1.3rem] font-semibold text-text">{summaryHeading}</p>
                <p className="mt-1 text-sm text-muted">
                  {summaryTasks.length} {summaryTasks.length === 1 ? "tarefa encontrada" : "tarefas encontradas"}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {summaryTasks.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-border px-5 py-8 text-center text-sm text-muted">
                  Nenhuma tarefa encontrada para esse recorte.
                </div>
              ) : (
                summaryTasks.map((task) => <SummaryTaskCard key={`summary-${task.id}`} task={task} />)
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
