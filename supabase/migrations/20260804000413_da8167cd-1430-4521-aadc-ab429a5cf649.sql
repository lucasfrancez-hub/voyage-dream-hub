update public.instagram_conversations c
set contact_username = sub.from_username,
    contact_name = coalesce(c.contact_name, '@' || sub.from_username)
from (
  select distinct on (from_ig_id) from_ig_id, from_username
  from public.instagram_comments
  where from_username is not null
  order by from_ig_id, created_at desc
) sub
where c.contact_ig_id = sub.from_ig_id and c.contact_username is null;

update public.wa_conversations w
set display_name = c.contact_name
from public.instagram_conversations c
where w.wa_phone = 'ig:' || c.contact_ig_id
  and c.contact_name is not null
  and (w.display_name is null or w.display_name like 'Instagram %');