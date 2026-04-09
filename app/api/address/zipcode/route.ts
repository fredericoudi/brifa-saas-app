import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizePostalCode } from "@/lib/brazil";

const zipcodeSchema = z.string().trim().min(1);

type ViaCepResponse = {
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  ibge?: string;
  erro?: boolean;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = zipcodeSchema.safeParse(url.searchParams.get("postalCode"));

  if (!parsed.success) {
    return NextResponse.json({ error: "Informe um CEP para consulta." }, { status: 400 });
  }

  const postalCode = normalizePostalCode(parsed.data);
  if (postalCode.length !== 8) {
    return NextResponse.json({ error: "Informe um CEP válido com 8 dígitos." }, { status: 400 });
  }

  const response = await fetch(`https://viacep.com.br/ws/${postalCode}/json/`, {
    headers: { accept: "application/json" }
  });

  if (!response.ok) {
    return NextResponse.json({ error: "Não foi possível consultar o CEP agora." }, { status: 502 });
  }

  const payload = (await response.json()) as ViaCepResponse;
  if (payload.erro) {
    return NextResponse.json({ error: "CEP não encontrado." }, { status: 404 });
  }

  const cityCode = Number(payload.ibge);
  if (!Number.isInteger(cityCode) || cityCode <= 0) {
    return NextResponse.json({ error: "O CEP retornou uma cidade inválida para cobrança." }, { status: 422 });
  }

  return NextResponse.json({
    postalCode,
    address: payload.logradouro ?? "",
    complement: payload.complemento ?? "",
    province: payload.bairro ?? "",
    cityName: payload.localidade ?? "",
    state: payload.uf ?? "",
    cityCode
  });
}
