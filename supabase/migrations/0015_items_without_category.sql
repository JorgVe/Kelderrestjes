-- Een item mag zonder categorie bestaan. Zo'n item staat op de voorraadpagina onder "Andere" (die groep is geen rij in
-- `categories`, de pagina maakt hem zelf), en nooit op het menu: het menu is opgebouwd uit categorieën.
-- Een categorie met items erin kun je nog steeds niet verwijderen (on delete restrict): verplaats die items eerst.
alter table public.items alter column category_id drop not null;
