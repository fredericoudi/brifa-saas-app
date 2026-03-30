import { redirect } from "next/navigation";
import { resolvePlatformLoginPath } from "@/lib/agency-routing";

export default function LoginPage({
  searchParams
}: {
  searchParams: { next?: string; error?: string };
}) {
  const params = new URLSearchParams();

  if (searchParams.next?.trim()) {
    params.set("next", searchParams.next.trim());
  }

  if (searchParams.error?.trim()) {
    params.set("error", searchParams.error.trim());
  }

  const query = params.toString();
  const destination = resolvePlatformLoginPath();
  redirect(query ? `${destination}?${query}` : destination);
}
