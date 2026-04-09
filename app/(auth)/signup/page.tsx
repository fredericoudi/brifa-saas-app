import { BrifaFavicon } from "@/components/layout/brifa-favicon";
import { PublicSignupForm } from "@/components/commercial/public-signup-form";
import { SignupSuccessContent } from "@/components/commercial/signup-success-content";
import { normalizePublicSignupPlanSlug } from "@/lib/commercial-signup";

export default function SignupPage({
  searchParams
}: {
  searchParams: {
    plan?: string;
    status?: string;
    agency?: string;
  };
}) {
  const plan = normalizePublicSignupPlanSlug(searchParams.plan) ?? "start";
  const checkoutStatus = searchParams.status === "processing" || searchParams.status === "canceled" ? searchParams.status : null;

  return (
    <>
      <BrifaFavicon />
      {checkoutStatus === "processing" ? (
        <SignupSuccessContent plan={plan} agencySlug={searchParams.agency} />
      ) : (
        <PublicSignupForm initialPlan={plan} checkoutStatus={checkoutStatus} />
      )}
    </>
  );
}
