import { supabaseAdmin } from "../../src/integrations/supabase/client.server";
const a = await supabaseAdmin.from("comprefacil_pacotes").select("cidade,cidade_id,cidade_saida,ativo").ilike("cidade","%maring%").limit(5);
const b = await supabaseAdmin.from("comprefacil_pacotes").select("cidade_saida").ilike("cidade_saida","%maring%").limit(5);
const c = await supabaseAdmin.from("comprefacil_pacotes").select("cidade,cidade_saida,ativo").limit(5);
const cnt = await supabaseAdmin.from("comprefacil_pacotes").select("id",{count:"exact",head:true});
console.log(JSON.stringify({a:a.data,ea:a.error?.message,b:b.data,c:c.data,total:cnt.count}));
