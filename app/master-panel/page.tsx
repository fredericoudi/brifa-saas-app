import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth";

export default async function MasterPanelAliasPage() {
  await requireSuperAdmin();
  redirect("/platform");
}
