import { chamarCompreFacil } from "../../src/lib/comprefacil/auth.server";
import { supabaseAdmin } from "../../src/integrations/supabase/client.server";
const { data } = await supabaseAdmin.from("comprefacil_pacotes").select("externo_id,nome,raw").eq("ativo",true).limit(3);
for (const p of data ?? []) {
  console.log("PACOTE", p.externo_id, p.nome);
  const raw:any = p.raw;
  console.log(" rawkeys:", Object.keys(raw).join(","));
  const r = await chamarCompreFacil(`/api/pacote/${p.externo_id}`);
  const d:any = r.dados;
  if (r.ok && d) console.log(" detkeys:", Object.keys(d).join(","));
  else console.log(" det falhou", r.status);
}
