-- Opruimen van categorieën en wijn. Verandert bestaande gegevens: lees dit eerst door. Draai na 0020 (de koppelingen met receptregels).
--
-- 1. Ongebruikte categorieën verdwijnen: elke categorie waar geen enkel item in zit (behalve die voor ingrediënten). Nu zijn dat
--    Aperitieven & port, Likeuren, Vodka, gin & jenever, Rum en Whisky, die sinds 0014 leeg zijn.
--
-- 2. Eén notitie bij wijn. Een wijn had twee notities: items.note en wines.note. Voortaan geldt overal items.note (de notitie in het
--    bewerkvenster, die ook op de wijnpagina staat). Waar wines.note is ingevuld, neemt items.note die over: de wijnpagina blijft dus
--    tonen wat er nu staat. De oude waarde van items.note wordt daarbij vervangen; die stond in de meeste gevallen al in soort,
--    regio of alcohol ("Wit", "Bordeaux", "Wit, 12,5%"). De kolom wines.note blijft staan maar wordt niet meer gebruikt.
--
-- 3. Wijn staat standaard niet in cocktails (items.in_cocktails = false), behalve wijn die al in een receptregel is gekoppeld
--    (nu Cava of prosecco en Crémant, voor Kir Royale, French 75 en dergelijke): die blijven aan, anders verdwijnen die recepten.
--    Wil je die ook uit cocktails halen, zet dan in het bewerkvenster "Gebruiken in cocktails" uit.
--
-- Veilig om vaker te draaien.

delete from public.categories c
where c.kind <> 'ingredient'
  and not exists (select 1 from public.items i where i.category_id = c.id);

update public.items i
set note = w.note
from public.wines w
where w.item_id = i.id
  and w.note is not null and btrim(w.note) <> ''
  and i.note is distinct from w.note;

update public.items i
set in_cocktails = false
from public.categories c
where c.id = i.category_id
  and c.label in ('Wijn', 'Wijn & bubbels')
  and i.in_cocktails
  and not exists (select 1 from public.recipe_line_items li where li.item_id = i.id);
