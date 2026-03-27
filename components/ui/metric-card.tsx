import { Card, CardContent } from "@/components/ui/card";

export function MetricCard({
  title,
  value,
  subtitle
}: {
  title: string;
  value: number | string;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardContent>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">{title}</p>
        <p className="mt-3 text-3xl font-semibold tracking-tight text-text">{value}</p>
        {subtitle ? <p className="mt-1 text-xs text-muted">{subtitle}</p> : null}
      </CardContent>
    </Card>
  );
}
