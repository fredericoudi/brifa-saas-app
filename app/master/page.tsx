import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth";

export default async function LegacyMasterPage() {
  await requireSuperAdmin();
  redirect("/platform");
}
