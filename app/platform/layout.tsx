import { PlatformShell } from "@/components/platform/platform-shell";
import { requireSuperAdmin } from "@/lib/auth";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireSuperAdmin();

  return (
    <PlatformShell profileName={profile.name} profileEmail={profile.email}>
      {children}
    </PlatformShell>
  );
}
