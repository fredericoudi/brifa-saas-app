import { redirect } from "next/navigation";
import { resolvePlatformPath } from "@/lib/agency-routing";

export default function PlataformAliasPage() {
  redirect(resolvePlatformPath());
}
