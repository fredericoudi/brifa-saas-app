import { PlatformShell } from "@/components/platform/platform-shell";
import { requireSuperAdmin, resolveProfileHomePath } from "@/lib/auth";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireSuperAdmin();
  const agencyHomePath = await resolveProfileHomePath(profile);

  return (
    <PlatformShell profileName={profile.name} profileEmail={profile.email} agencyHomePath={agencyHomePath}>
      {children}
    </PlatformShell>
  );
}
