-- Mixers zijn alleen een ingrediënt voor cocktails en mocktails: ze staan niet als drank op het menu.
-- Cola en Sprite blijven 'both' (ook los te drinken); appelsap blijft 'both'. Pas aan in Supabase als je dat anders wilt.
update public.items
set serving = 'ingredient'
where name in ('Tonic', 'Ginger beer', 'Bruiswater', 'Pulco', 'Royal Club', 'Fever-Tree');
