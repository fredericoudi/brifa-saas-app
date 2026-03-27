import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth";

export default async function AdminAliasPage() {
  await requireSuperAdmin();
  redirect("/platform");
}
