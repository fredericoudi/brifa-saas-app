export function LoadingBlock({ text = "Carregando..." }: { text?: string }) {
  return <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">{text}</div>;
}
