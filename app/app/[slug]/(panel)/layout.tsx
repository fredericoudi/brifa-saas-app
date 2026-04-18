import { renderAgencyShellBySlug } from "@/features/agency-panel/server/agency-shell";

export default async function AgencyScopedProtectedLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  return renderAgencyShellBySlug(params.slug, children);
}
