-- De categorie "Wijn & bubbels" heet voortaan "Wijn".
-- Draai dit NADAT de nieuwe site is uitgerold: de nieuwe site herkent beide namen, maar de oude site herkent alleen
-- "Wijn & bubbels" en zou de wijn dan als gewone dranken tonen in plaats van als de lijst met soorten. Veilig om vaker te draaien.
update public.categories set label = 'Wijn' where label = 'Wijn & bubbels';
