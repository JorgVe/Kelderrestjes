-- Welke cocktails en mocktails op het menu staan (recipes.on_menu, zie 0012): de bekendste. Alle recepten blijven op de
-- cocktail- en mocktailpagina staan. Dit is een keuze, geen schema: de beheerder past hem per recept aan op die pagina's.
--   cocktails (12)  Espresso Martini, Old Fashioned, Moscow Mule, Mai Tai, Daiquiri, Cuba Libre, Tom Collins, French 75,
--                   Kir Royale, Amaretto Sour, Dark 'n Stormy, Vesper Martini
--   mocktails (5)   Virgin Moscow Mule, Espresso Tonic, Radler 0.0, Shandy Gaff 0.0, Ginger Lemonade
-- Voor een nieuw project: draai dit na seed.sql als je hetzelfde menu wilt; zonder staan alle recepten op het menu.
-- Veilig om vaker te draaien.
update public.recipes
set on_menu = (name in ('Espresso Martini', 'Old Fashioned', 'Moscow Mule', 'Mai Tai', 'Daiquiri', 'Cuba Libre', 'Tom Collins',
                        'French 75', 'Kir Royale', 'Amaretto Sour', 'Dark ''n Stormy', 'Vesper Martini'))
where kind = 'cocktail';

update public.recipes
set on_menu = (name in ('Virgin Moscow Mule', 'Espresso Tonic', 'Radler 0.0', 'Shandy Gaff 0.0', 'Ginger Lemonade'))
where kind = 'mocktail';
