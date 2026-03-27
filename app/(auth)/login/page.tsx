import { redirect } from "next/navigation";

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
  redirect(query ? `/?${query}` : "/");
}
