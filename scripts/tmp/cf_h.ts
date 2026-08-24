import { supabaseAdmin } from "../../src/integrations/supabase/client.server";
const { data } = await supabaseAdmin.from("comprefacil_pacotes").select("nome,raw").eq("ativo",true).limit(20);
for (const p of data ?? []) {
  const r:any = p.raw;
  if ((r.PacoteHoteis??[]).length){ console.log(p.nome.slice(0,40)); console.log(" hotel:", JSON.stringify(r.PacoteHoteis[0]).slice(0,900)); console.log(" apto:", JSON.stringify((r.Apartamentos??[])[0]).slice(0,700)); console.log(" serv:", JSON.stringify((r.OfflineServicos??[])[0]).slice(0,400)); break; }
}
