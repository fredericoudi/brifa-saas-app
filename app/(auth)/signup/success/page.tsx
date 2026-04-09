import { BrifaFavicon } from "@/components/layout/brifa-favicon";
import { SignupSuccessContent } from "@/components/commercial/signup-success-content";
import { normalizePublicSignupPlanSlug } from "@/lib/commercial-signup";

export default function SignupSuccessPage({
  searchParams
}: {
  searchParams: {
    agency?: string;
    plan?: string;
  };
}) {
  const plan = normalizePublicSignupPlanSlug(searchParams.plan) ?? "start";

  return (
    <>
      <BrifaFavicon />
      <SignupSuccessContent plan={plan} agencySlug={searchParams.agency} />
    </>
  );
}
