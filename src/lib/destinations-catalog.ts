export type CatalogCity = { city: string; country: string };

/** Catálogo global de cidades para autocomplete de destino (cidade, país). */
export const CITY_CATALOG: CatalogCity[] = [
  // Brasil
  { city: "Aracaju", country: "Brasil" },
  { city: "Balneário Camboriú", country: "Brasil" },
  { city: "Belém", country: "Brasil" },
  { city: "Belo Horizonte", country: "Brasil" },
  { city: "Bonito", country: "Brasil" },
  { city: "Brasília", country: "Brasil" },
  { city: "Búzios", country: "Brasil" },
  { city: "Campos do Jordão", country: "Brasil" },
  { city: "Curitiba", country: "Brasil" },
  { city: "Florianópolis", country: "Brasil" },
  { city: "Fortaleza", country: "Brasil" },
  { city: "Foz do Iguaçu", country: "Brasil" },
  { city: "Gramado", country: "Brasil" },
  { city: "Ilhéus", country: "Brasil" },
  { city: "João Pessoa", country: "Brasil" },
  { city: "Maceió", country: "Brasil" },
  { city: "Manaus", country: "Brasil" },
  { city: "Natal", country: "Brasil" },
  { city: "Porto Alegre", country: "Brasil" },
  { city: "Porto de Galinhas", country: "Brasil" },
  { city: "Porto Seguro", country: "Brasil" },
  { city: "Recife", country: "Brasil" },
  { city: "Rio de Janeiro", country: "Brasil" },
  { city: "Salvador", country: "Brasil" },
  { city: "São Paulo", country: "Brasil" },
  { city: "Vitória", country: "Brasil" },
  // América do Sul
  { city: "Buenos Aires", country: "Argentina" },
  { city: "Bariloche", country: "Argentina" },
  { city: "Mendoza", country: "Argentina" },
  { city: "El Calafate", country: "Argentina" },
  { city: "Ushuaia", country: "Argentina" },
  { city: "Santiago", country: "Chile" },
  { city: "Valparaíso", country: "Chile" },
  { city: "San Pedro de Atacama", country: "Chile" },
  { city: "Montevidéu", country: "Uruguai" },
  { city: "Punta del Este", country: "Uruguai" },
  { city: "Lima", country: "Peru" },
  { city: "Cusco", country: "Peru" },
  { city: "Bogotá", country: "Colômbia" },
  { city: "Cartagena", country: "Colômbia" },
  { city: "Medellín", country: "Colômbia" },
  { city: "Quito", country: "Equador" },
  { city: "La Paz", country: "Bolívia" },
  { city: "Assunção", country: "Paraguai" },
  // América do Norte / Central / Caribe
  { city: "Orlando", country: "Estados Unidos" },
  { city: "Miami", country: "Estados Unidos" },
  { city: "Nova York", country: "Estados Unidos" },
  { city: "Los Angeles", country: "Estados Unidos" },
  { city: "San Francisco", country: "Estados Unidos" },
  { city: "Las Vegas", country: "Estados Unidos" },
  { city: "Chicago", country: "Estados Unidos" },
  { city: "Boston", country: "Estados Unidos" },
  { city: "Washington", country: "Estados Unidos" },
  { city: "Seattle", country: "Estados Unidos" },
  { city: "Honolulu", country: "Estados Unidos" },
  { city: "Toronto", country: "Canadá" },
  { city: "Vancouver", country: "Canadá" },
  { city: "Montreal", country: "Canadá" },
  { city: "Cancún", country: "México" },
  { city: "Cidade do México", country: "México" },
  { city: "Playa del Carmen", country: "México" },
  { city: "Punta Cana", country: "República Dominicana" },
  { city: "Havana", country: "Cuba" },
  { city: "Aruba", country: "Aruba" },
  { city: "Curaçao", country: "Curaçao" },
  { city: "Nassau", country: "Bahamas" },
  { city: "San José", country: "Costa Rica" },
  { city: "Cidade do Panamá", country: "Panamá" },
  // Europa
  { city: "Lisboa", country: "Portugal" },
  { city: "Porto", country: "Portugal" },
  { city: "Faro", country: "Portugal" },
  { city: "Funchal", country: "Portugal" },
  { city: "Madri", country: "Espanha" },
  { city: "Barcelona", country: "Espanha" },
  { city: "Sevilha", country: "Espanha" },
  { city: "Valência", country: "Espanha" },
  { city: "Palma de Maiorca", country: "Espanha" },
  { city: "Paris", country: "França" },
  { city: "Nice", country: "França" },
  { city: "Lyon", country: "França" },
  { city: "Roma", country: "Itália" },
  { city: "Milão", country: "Itália" },
  { city: "Veneza", country: "Itália" },
  { city: "Florença", country: "Itália" },
  { city: "Nápoles", country: "Itália" },
  { city: "Londres", country: "Reino Unido" },
  { city: "Edimburgo", country: "Reino Unido" },
  { city: "Dublin", country: "Irlanda" },
  { city: "Amsterdã", country: "Holanda" },
  { city: "Bruxelas", country: "Bélgica" },
  { city: "Berlim", country: "Alemanha" },
  { city: "Munique", country: "Alemanha" },
  { city: "Frankfurt", country: "Alemanha" },
  { city: "Viena", country: "Áustria" },
  { city: "Zurique", country: "Suíça" },
  { city: "Genebra", country: "Suíça" },
  { city: "Praga", country: "República Tcheca" },
  { city: "Budapeste", country: "Hungria" },
  { city: "Varsóvia", country: "Polônia" },
  { city: "Atenas", country: "Grécia" },
  { city: "Santorini", country: "Grécia" },
  { city: "Istambul", country: "Turquia" },
  { city: "Copenhague", country: "Dinamarca" },
  { city: "Estocolmo", country: "Suécia" },
  { city: "Oslo", country: "Noruega" },
  { city: "Helsinque", country: "Finlândia" },
  { city: "Reykjavik", country: "Islândia" },
  // África / Oriente Médio
  { city: "Marrakech", country: "Marrocos" },
  { city: "Cairo", country: "Egito" },
  { city: "Cidade do Cabo", country: "África do Sul" },
  { city: "Joanesburgo", country: "África do Sul" },
  { city: "Dubai", country: "Emirados Árabes" },
  { city: "Abu Dhabi", country: "Emirados Árabes" },
  { city: "Doha", country: "Catar" },
  { city: "Tel Aviv", country: "Israel" },
  // Ásia / Oceania
  { city: "Tóquio", country: "Japão" },
  { city: "Osaka", country: "Japão" },
  { city: "Quioto", country: "Japão" },
  { city: "Seul", country: "Coreia do Sul" },
  { city: "Pequim", country: "China" },
  { city: "Xangai", country: "China" },
  { city: "Hong Kong", country: "China" },
  { city: "Bangkok", country: "Tailândia" },
  { city: "Phuket", country: "Tailândia" },
  { city: "Bali", country: "Indonésia" },
  { city: "Cingapura", country: "Cingapura" },
  { city: "Kuala Lumpur", country: "Malásia" },
  { city: "Maldivas", country: "Maldivas" },
  { city: "Sydney", country: "Austrália" },
  { city: "Melbourne", country: "Austrália" },
  { city: "Auckland", country: "Nova Zelândia" },
];

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export type DestinationSuggestion = {
  /** valor usado na busca (nome da cidade) */
  value: string;
  city: string;
  country?: string;
  registered: boolean;
};

/** Combina destinos cadastrados no banco com o catálogo global. */
export function buildDestinationSuggestions(
  query: string,
  registered: string[],
  limit = 8,
): DestinationSuggestion[] {
  const q = normalize(query);
  const seen = new Set<string>();
  const out: DestinationSuggestion[] = [];

  const push = (s: DestinationSuggestion) => {
    const key = normalize(s.city);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };

  const registeredSet = new Set(registered.map((r) => normalize(r)));

  for (const r of registered) {
    if (!q || normalize(r).includes(q)) {
      const match = CITY_CATALOG.find((c) => normalize(c.city) === normalize(r));
      push({ value: r, city: r, country: match?.country, registered: true });
    }
  }

  for (const c of CITY_CATALOG) {
    if (out.length >= limit * 3) break;
    const hay = normalize(`${c.city} ${c.country}`);
    if (!q || hay.includes(q)) {
      push({
        value: c.city,
        city: c.city,
        country: c.country,
        registered: registeredSet.has(normalize(c.city)),
      });
    }
  }

  return out.slice(0, limit);
}
