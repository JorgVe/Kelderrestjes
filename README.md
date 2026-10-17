# Kelderrestjes

De standaardversie van de site haalt zijn gegevens uit een Supabase-database. De oorspronkelijke versie met vaste
lijsten (`drinks.js`) staat ongewijzigd in `legacy/` en is bereikbaar via de knop "Legacy versie" onderaan elke pagina.

```
.
├── index.html, cocktails.html, mocktails.html, wijnen.html, ingredienten.html   de site (Supabase)
├── js/
│   ├── supabase-config.js   project-URL + publishable key
│   ├── supabase-client.js   maakt de (alleen-lezen) client
│   ├── data-loader.js       haalt de tabellen op en maakt dezelfde G, M, R, Z, P, W, OUT als legacy/drinks.js
│   ├── boot.js              wacht op de gegevens en start dan de paginascripts
│   ├── stock.js             wat op is en welke recepten daardoor vervallen
│   └── cards.js             kaartenpagina's (cocktails en mocktails)
├── supabase/
│   ├── config.toml                          CLI-config
│   ├── migrations/0001_init.sql             tabellen, rechten (RLS)
│   ├── migrations/0002_item_serving.sql     drank / ingrediënt / allebei
│   ├── migrations/0003_mixers_ingredient_only.sql   mixers zijn alleen ingrediënt
│   └── seed.sql                             de inhoud van legacy/drinks.js
├── scripts/build-seed.mjs   maakt seed.sql opnieuw uit legacy/drinks.js
└── legacy/                  de oude site met vaste lijsten, werkt zelfstandig
```

## Beheer gebeurt in Supabase

De site leest alleen. Er is geen beheer op de website zelf.

- **Voorraad:** zet `items.in_stock` op `false`. Zo'n drank verdwijnt van het menu, uit de kaarten en chips, en elke
  cocktail of mocktail die er niet zonder kan verdwijnt ook. Het overzicht op de pagina Ingrediënten laat zien wat er op is.
- **Drank, ingrediënt of allebei:** `items.serving`.
  - `drink`: staat op het menu.
  - `ingredient`: alleen een ingrediënt voor cocktails (zoals de mixers); staat niet als drank op het menu.
  - `both`: beide (bijv. cola); staat gewoon op het menu, zonder vermelding van de recepten waarin het zit.
- **Dranken, recepten, wijnen:** de tabellen `items`, `recipes`, `recipe_bottles`, `recipe_lines` en `wines`.

## Pagina Ingrediënten

Een alleen-lezen overzicht voor de beheerder (wat er is, wat op is, welke recepten daardoor vervallen), afgeschermd met
een login: gebruikersnaam en wachtwoord staan als SHA-256-hash in `ingredienten.html`. Let op: dit is een afscherming in
de browser, geen echte beveiliging. De gegevens zelf zijn publiek leesbaar via de Supabase-API (dat moet, want het menu
gebruikt ze).

## Opzetten

Gedaan voor het project `kelderrestjes` (eu-central-1, `aspjeliatfudrcjcfidi`); `js/supabase-config.js` is ingevuld.

1. Maak een project op [supabase.com](https://supabase.com/dashboard).
2. Open de **SQL editor** en voer achter elkaar uit: `0001_init.sql`, `0002_item_serving.sql`, `0003_mixers_ingredient_only.sql`
   (laat die weg als je de seed daarna draait; die bevat al dezelfde waarden), dan `seed.sql`. Bij een nieuw project:
   `0001`, `0002`, `seed.sql`.
3. Vul `js/supabase-config.js` in met de URL en de publishable key (Project Settings → API).
4. Open de site via een webserver, bijvoorbeeld `npx serve .` (bestanden direct openen werkt niet).

## Rechten

- **Lezen** mag iedereen met de publishable key (die staat bewust in de pagina).
- **Schrijven** kan niet via de website of de publishable key. Wijzig data in het Supabase-dashboard (Table Editor of
  SQL editor), dat omzeilt Row Level Security. De secret/service_role key hoort nooit in de site.
- De tabel `admins` en de schrijf-policies uit `0001_init.sql` worden door de site niet gebruikt.

## Tabellen

| Tabel | Vervangt in drinks.js |
|---|---|
| `categories` | `ORDER` en de groepsnamen van `G`/`M` (+ "Ingrediënten") |
| `items` | flessen in `G`, dranken in `M`, `ING`; `in_stock` = niet in `OUT`; `aliases` = `ALIAS` uit stock.js |
| `recipes` | `R` (cocktail), `Z` (mocktail), `P` (solo) |
| `recipe_bottles` | `b` van elk recept |
| `recipe_lines` | `s` van elk recept |
| `wines` | `W` |

## Seed opnieuw maken

De legacy-versie blijft de bron voor de seed. Na een wijziging in `legacy/drinks.js`:

```bash
node scripts/build-seed.mjs
```

`seed.sql` stopt als de database al gevuld is, zodat de voorraad in Supabase nooit per ongeluk wordt overschreven.
