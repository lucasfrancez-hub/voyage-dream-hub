/**
 * Cliente CalDAV mínimo (Titan Mail / dav.titan.email).
 *
 * Suporta: descoberta de calendários, listagem de eventos por período,
 * criação, edição e exclusão de eventos. Autenticação HTTP Basic.
 *
 * SERVER-ONLY.
 */
import { DOMParser } from "@xmldom/xmldom";

export type CalDavAuth = {
  serverUrl: string;
  username: string;
  password: string;
};

export type CalDavCalendar = {
  url: string;
  nome: string;
};

export type CalDavEvent = {
  uid: string;
  etag: string | null;
  href: string;
  titulo: string;
  descricao: string | null;
  local: string | null;
  detalhes: import("./gcal.server").DetalhesEvento;
  inicio: string; // ISO
  fim: string; // ISO
  diaInteiro: boolean;
  situacao: string;
  rawIcs: string;
};

const TZ_OFFSET = "-03:00"; // fallback: horário de Brasília

function basic(auth: CalDavAuth): string {
  const raw = `${auth.username}:${auth.password}`;
  // btoa é global no runtime do Worker.
  return `Basic ${btoa(unescape(encodeURIComponent(raw)))}`;
}

function absolutize(serverUrl: string, href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  const base = new URL(serverUrl);
  return `${base.origin}${href.startsWith("/") ? "" : "/"}${href}`;
}

async function dav(
  auth: CalDavAuth,
  url: string,
  method: string,
  body: string | null,
  headers: Record<string, string> = {},
): Promise<{ status: number; text: string; etag: string | null }> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: basic(auth),
      ...(body ? { "Content-Type": headers["Content-Type"] ?? 'application/xml; charset="utf-8"' } : {}),
      ...headers,
    },
    body: body ?? undefined,
  });
  const text = await res.text().catch(() => "");
  if (res.status === 401 || res.status === 403) {
    const err = new Error(
      "Login do calendário recusado. Confira o e-mail e a senha (no iCloud é preciso usar uma senha de app).",
    );
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  if (res.status >= 400) {
    const err = new Error(`CalDAV ${method} ${res.status}: ${text.slice(0, 300)}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return { status: res.status, text, etag: res.headers.get("etag") };
}


function parseXml(xml: string): Document {
  return new DOMParser({
    onError: () => {
      /* ignora avisos de namespace do servidor */
    },
  } as never).parseFromString(xml, "text/xml") as unknown as Document;
}

function localName(el: Element): string {
  return (el.localName ?? el.nodeName.replace(/^.*:/, "")).toLowerCase();
}

function findAll(root: Document | Element, name: string): Element[] {
  const out: Element[] = [];
  const walk = (node: Element) => {
    const kids = node.childNodes;
    for (let i = 0; i < kids.length; i += 1) {
      const child = kids[i] as Element;
      if (child.nodeType !== 1) continue;
      if (localName(child) === name) out.push(child);
      walk(child);
    }
  };
  walk((root as Document).documentElement ?? (root as Element));
  return out;
}

function firstText(el: Element, name: string): string | null {
  const found = findAll(el, name)[0];
  return found ? (found.textContent ?? "").trim() || null : null;
}

/**
 * Cada servidor responde o PROPFIND inicial num caminho diferente:
 * o iCloud atende na raiz, o Titan só atende em /principals/.
 * Tentamos os caminhos conhecidos e ficamos com o primeiro que responder.
 */
const CAMINHOS_INICIAIS = ["/principals/", "/", "/.well-known/caldav", "/dav/"];

/** Extrai calendários de uma resposta multistatus de PROPFIND. */
function extrairCalendarios(root: string, xml: string): { calendarios: CalDavCalendar[]; colecoes: string[] } {
  const doc = parseXml(xml);
  const calendarios: CalDavCalendar[] = [];
  const colecoes: string[] = [];
  for (const resp of findAll(doc, "response")) {
    const href = firstText(resp, "href");
    if (!href) continue;
    const url = absolutize(root, href);
    const tipos = findAll(resp, "resourcetype")[0];
    const ehCalendario = tipos ? findAll(tipos, "calendar").length > 0 : false;
    const ehColecao = tipos ? findAll(tipos, "collection").length > 0 : false;
    if (ehCalendario) {
      calendarios.push({ url, nome: firstText(resp, "displayname") ?? "Calendário" });
    } else if (ehColecao) {
      colecoes.push(url);
    }
  }
  return { calendarios, colecoes };
}

const LISTA_XML = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:displayname/></d:prop></d:propfind>`;

async function listarEm(auth: CalDavAuth, root: string, url: string) {
  try {
    const r = await dav(auth, url, "PROPFIND", LISTA_XML, { Depth: "1" });
    return extrairCalendarios(root, r.text);
  } catch {
    return { calendarios: [] as CalDavCalendar[], colecoes: [] as string[] };
  }
}

/** Descobre os calendários da conta. */
export async function listarCalendarios(auth: CalDavAuth): Promise<CalDavCalendar[]> {
  const root = auth.serverUrl.replace(/\/+$/, "");

  // 1) principal
  const principalXml = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/><d:principal-URL/></d:prop></d:propfind>`;

  let p: { text: string } | null = null;
  let ultimoErro: unknown = null;
  for (const caminho of CAMINHOS_INICIAIS) {
    try {
      p = await dav(auth, `${root}${caminho}`, "PROPFIND", principalXml, { Depth: "0" });
      break;
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      // 404/405 = esse caminho não existe nesse servidor; seguimos tentando.
      if (status === 404 || status === 405 || status === 501) {
        ultimoErro = err;
        continue;
      }
      throw err;
    }
  }
  if (!p) {
    throw new Error(
      ultimoErro instanceof Error
        ? `Não consegui falar com o servidor do calendário (${root}). ${ultimoErro.message}`
        : `Não consegui falar com o servidor do calendário (${root}).`,
    );
  }

  // O href do principal está DENTRO de <current-user-principal> (ou <principal-URL>);
  // pegar o primeiro href do documento devolve o caminho da própria requisição.
  const pDoc = parseXml(p.text);
  const bloco = findAll(pDoc, "current-user-principal")[0] ?? findAll(pDoc, "principal-url")[0];
  const principalHref = bloco ? firstText(bloco, "href") : firstText(pDoc.documentElement as unknown as Element, "href");
  const principal = absolutize(root, principalHref ?? "/");

  // 2) calendar-home-set
  const homeXml = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`;
  let home = principal;
  try {
    const h = await dav(auth, principal, "PROPFIND", homeXml, { Depth: "0" });
    const homeSet = findAll(parseXml(h.text), "calendar-home-set")[0];
    const homeHref = homeSet ? firstText(homeSet, "href") : null;
    if (homeHref) home = absolutize(root, homeHref);
  } catch {
    /* sem calendar-home-set: seguimos a partir do principal */
  }

  // 3) candidatos de "home" — alguns servidores (Titan) não expõem calendar-home-set
  const usuario = auth.username;
  const candidatos = Array.from(
    new Set(
      [
        home,
        principal,
        `${root}/calendars/${encodeURIComponent(usuario)}/`,
        `${root}/calendars/`,
        `${root}/dav/${encodeURIComponent(usuario)}/`,
        `${root}/${encodeURIComponent(usuario)}/`,
      ].map((u) => (u.endsWith("/") ? u : `${u}/`)),
    ),
  );

  const encontrados = new Map<string, CalDavCalendar>();
  const paraVarrer: string[] = [];

  for (const url of candidatos) {
    const { calendarios, colecoes } = await listarEm(auth, root, url);
    for (const c of calendarios) encontrados.set(c.url, c);
    paraVarrer.push(...colecoes);
    if (encontrados.size) break;
  }

  // 4) se nada apareceu, desce um nível nas coleções encontradas
  if (!encontrados.size) {
    for (const url of paraVarrer.slice(0, 12)) {
      const { calendarios } = await listarEm(auth, root, url);
      for (const c of calendarios) encontrados.set(c.url, c);
      if (encontrados.size) break;
    }
  }

  return Array.from(encontrados.values());
}

/** Testa credenciais e devolve os calendários disponíveis. */
export async function testarConexao(auth: CalDavAuth): Promise<CalDavCalendar[]> {
  const cals = await listarCalendarios(auth);
  if (!cals.length) {
    throw new Error(
      "Conectou no servidor, mas não consegui listar os calendários dessa conta. " +
        "Confira se o endereço do servidor é o de CalDAV (ex.: https://caldav.titan.email) e se a senha é a do e-mail.",
    );
  }
  return cals;
}


function icsStamp(d: Date): string {
  return `${d.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/** Eventos do calendário dentro de um período. */
export async function buscarEventos(
  auth: CalDavAuth,
  calendarUrl: string,
  de: Date,
  ate: Date,
): Promise<CalDavEvent[]> {
  const body = `<?xml version="1.0" encoding="utf-8" ?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/><c:calendar-data/></d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${icsStamp(de)}" end="${icsStamp(ate)}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;
  const r = await dav(auth, calendarUrl, "REPORT", body, { Depth: "1" });
  const doc = parseXml(r.text);
  const eventos: CalDavEvent[] = [];
  const pendentes: { href: string; etag: string | null }[] = [];

  for (const resp of findAll(doc, "response")) {
    const href = firstText(resp, "href");
    if (!href) continue;
    const url = absolutize(auth.serverUrl, href);
    if (!/\.ics$/i.test(url) && !firstText(resp, "calendar-data")) continue;
    const ics = firstText(resp, "calendar-data");
    const etag = firstText(resp, "getetag");
    const parsed = ics ? parseIcs(ics) : null;
    if (parsed) {
      eventos.push({ ...parsed, href: url, etag, rawIcs: ics! });
    } else if (/\.ics$/i.test(url)) {
      // Titan devolve o REPORT sem o VEVENT: baixamos cada item individualmente.
      pendentes.push({ href: url, etag });
    }
  }

  if (pendentes.length) {
    const lote = pendentes.slice(0, 300);
    const baixados = await Promise.all(
      lote.map(async ({ href, etag }) => {
        try {
          const item = await dav(auth, href, "GET", null, { Accept: "text/calendar" });
          const parsed = parseIcs(item.text);
          return parsed ? { ...parsed, href, etag: etag ?? item.etag, rawIcs: item.text } : null;
        } catch {
          return null;
        }
      }),
    );
    for (const e of baixados) if (e) eventos.push(e);
  }

  // alguns servidores ignoram o time-range: filtramos aqui também
  const ini = de.getTime();
  const fim = ate.getTime();
  return eventos.filter((e) => {
    const a = new Date(e.inicio).getTime();
    const b = new Date(e.fim).getTime();
    return Number.isFinite(a) && Number.isFinite(b) ? b > ini && a < fim : true;
  });
}


type IcsCore = Omit<CalDavEvent, "href" | "etag" | "rawIcs">;

function unfold(ics: string): string[] {
  const linhas = ics.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const linha of linhas) {
    if (/^[ \t]/.test(linha) && out.length) out[out.length - 1] += linha.slice(1);
    else out.push(linha);
  }
  return out;
}

function unescapeIcs(v: string): string {
  return v.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

function parseIcsDate(valor: string, params: string): { iso: string; diaInteiro: boolean } | null {
  const v = valor.trim();
  const diaInteiro = /VALUE=DATE(?!-TIME)/i.test(params) || /^\d{8}$/.test(v);
  if (/^\d{8}$/.test(v)) {
    return { iso: new Date(`${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T00:00:00${TZ_OFFSET}`).toISOString(), diaInteiro: true };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss, z] = m;
  const suffix = z ? "Z" : TZ_OFFSET;
  const date = new Date(`${y}-${mo}-${d}T${hh}:${mm}:${ss}${suffix}`);
  if (Number.isNaN(date.getTime())) return null;
  return { iso: date.toISOString(), diaInteiro };
}

/** Extrai o primeiro VEVENT de um ICS. */
export function parseIcs(ics: string): IcsCore | null {
  const linhas = unfold(ics);
  let dentro = false;
  let dentroAlarme = false;
  const campos: Record<string, { valor: string; params: string }> = {};
  const attendees: Array<{ valor: string; params: string }> = [];
  const alarmes: string[] = [];
  for (const linha of linhas) {
    if (/^BEGIN:VEVENT/i.test(linha)) { dentro = true; continue; }
    if (/^END:VEVENT/i.test(linha)) break;
    if (!dentro) continue;
    if (/^BEGIN:VALARM/i.test(linha)) { dentroAlarme = true; continue; }
    if (/^END:VALARM/i.test(linha)) { dentroAlarme = false; continue; }
    const idx = linha.indexOf(":");
    if (idx < 0) continue;
    const chaveCompleta = linha.slice(0, idx);
    const valor = linha.slice(idx + 1);
    const [chaveBruta, ...params] = chaveCompleta.split(";");
    const chave = chaveBruta.toUpperCase();
    if (dentroAlarme) {
      if (chave === "TRIGGER") alarmes.push(descreverTrigger(valor));
      continue;
    }
    if (chave === "ATTENDEE") { attendees.push({ valor, params: params.join(";") }); continue; }
    campos[chave] = { valor, params: params.join(";") };
  }
  const uid = campos.UID?.valor?.trim();
  const dtstart = campos.DTSTART ? parseIcsDate(campos.DTSTART.valor, campos.DTSTART.params) : null;
  if (!uid || !dtstart) return null;
  let fim = campos.DTEND ? parseIcsDate(campos.DTEND.valor, campos.DTEND.params) : null;
  if (!fim) {
    const dur = new Date(new Date(dtstart.iso).getTime() + (dtstart.diaInteiro ? 86400000 : 3600000));
    fim = { iso: dur.toISOString(), diaInteiro: dtstart.diaInteiro };
  }
  return {
    uid,
    titulo: unescapeIcs(campos.SUMMARY?.valor ?? "(sem título)"),
    descricao: campos.DESCRIPTION ? unescapeIcs(campos.DESCRIPTION.valor) : null,
    local: campos.LOCATION ? unescapeIcs(campos.LOCATION.valor) : null,
    inicio: dtstart.iso,
    fim: fim.iso,
    diaInteiro: dtstart.diaInteiro,
    situacao: (campos.STATUS?.valor ?? "CONFIRMED").toLowerCase(),
    detalhes: {
      url: campos.URL ? campos.URL.valor.trim() : null,
      conferencia:
        campos["X-GOOGLE-CONFERENCE"]?.valor?.trim() ??
        acharLinkReuniao(
          [campos.LOCATION?.valor, campos.DESCRIPTION?.valor, campos["X-APPLE-STRUCTURED-LOCATION"]?.params]
            .filter(Boolean)
            .join(" "),
        ),
      organizador: campos.ORGANIZER ? pessoaIcs(campos.ORGANIZER.valor, campos.ORGANIZER.params, true) : null,
      participantes: attendees.map((a) => pessoaIcs(a.valor, a.params, false)),
      lembretes: alarmes,
      recorrencia: campos.RRULE?.valor ?? null,
      fusoHorario: /TZID=([^;:]+)/i.exec(campos.DTSTART?.params ?? "")?.[1] ?? null,
      visibilidade: campos.CLASS?.valor?.toLowerCase() ?? null,
      disponibilidade: campos.TRANSP?.valor?.toUpperCase() === "TRANSPARENT" ? "livre" : "ocupado",
      calendario: null,
      meuStatus: null,
    },
  };
}

function descreverTrigger(valor: string): string {
  const m = /^-?P?T?(?:(\d+)D)?(?:T?(\d+)H)?(?:(\d+)M)?/i.exec(valor.trim().replace(/^-/, "-"));
  const dias = Number(m?.[1] ?? 0);
  const horas = Number(m?.[2] ?? 0);
  const min = Number(m?.[3] ?? 0);
  const total = dias * 1440 + horas * 60 + min;
  if (!total) return "no horário do compromisso";
  if (total % 1440 === 0) return `${total / 1440} dia(s) antes`;
  if (total % 60 === 0) return `${total / 60}h antes`;
  return `${total} min antes`;
}

function acharLinkReuniao(texto: string): string | null {
  const m = /https?:\/\/(?:meet\.google\.com|[\w.-]*zoom\.us|teams\.(?:microsoft|live)\.com|[\w.-]*whereby\.com)\/\S+/i.exec(texto);
  return m ? m[0].replace(/[)>,.]+$/, "") : null;
}

function pessoaIcs(valor: string, params: string, organizador: boolean) {
  const email = valor.replace(/^mailto:/i, "").trim() || null;
  const nome = /CN=("?)([^";:]+)\1/i.exec(params)?.[2] ?? null;
  const resposta = /PARTSTAT=([^;:]+)/i.exec(params)?.[1]?.toLowerCase() ?? null;
  return { nome, email, resposta, organizador };
}

function escapeIcs(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export type NovoEvento = {
  uid: string;
  titulo: string;
  descricao?: string | null;
  local?: string | null;
  inicio: string; // ISO
  fim: string; // ISO
};

/** Monta o ICS de um evento (sempre em UTC). */
export function montarIcs(ev: NovoEvento): string {
  const agora = icsStamp(new Date());
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VIA AIR//Agenda//PT-BR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${ev.uid}`,
    `DTSTAMP:${agora}`,
    `DTSTART:${icsStamp(new Date(ev.inicio))}`,
    `DTEND:${icsStamp(new Date(ev.fim))}`,
    `SUMMARY:${escapeIcs(ev.titulo)}`,
    ...(ev.descricao ? [`DESCRIPTION:${escapeIcs(ev.descricao)}`] : []),
    ...(ev.local ? [`LOCATION:${escapeIcs(ev.local)}`] : []),
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function hrefDoEvento(calendarUrl: string, uid: string): string {
  return `${calendarUrl.replace(/\/+$/, "")}/${encodeURIComponent(uid)}.ics`;
}

/** Cria ou atualiza um evento no servidor. */
export async function salvarEvento(
  auth: CalDavAuth,
  calendarUrl: string,
  ev: NovoEvento,
  href?: string | null,
): Promise<{ href: string; etag: string | null; ics: string }> {
  const alvo = href || hrefDoEvento(calendarUrl, ev.uid);
  const ics = montarIcs(ev);
  const r = await dav(auth, alvo, "PUT", ics, { "Content-Type": "text/calendar; charset=utf-8" });
  return { href: alvo, etag: r.etag, ics };
}

/** Remove um evento do servidor. */
export async function excluirEvento(auth: CalDavAuth, calendarUrl: string, uid: string, href?: string | null): Promise<void> {
  await dav(auth, href || hrefDoEvento(calendarUrl, uid), "DELETE", null);
}
