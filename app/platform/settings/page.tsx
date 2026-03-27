import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function PlatformSettingsPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Configurações da Plataforma</h2>
          <p className="mt-1 text-sm text-muted">Parâmetros operacionais do SaaS e convenções do painel master.</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-panelAlt/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Rota oficial</p>
              <p className="mt-2 text-sm font-medium text-text">/platform</p>
              <p className="mt-1 text-sm text-muted">
                Os caminhos antigos do master podem redirecionar, mas o ponto oficial do super admin é este.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-panelAlt/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Permissão canônica</p>
              <div className="mt-2">
                <Badge variant="danger">platform_role = super_admin</Badge>
              </div>
              <p className="mt-2 text-sm text-muted">
                Esse campo é o padrão único para liberar o acesso ao layout e às rotas do painel master.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
