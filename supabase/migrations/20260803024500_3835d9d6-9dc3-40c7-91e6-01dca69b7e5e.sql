CREATE TABLE public.wa_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nome text NOT NULL,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  edges jsonb NOT NULL DEFAULT '[]'::jsonb,
  versao integer NOT NULL DEFAULT 1,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_flows TO authenticated;
GRANT ALL ON public.wa_flows TO service_role;

ALTER TABLE public.wa_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipe autenticada gerencia fluxos"
  ON public.wa_flows FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER wa_flows_updated_at
  BEFORE UPDATE ON public.wa_flows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.wa_flows (slug, nome, descricao, ativo, versao, nodes, edges) VALUES (
  'roteamento-atendimento',
  'Fluxo de Atendimento',
  'Direcionamento correto desde o primeiro contato. Este mapa é lido pelas IAs em tempo real.',
  true,
  1,
  '[
    {"id":"contato","type":"fluxo","position":{"x":420,"y":0},"data":{"titulo":"1º contato do cliente","tipo":"inicio","setor":null,"descricao":"Cliente inicia a conversa no WhatsApp.","keywords":[]}},
    {"id":"sem_especificacao","type":"fluxo","position":{"x":140,"y":140},"data":{"titulo":"Sem especificação","tipo":"condicao","setor":"consultoria","descricao":"Cliente ainda não informou o que precisa. Atendimento inicial é da Consultoria.","keywords":["oi","ola","bom dia","boa tarde","boa noite","informacao","tudo bem"]}},
    {"id":"ja_informou","type":"fluxo","position":{"x":700,"y":140},"data":{"titulo":"Cliente já informou","tipo":"condicao","setor":null,"descricao":"Necessidade identificada já na primeira mensagem. Atendimento conforme a necessidade.","keywords":[]}},
    {"id":"identificar","type":"fluxo","position":{"x":420,"y":280},"data":{"titulo":"Identificar a necessidade","tipo":"condicao","setor":null,"descricao":"O que o cliente está buscando?","keywords":[]}},
    {"id":"pediu_aereo","type":"fluxo","position":{"x":-120,"y":420},"data":{"titulo":"Pediu aéreo","tipo":"intencao","setor":"aereo","descricao":"Somente passagem aérea.","keywords":["passagem","passagens","aereo","voo","voos","bilhete aereo","trecho aereo","ida e volta","so ida","bate volta","viajar de aviao"]}},
    {"id":"pediu_hotel","type":"fluxo","position":{"x":110,"y":420},"data":{"titulo":"Pediu hotel","tipo":"intencao","setor":"comercial","descricao":"Hospedagem avulsa.","keywords":["hotel","hoteis","hospedagem","pousada","resort","diaria","apart"]}},
    {"id":"pediu_carro","type":"fluxo","position":{"x":340,"y":420},"data":{"titulo":"Pediu carro","tipo":"intencao","setor":"comercial","descricao":"Locação de veículo.","keywords":["carro","aluguel de carro","locacao de carro","alugar carro","locadora"]}},
    {"id":"pediu_seguro","type":"fluxo","position":{"x":570,"y":420},"data":{"titulo":"Pediu seguro","tipo":"intencao","setor":"comercial","descricao":"Seguro viagem.","keywords":["seguro","seguro viagem","assistencia viagem","cobertura"]}},
    {"id":"pediu_pacote","type":"fluxo","position":{"x":800,"y":420},"data":{"titulo":"Pediu pacote","tipo":"intencao","setor":"consultoria","descricao":"Pacote de viagem (aéreo + hotel, roteiro, ferias).","keywords":["pacote","pacotes","aereo mais hotel","aereo + hotel","viagem completa","roteiro","ferias","lua de mel","excursao","all inclusive","disney","orlando"]}},
    {"id":"outras","type":"fluxo","position":{"x":1040,"y":420},"data":{"titulo":"Outras solicitações","tipo":"intencao","setor":"comercial","descricao":"Serviços, traslados, ingressos, cruzeiros e outros.","keywords":["ingresso","ingressos","cruzeiro","navio","transfer","traslado","passeio","passeios","city tour","parque","servico"]}},
    {"id":"setor_aereo","type":"fluxo","position":{"x":-120,"y":580},"data":{"titulo":"Setor Aéreo (Paula ou Bruno)","tipo":"setor","setor":"aereo","descricao":"Atende APENAS passagens aéreas. Nunca trata pacote, hotel, carro ou seguro.","keywords":[]}},
    {"id":"aereo_extra","type":"fluxo","position":{"x":-160,"y":740},"data":{"titulo":"Pedido adicional durante o aéreo","tipo":"regra","setor":"comercial","descricao":"Se durante o atendimento aéreo o cliente pedir hotel, seguro, carro, serviço, pacote ou outra coisa, transferir para o Comercial (pacote passa antes pelos Consultores).","keywords":["hotel","seguro","carro","servico","pacote"]}},
    {"id":"consultoria_pacote","type":"fluxo","position":{"x":800,"y":580},"data":{"titulo":"Consultoria procura pacote pronto","tipo":"acao","setor":"consultoria","descricao":"O Consultor entende a necessidade e busca pacote pronto compatível.","keywords":[]}},
    {"id":"existe_pacote","type":"fluxo","position":{"x":690,"y":740},"data":{"titulo":"Existe pacote pronto","tipo":"condicao","setor":"consultoria","descricao":"Consultoria apresenta as opções ao cliente.","keywords":[]}},
    {"id":"nao_existe_pacote","type":"fluxo","position":{"x":950,"y":740},"data":{"titulo":"Não existe pacote pronto ou quer personalizar","tipo":"condicao","setor":"comercial","descricao":"Vai para o Comercial montar proposta personalizada.","keywords":["personalizar","montar do meu jeito","sob medida","customizado"]}},
    {"id":"comercial","type":"fluxo","position":{"x":420,"y":920},"data":{"titulo":"Comercial","tipo":"setor","setor":"comercial","descricao":"Responsável por hotéis, carros, seguros, serviços, pacotes personalizados e outras solicitações.","keywords":[]}}
  ]'::jsonb,
  '[
    {"id":"e1","source":"contato","target":"sem_especificacao","label":""},
    {"id":"e2","source":"contato","target":"ja_informou","label":""},
    {"id":"e3","source":"sem_especificacao","target":"identificar","label":""},
    {"id":"e4","source":"ja_informou","target":"identificar","label":""},
    {"id":"e5","source":"identificar","target":"pediu_aereo","label":""},
    {"id":"e6","source":"identificar","target":"pediu_hotel","label":""},
    {"id":"e7","source":"identificar","target":"pediu_carro","label":""},
    {"id":"e8","source":"identificar","target":"pediu_seguro","label":""},
    {"id":"e9","source":"identificar","target":"pediu_pacote","label":""},
    {"id":"e10","source":"identificar","target":"outras","label":""},
    {"id":"e11","source":"pediu_aereo","target":"setor_aereo","label":""},
    {"id":"e12","source":"setor_aereo","target":"aereo_extra","label":"pediu outra coisa"},
    {"id":"e13","source":"aereo_extra","target":"comercial","label":""},
    {"id":"e14","source":"pediu_hotel","target":"comercial","label":""},
    {"id":"e15","source":"pediu_carro","target":"comercial","label":""},
    {"id":"e16","source":"pediu_seguro","target":"comercial","label":""},
    {"id":"e17","source":"outras","target":"comercial","label":""},
    {"id":"e18","source":"pediu_pacote","target":"consultoria_pacote","label":""},
    {"id":"e19","source":"consultoria_pacote","target":"existe_pacote","label":"sim"},
    {"id":"e20","source":"consultoria_pacote","target":"nao_existe_pacote","label":"nao"},
    {"id":"e21","source":"nao_existe_pacote","target":"comercial","label":""}
  ]'::jsonb
);