import AgencyAccessPage from "@/app/[slug]/page";

export default function AgencyAccessAliasPage({ params }: { params: { slug: string } }) {
  return <AgencyAccessPage params={params} />;
}
