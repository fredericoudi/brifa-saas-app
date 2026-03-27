export const AGENCY_ROLE_OPTIONS = [
  "Atendimento",
  "Redator",
  "Diretor de Arte",
  "Arte Finalista",
  "Social Media",
  "Tráfego Pago",
  "Planejamento",
  "Desenvolvimento",
  "Motion Designer",
  "Editor de Vídeo",
  "Designer",
  "Produtor",
  "Mídia",
  "Gerente de Projetos",
  "Administrativo",
  "Financeiro",
  "Outro"
] as const;

export type AgencyRoleOption = (typeof AGENCY_ROLE_OPTIONS)[number];

export function isAgencyRoleOption(value: string): value is AgencyRoleOption {
  return AGENCY_ROLE_OPTIONS.includes(value as AgencyRoleOption);
}

export function normalizeAgencyRole(value: string | null | undefined) {
  if (!value) return "Outro";
  return isAgencyRoleOption(value) ? value : "Outro";
}
