import { supabaseAdmin } from "../../src/integrations/supabase/client.server";
const { data } = await supabaseAdmin.from("comprefacil_pacotes").select("nome,raw").eq("ativo",true).limit(300);
let n=0;
for (const p of data ?? []) { const r:any=p.raw;
  if((r.Apartamentos??[]).length && n<2){ n++; console.log(p.nome.slice(0,40), JSON.stringify(r.Apartamentos[0]).slice(0,800)); }
}
const comServ = (data??[]).find((p:any)=> (p.raw.OfflineServicos??[]).length);
console.log("SERV:", comServ? JSON.stringify((comServ as any).raw.OfflineServicos[0]).slice(0,500):"nenhum");
console.log("INCLUI:", JSON.stringify(((data??[])[0] as any).raw.PacotesInclui?.[0]).slice(0,300));
