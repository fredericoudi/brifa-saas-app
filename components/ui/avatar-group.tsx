"use client";

import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";

type AvatarGroupUser = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  updatedAt?: string;
};

export function AvatarGroup({
  users,
  max = 4,
  className
}: {
  users: AvatarGroupUser[];
  max?: number;
  className?: string;
}) {
  const visibleUsers = users.slice(0, max);
  const remainingCount = Math.max(0, users.length - visibleUsers.length);

  return (
    <div className={cn("flex items-center", className)}>
      {visibleUsers.map((user, index) => (
        <div key={user.id} className={cn(index > 0 ? "-ml-2.5" : "", "relative")}>
          <UserAvatar
            name={user.name}
            avatarUrl={user.avatarUrl ?? null}
            updatedAt={user.updatedAt}
            className="h-8 w-8 border-2 border-white bg-panel text-[10px]"
            fallbackClassName="text-[10px]"
          />
        </div>
      ))}

      {remainingCount > 0 ? (
        <div className="-ml-2.5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-panelAlt text-[10px] font-semibold text-muted">
          +{remainingCount}
        </div>
      ) : null}
    </div>
  );
}
