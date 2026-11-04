-- Alles is een ingrediënt. De enige vraag per item is of het ook op het menu staat.
-- items.serving heeft daarom nog maar twee betekenisvolle waarden:
--   'both'        staat op het menu (en is dus ook een ingrediënt)
--   'ingredient'  staat niet op het menu
-- De waarde 'drink' (alleen drank, geen ingrediënt) bestaat niet meer: op het menu deed ze al hetzelfde als 'both'.
-- De voorraadpagina laat dit zien als het vinkje "Zichtbaar in het menu"; de kolom en de check-constraint blijven zoals ze waren.
-- Veilig om vaker te draaien.
update public.items set serving = 'both' where serving = 'drink';
