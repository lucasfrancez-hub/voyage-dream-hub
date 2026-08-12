/**
 * Imagens próprias da VIA AIR para as regiões/países, no lugar das imagens
 * da fonte de dados.
 */
import brasil from "@/assets/regioes/brasil.jpg";
import europa from "@/assets/regioes/europa.jpg";
import estadosUnidos from "@/assets/regioes/estados-unidos.jpg";
import americaDoSul from "@/assets/regioes/america-do-sul.jpg";
import caribe from "@/assets/regioes/caribe.jpg";
import asia from "@/assets/regioes/asia.jpg";
import africa from "@/assets/regioes/africa.jpg";
import orienteMedio from "@/assets/regioes/oriente-medio.jpg";
import canada from "@/assets/regioes/canada.jpg";
import oceania from "@/assets/regioes/oceania.jpg";
import mexico from "@/assets/regioes/mexico.jpg";
import mundo from "@/assets/regioes/mundo.jpg";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const REGRAS: Array<[RegExp, string]> = [
  [/brasil|nacional/, brasil],
  [/estados unidos|eua|usa/, estadosUnidos],
  [/canada/, canada],
  [/mexico/, mexico],
  [/caribe/, caribe],
  [/america do sul|sul-americ/, americaDoSul],
  [/europa|portugal|italia|franca|espanha|alemanha/, europa],
  [/asia|japao|china|tailandia|maldivas/, asia],
  [/oriente medio|israel|dubai|emirados/, orienteMedio],
  [/africa/, africa],
  [/oceania|australia|zelandia/, oceania],
];

export function imagemRegiao(nome: string): string {
  const n = norm(nome);
  for (const [re, img] of REGRAS) if (re.test(n)) return img;
  return mundo;
}
