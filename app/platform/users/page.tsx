import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/utils";

export default async function PlatformUsersPage() {
  const admin = createAdminSupabaseClient();
  const [{ data: users }, { data: agencies }] = await Promise.all([
    admin.from("users").select("id, name, email, role, platform_role, agency_id, created_at").order("created_at", { ascending: false }),
    admin.from("agencies").select("id, name, slug")
  ]);

  const agencyMap = new Map((agencies ?? []).map((agency) => [agency.id, agency]));
  const userList = users ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Usuários da plataforma</h2>
          <p className="mt-1 text-sm text-muted">Visão global de acesso por agência e do perfil de plataforma.</p>
        </CardHeader>
        <CardContent>
          {userList.length === 0 ? (
            <p className="text-sm text-muted">Nenhum usuário encontrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[980px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                    <th className="py-2">Nome</th>
                    <th className="py-2">E-mail</th>
                    <th className="py-2">Agência</th>
                    <th className="py-2">Role da agência</th>
                    <th className="py-2">Role da plataforma</th>
                    <th className="py-2">Criado em</th>
                  </tr>
                </thead>
                <tbody>
                  {userList.map((user) => {
                    const agency = agencyMap.get(user.agency_id);

                    return (
                      <tr key={user.id} className="border-b border-border/70">
                        <td className="py-3 font-medium text-text">{user.name}</td>
                        <td className="py-3 text-muted">{user.email}</td>
                        <td className="py-3 text-muted">{agency ? `${agency.name} (/${agency.slug})` : "Sem agência"}</td>
                        <td className="py-3">
                          <Badge variant={user.role === "admin" ? "brand" : "neutral"}>
                            {user.role === "admin" ? "Admin" : "Member"}
                          </Badge>
                        </td>
                        <td className="py-3">
                          <Badge variant={user.platform_role === "super_admin" ? "danger" : "neutral"}>
                            {user.platform_role === "super_admin" ? "Super Admin" : "Usuário normal"}
                          </Badge>
                        </td>
                        <td className="py-3 text-muted">{formatDate(user.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
