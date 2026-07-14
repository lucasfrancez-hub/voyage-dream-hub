import { createFileRoute } from "@tanstack/react-router";
import { findAirline } from "@/lib/airlines";

/**
 * Normaliza nome/IATA da companhia usando o catálogo cadastrado.
 * "Latam Airlines Brasil" / "LA" → { airline: "LATAM", airline_iata: "LA" }.
 * Também deriva IATA a partir do prefixo do flight_number (ex.: "LA 3059").
 */
function normalizeAirlineFields(parsed: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...parsed };
  const isSystemName = (value: string) => /travel\s*link|travellink|sky\s*team|infotravel|infotera|visual\s*turismo|\bfrt\b/i.test(value);

  // supplier_name (nível pedido)
  const supplierRaw = typeof out.supplier_name === "string" ? out.supplier_name : "";
  const supplierHit = findAirline(supplierRaw);
  if (supplierHit) out.supplier_name = supplierHit.name;
  else if (isSystemName(supplierRaw)) delete out.supplier_name;

  const flights = Array.isArray(out.flights) ? (out.flights as Array<Record<string, unknown>>) : [];
  let firstRealAirline: string | undefined;
  for (const block of flights) {
    const blockAirlineRaw = typeof block.airline === "string" ? block.airline : "";
    const blockHit = findAirline(blockAirlineRaw);
    if (blockHit) block.airline = blockHit.name;
    else if (isSystemName(blockAirlineRaw)) delete block.airline;

    const segs = Array.isArray(block.segments) ? (block.segments as Array<Record<string, unknown>>) : [];
    for (const seg of segs) {
      const rawAirline = typeof seg.airline === "string" ? seg.airline : "";
      const rawIata = typeof seg.airline_iata === "string" ? seg.airline_iata.toUpperCase() : "";
      const flightNum = typeof seg.flight_number === "string" ? seg.flight_number : "";
      const flightPrefix = flightNum.match(/^([A-Z0-9]{2})\s/)?.[1] ?? "";

      // Tenta encontrar na ordem: IATA da segment → prefixo do flight_number → nome
      const hit = findAirline(rawIata) ?? findAirline(flightPrefix) ?? findAirline(rawAirline);
      if (hit) {
        seg.airline = hit.name;
        seg.airline_iata = hit.iata;
        firstRealAirline ??= hit.name;
      } else if (flightPrefix && !rawIata) {
        seg.airline_iata = flightPrefix;
      }
    }
  }
  if (!out.supplier_name && firstRealAirline) out.supplier_name = firstRealAirline;
  return out;
}



// Endpoint público chamado pela extensão do navegador rodando na página
// da companhia aérea. A autenticação é feita pelo próprio TOKEN gerado
// no admin (`createImportToken`): quem tem o token pode gravar naquele
// pedido. O token vive por 2 h e é consumido depois da conferência.
//
// Body: { token, airline_hint, source_url, raw_text }

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
} as const;

const SYSTEM_PROMPT = `Você é um extrator de reservas aéreas. Recebe o TEXTO
VISÍVEL de uma página de reserva aérea (às vezes vinda de dentro de um
<iframe>, marcada como "===== FRAME: ... =====") e/ou CAPTURAS DE TELA da
página — pode ser uma companhia brasileira (LATAM, GOL, AZUL) OU um portal de
consolidador/operador (SkyTeam/Travellink, FRT/Infotravel, Visual Turismo/
Infotera) — e devolve JSON estruturado com passageiros e voos.

ATENÇÃO — nome da companhia (LEIA COM CUIDADO):
- "Travellink", "SkyTeam", "FRT", "Infotravel", "Infotera", "Visual Turismo"
  são SISTEMAS/consolidadores, NUNCA companhia aérea. Não coloque nada disso
  em supplier_name/airline/segments[].airline.
- O texto extraído pode vir com um bloco "===== CABEÇALHO DA RESERVA (metadata)
  =====" contendo linhas do tipo "SISTEMA_GDS: Sabre" e "AMBIENTE_PORTAL:
  Travellink". Esses valores são metadados do portal — IGNORE COMPLETAMENTE
  para escolher a companhia. A cabeçalho ASP.NET dos portais BR tem colunas
  "Localizador | Status | Data de emissão | Criação | Sistema | Ambiente |
  Incluido Via" — as colunas Sistema e Ambiente NÃO são cia aérea.
- A companhia aérea real vem da coluna "Cia" da tabela de VOOS (não da tabela
  de cabeçalho). Se ela não estiver clara, DEDUZA pelo prefixo do número do
  voo: as 2 primeiras letras/dígitos do flight_number SÃO o código IATA da
  cia (G3=GOL, AD=AZUL, LA=LATAM, TP=TAP PORTUGAL, AF=AIR FRANCE, KL=KLM,
  AR=AEROLINEAS, AA=AMERICAN, UA=UNITED, DL=DELTA, IB=IBERIA, LH=LUFTHANSA,
  AV=AVIANCA, CM=COPA, JJ=LATAM, etc.). Preencha airline_iata com esse
  prefixo em TODO segment.
- Cada trecho pode ter cia diferente — preencha por segment.
- supplier_name (nível reserva) = nome comercial da cia principal (a mesma
  do primeiro segmento), NUNCA o nome do portal/consolidador/GDS.
- Se um voo tiver aviso "voo XXXX pertence à companhia Y mas é operado pela
  companhia Z", use Y em airline e coloque Z em notes/aircraft.
- EXEMPLO: reserva com AMBIENTE_PORTAL=Travellink, SISTEMA_GDS=Sabre e voos
  "TP 0074", "TP 0930", "TP 0945" → supplier_name="TAP Portugal",
  cada segment.airline_iata="TP". NUNCA "Travellink" nem "Sabre".

Passageiros:
- Extraia TODOS os passageiros listados (adultos, crianças, bebês). Nunca pare
  no primeiro. Consolidadoras costumam listar cada pax em bloco/tabela
  separada com nome, tipo (ADT/CHD/INF), bilhete (13 dígitos) e tarifa.

Voos:
- Consolidadoras mostram os voos em UMA tabela única com colunas
  Cia | Voo | Saída | Chegada | Origem | Destino | Duração | Status | Equip |
  Escalas | Cabine | Família | Bagagem | Base | Loc Cia. Cada LINHA é um
  segmento — extraia todos, mesmo que estejam sem separação visual de ida/volta.
- Separe VOOS DE IDA (outbound) e VOOS DE VOLTA (return) pela lógica:
  outbound = do início até o destino mais distante; return = de volta até
  a origem inicial. Se houver conexões, cada trecho vira um segment.
- flight_number: formato "G3 1843" / "TP 0074" (código IATA + espaço + número
  sem zeros à esquerda apagados — mantenha como está na página).
- Para cada linha, capture obrigatoriamente quando visível: Cia, Voo, Saída,
  Chegada, Origem, Destino, Duração, Bagagem e "Loc Cia". "Loc Cia" deve ir
  em segments[].carrier_locator; ele não é o ambiente/sistema.
- A seção de bilhetes costuma ficar abaixo dos voos. Percorra o texto inteiro
  e associe cada número de bilhete ao passageiro correto em ticket_number.

Formato:
- Não invente. Se um campo não estiver visível no texto/imagem, omita.
- Datas/horas no formato "YYYY-MM-DDTHH:mm" no horário local do aeroporto.
  Portais BR normalmente usam "DD Mon AAAA HH:MM" ou "DD/MM/AAAA" — converta.
- Códigos IATA sempre em MAIÚSCULAS (3 letras).
- passengers[].kind: "adult" para adultos, "child" criança, "infant" bebê.
- cabin_class: use os rótulos que aparecem (Econômica, Premium, Business,
  "Pre. Busi." → Premium Business).
- locator = código PNR (6 caracteres) da companhia (coluna "Loc Cia"); se
  o portal mostrar só o número de pedido do consolidador, use-o em
  order_number e deixe locator vazio.
- Valores monetários: sempre número (sem "R$", vírgula → ponto).
- Nunca copie CPF/documento — a página normalmente nem mostra.`;


function textParamsSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      supplier_name: { type: "string" },
      locator: { type: "string" },
      order_number: { type: "string" },
      status: { type: "string" },
      notes: { type: "string" },
      currency: { type: "string", description: "Ex.: BRL, USD" },
      total_fare: { type: "number", description: "Total pago (tarifa + taxas + fees)" },
      base_fare: { type: "number" },
      taxes: { type: "number" },
      fees: { type: "number" },
      issued_at: { type: "string", description: "Data de emissão do bilhete (YYYY-MM-DD)" },
      passengers: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            full_name: { type: "string" },
            kind: { type: "string", enum: ["adult", "child", "infant"] },
            ticket_number: { type: "string", description: "13 dígitos, formato 000-0000000000" },
            seat: { type: "string" },
            baggage: { type: "string" },
            fare: { type: "number", description: "Tarifa individual do passageiro" },
            taxes: { type: "number" },
            total: { type: "number" },
          },
          required: ["full_name"],
        },
      },
      flights: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            direction: { type: "string", enum: ["outbound", "return"] },
            airline: { type: "string" },
            segments: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  airline: { type: "string" },
                  airline_iata: { type: "string" },
                  flight_number: { type: "string" },
                  from_iata: { type: "string" },
                  from_city: { type: "string" },
                  from_airport: { type: "string" },
                  from_terminal: { type: "string" },
                  to_iata: { type: "string" },
                  to_city: { type: "string" },
                  to_airport: { type: "string" },
                  to_terminal: { type: "string" },
                  depart_at: { type: "string" },
                  arrive_at: { type: "string" },
                  duration: { type: "string" },
                  layover: { type: "string" },
                  layover_airport: { type: "string" },
                  operating_airline_iata: { type: "string" },
                  cabin_class: { type: "string" },
                  fare_class: { type: "string", description: "Booking class, ex.: Y, K, L" },
                  fare_basis: { type: "string" },
                  baggage_allowance: { type: "string" },
                  carrier_locator: { type: "string", description: "Localizador da companhia aérea (coluna Loc Cia)" },
                  aircraft: { type: "string" },
                  status: { type: "string" },
                },
              },
            },
          },
          required: ["direction", "segments"],
        },
      },
    },
    required: ["passengers", "flights"],
  };
}

export const Route = createFileRoute("/api/public/import-aereo")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        let body: {
          token?: string;
          airline_hint?: string;
          source_url?: string;
          raw_text?: string;
          screenshots?: string[];
          structured_data?: unknown;
        };
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid_json" }, 400);
        }
        const token = String(body.token ?? "").trim();
        const airline = String(body.airline_hint ?? "").toLowerCase();
        const rawText = String(body.raw_text ?? "").slice(0, 120_000);
        const screenshots = Array.isArray(body.screenshots)
          ? body.screenshots.filter((s) => typeof s === "string" && s.startsWith("data:image/")).slice(0, 6)
          : [];
        if (!token || token.length < 10) return json({ error: "invalid_token" }, 400);
        const ALLOWED = ["latam", "gol", "azul", "skyteam", "frt", "visualturismo", "infotera"];
        if (!ALLOWED.includes(airline)) return json({ error: "invalid_airline" }, 400);
        const hasStructuredData = body.structured_data !== null && typeof body.structured_data === "object";
        if (rawText.length < 200 && screenshots.length === 0 && !hasStructuredData) return json({ error: "raw_text_too_short" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: staging, error: loadErr } = await supabaseAdmin
          .from("flight_import_staging")
          .select("token, status, expires_at, order_id")
          .eq("token", token)
          .maybeSingle();
        if (loadErr) return json({ error: "db_error", detail: loadErr.message }, 500);
        if (!staging) return json({ error: "token_not_found" }, 404);
        if (staging.status === "consumed") return json({ error: "already_consumed" }, 409);
        if (new Date(staging.expires_at).getTime() < Date.now()) return json({ error: "token_expired" }, 410);

        // Marca como processando + guarda source_url/raw_text
        await supabaseAdmin.from("flight_import_staging").update({
          status: "pending",
          source_url: body.source_url ?? null,
          raw_text: rawText,
          error: null,
        }).eq("token", token);

        try {
          if (["skyteam", "frt", "visualturismo", "infotera"].includes(airline) && hasStructuredData) {
            const direct = normalizeDirectStructuredData(body.structured_data);
            const parsed = normalizeAirlineFields(direct);
            await supabaseAdmin.from("flight_import_staging").update({
              status: "ready", parsed: parsed as never, error: null,
            }).eq("token", token);
            return json({ ok: true }, 200);
          }

          const apiKey = process.env.LOVABLE_API_KEY;
          if (!apiKey) return json({ error: "ai_key_missing" }, 500);

          const userContent: Array<
            | { type: "text"; text: string }
            | { type: "image_url"; image_url: { url: string } }
          > = [
            { type: "text", text:
              `Origem: ${airline.toUpperCase()}\nURL: ${body.source_url ?? ""}\n\n` +
              (screenshots.length > 0
                ? `Você recebe ${screenshots.length} captura(s) de tela da página (do topo pra baixo) E o texto extraído do DOM. Priorize o que aparece nas IMAGENS quando texto e imagem divergirem — os portais de consolidador renderizam tabelas complexas que se perdem no texto.\n\n`
                : "") +
              `TEXTO DA PÁGINA:\n${rawText}` },
            ...screenshots.map((url) => ({ type: "image_url" as const, image_url: { url } })),
          ];
          const aiBody = {
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: userContent },
            ],
            tools: [{
              type: "function",
              function: {
                name: "return_reservation",
                description: "Retorna a reserva estruturada.",
                parameters: textParamsSchema(),
              },
            }],
            tool_choice: { type: "function", function: { name: "return_reservation" } },
          };

          const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Lovable-API-Key": apiKey,
            },
            body: JSON.stringify(aiBody),
          });
          if (!res.ok) {
            const t = await res.text();
            await supabaseAdmin.from("flight_import_staging").update({
              status: "error", error: `AI ${res.status}: ${t.slice(0, 300)}`,
            }).eq("token", token);
            return json({ error: "ai_failed", detail: t.slice(0, 300) }, 502);
          }
          const jr = await res.json() as {
            choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }>; content?: string } }>;
          };
          const args = jr.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments
            ?? jr.choices?.[0]?.message?.content ?? "{}";
          let parsed: Record<string, unknown> = {};
          try { parsed = JSON.parse(args) as Record<string, unknown>; }
          catch {
            const m = args.match(/\{[\s\S]*\}/);
            parsed = m ? (JSON.parse(m[0]) as Record<string, unknown>) : {};
          }
          parsed = normalizeAirlineFields(parsed);


          await supabaseAdmin.from("flight_import_staging").update({
            status: "ready", parsed: parsed as never, error: null,
          }).eq("token", token);

          return json({ ok: true }, 200);
        } catch (e) {
          await supabaseAdmin.from("flight_import_staging").update({
            status: "error", error: (e as Error).message,
          }).eq("token", token);
          return json({ error: "exception", detail: (e as Error).message }, 500);
        }
      },
    },
  },
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

function normalizeDirectStructuredData(input: unknown): Record<string, unknown> {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const passengersSource = Array.isArray(source.passengers) ? source.passengers : [];
  const seenPassengers = new Set<string>();
  const passengers = passengersSource.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const fullName = String(row.full_name ?? "").replace(/\s+/g, " ").trim().slice(0, 180);
    const key = fullName.toLocaleUpperCase("pt-BR");
    if (!fullName || seenPassengers.has(key)) return [];
    seenPassengers.add(key);
    const kind = ["adult", "child", "infant"].includes(String(row.kind)) ? String(row.kind) : "adult";
    const out: Record<string, string> = { full_name: fullName, kind };
    const ticket = String(row.ticket_number ?? "").replace(/\s+/g, " ").trim();
    if (ticket) out.ticket_number = ticket.slice(0, 40);
    return [out];
  });


  const allowedSegmentFields = [
    "airline", "airline_iata", "flight_number", "from_iata", "from_city", "from_airport",
    "from_terminal", "to_iata", "to_city", "to_airport", "to_terminal", "depart_at",
    "arrive_at", "duration", "layover", "layover_airport", "operating_airline_iata",
    "cabin_class", "fare_class", "fare_basis", "baggage_allowance", "carrier_locator",
    "aircraft", "status",
  ];
  const seenSegments = new Set<string>();
  const flightsSource = Array.isArray(source.flights) ? source.flights : [];
  const flights = flightsSource.flatMap((item, blockIndex) => {
    if (!item || typeof item !== "object") return [];
    const block = item as Record<string, unknown>;
    const segmentSource = Array.isArray(block.segments) ? block.segments : [];
    const segments = segmentSource.flatMap((segment) => {
      if (!segment || typeof segment !== "object") return [];
      const row = segment as Record<string, unknown>;
      const clean: Record<string, string> = {};
      for (const field of allowedSegmentFields) {
        if (typeof row[field] === "string" && row[field].trim()) clean[field] = row[field].trim().slice(0, 240);
      }
      const key = [clean.flight_number, clean.from_iata, clean.to_iata, clean.depart_at].join("|").toUpperCase();
      if (!clean.flight_number || !clean.from_iata || !clean.to_iata || !clean.depart_at || seenSegments.has(key)) return [];
      seenSegments.add(key);
      return [clean];
    });
    if (!segments.length) return [];
    return [{
      direction: blockIndex === 0 ? "outbound" : "return",
      airline: typeof block.airline === "string" ? block.airline.slice(0, 120) : undefined,
      segments,
    }];
  });
  return { passengers, flights };
}
