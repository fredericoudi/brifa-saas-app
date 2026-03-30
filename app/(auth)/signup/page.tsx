import { BrifaFavicon } from "@/components/layout/brifa-favicon";
import { PublicSignupForm } from "@/components/commercial/public-signup-form";
import { normalizePublicSignupPlanSlug } from "@/lib/commercial-signup";

export default function SignupPage({
  searchParams
}: {
  searchParams: {
    plan?: string;
    status?: string;
  };
}) {
  const plan = normalizePublicSignupPlanSlug(searchParams.plan) ?? "start";
  const checkoutStatus = searchParams.status === "processing" || searchParams.status === "canceled" ? searchParams.status : null;

  return (
    <>
      <BrifaFavicon />
      <PublicSignupForm initialPlan={plan} checkoutStatus={checkoutStatus} />
    </>
  );
}
