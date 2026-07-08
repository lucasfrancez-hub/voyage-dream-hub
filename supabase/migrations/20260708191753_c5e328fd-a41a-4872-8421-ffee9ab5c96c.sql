
-- Roles system
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE POLICY "Users can see their own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Packages
CREATE TABLE public.packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  destination TEXT NOT NULL,
  origin TEXT,
  going_date DATE,
  return_date DATE,
  nights INTEGER,
  price_per_person NUMERIC(10,2) NOT NULL,
  taxes NUMERIC(10,2) DEFAULT 0,
  image_url TEXT,
  summary TEXT,
  itinerary TEXT,
  includes TEXT[],
  hotel_name TEXT,
  hotel_stars INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.packages TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.packages TO authenticated;
GRANT ALL ON public.packages TO service_role;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active packages" ON public.packages
  FOR SELECT USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage packages" ON public.packages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Orders
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID REFERENCES public.packages(id) ON DELETE SET NULL,
  package_snapshot JSONB NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  cpf TEXT,
  birth_date DATE,
  adults INTEGER NOT NULL DEFAULT 2,
  children INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL,
  total_price NUMERIC(10,2) NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT INSERT ON public.orders TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can create an order" ON public.orders
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins view all orders" ON public.orders
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update orders" ON public.orders
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete orders" ON public.orders
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER packages_set_updated_at
  BEFORE UPDATE ON public.packages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-grant admin to the FIRST signup (bootstrap)
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- Seed sample packages
INSERT INTO public.packages (slug, title, destination, origin, going_date, return_date, nights, price_per_person, taxes, image_url, summary, itinerary, includes, hotel_name, hotel_stars, sort_order) VALUES
('jalapao-abril-2027', 'Jalapão - Encantos do Jalapão', 'Palmas, TO', 'Rio de Janeiro (RIO)', '2027-04-01', '2027-04-06', 5, 5383.65, 394.70,
 'https://images.unsplash.com/photo-1518684079-3c830dcef090?w=1600',
 'Uma imersão nas paisagens do cerrado: fervedouros, dunas e cachoeiras.',
 E'Dia 1 - Chegada em Palmas e traslado a Ponte Alta\nDia 2 - Fervedouros e Cachoeira da Formiga\nDia 3 - Dunas do Jalapão e Serra do Espírito Santo\nDia 4 - Cachoeira da Velha e Prainha\nDia 5 - Poço Encantado e comunidade Mumbuca\nDia 6 - Retorno',
 ARRAY['Aéreo ida e volta','Hospedagem 5 noites','Traslados','Passeios do roteiro','Seguro viagem'],
 'Pousada Encantos do Jalapão', 3, 1),
('salvador-bahia-outubro', 'Salvador - Bahia', 'Salvador, BA', 'Rio de Janeiro (RIO)', '2027-10-02', '2027-10-07', 5, 2241.69, 173.66,
 'https://images.unsplash.com/photo-1591604129939-f1efa4d9f7fa?w=1600',
 'História, praia e a energia do Pelourinho em 5 noites.',
 E'Dia 1 - Chegada e tarde livre\nDia 2 - City tour histórico\nDia 3 - Praia do Forte\nDia 4 - Ilha de Itaparica\nDia 5 - Compras e gastronomia\nDia 6 - Retorno',
 ARRAY['Aéreo ida e volta','Hospedagem 5 noites','Café da manhã','Traslados','Seguro viagem'],
 'Hotel Deville Prime Salvador', 4, 2),
('gramado-natal-luz-2026', 'Gramado - Natal Luz 2026', 'Gramado, RS', 'Rio de Janeiro (RIO)', '2026-11-11', '2026-11-15', 4, 2687.26, 187.14,
 'https://images.unsplash.com/photo-1607083205541-f8d75b6c9a04?w=1600',
 'Viva a magia do Natal Luz com shows e a decoração icônica de Gramado.',
 E'Dia 1 - Chegada e city tour noturno\nDia 2 - Grande Desfile de Natal\nDia 3 - Nativitaten e Rua Coberta\nDia 4 - Canela e Cascata do Caracol\nDia 5 - Retorno',
 ARRAY['Aéreo ida e volta','Hospedagem 4 noites','Café da manhã','1 ingresso Natal Luz','Seguro viagem'],
 'Hotel Laghetto Stilo Higienópolis', 4, 3),
('nordeste-caribe-brasileiro', 'Maragogi - Caribe Brasileiro', 'Maragogi, AL', 'Rio de Janeiro (RIO)', '2027-02-10', '2027-02-15', 5, 3890.00, 220.00,
 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1600',
 'Piscinas naturais de águas cristalinas e resort pé na areia.',
 E'Dia 1 - Chegada e check-in\nDia 2 - Galés de Maragogi\nDia 3 - Praia do Antunes\nDia 4 - Japaratinga\nDia 5 - Dia livre no resort\nDia 6 - Retorno',
 ARRAY['Aéreo ida e volta','Resort all inclusive 5 noites','Traslados','Seguro viagem'],
 'Salinas Maragogi All Inclusive Resort', 5, 4);
