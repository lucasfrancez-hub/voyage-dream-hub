ALTER TABLE public.chat_app_links
ADD COLUMN destino text NOT NULL DEFAULT 'chat'
CHECK (destino IN ('chat', 'admin'));

CREATE INDEX idx_chat_app_links_destino
ON public.chat_app_links(destino, created_at);