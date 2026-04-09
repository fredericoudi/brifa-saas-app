import { redirect } from "next/navigation";
import { resolvePlatformPath } from "@/lib/agency-routing";
import { requireAuth } from "@/lib/auth";

export default async function ConversationSandboxRedirectPage() {
  const { profile } = await requireAuth();

  if (profile.platform_role === "super_admin") {
    redirect(resolvePlatformPath("/conversations/sandbox"));
  }

  redirect("/dashboard");
}
