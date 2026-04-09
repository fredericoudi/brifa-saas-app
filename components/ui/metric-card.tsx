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
    <Card className="h-full">
      <CardContent className="min-h-[148px]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">{title}</p>
        <p className="mt-4 text-[2.2rem] font-semibold leading-none tracking-tight text-text">{value}</p>
        {subtitle ? <p className="mt-2 text-sm text-muted">{subtitle}</p> : null}
      </CardContent>
    </Card>
  );
}
