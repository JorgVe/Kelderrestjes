# Kelderrestjes

Het menu, de cocktails, de mocktails en de wijnen van de huisbar. Alle gegevens komen uit een Supabase-database; de
beheerder wijzigt ze op de pagina Voorraad (en in Supabase zelf).

```
.
├── index.html, cocktails.html, mocktails.html, wijnen.html, voorraad.html
├── js/
│   ├── supabase-config.js   project-URL + publishable key
│   ├── supabase-client.js   de (alleen-lezen) client voor bezoekers
│   ├── admin.js             beheerder: inloggen (Supabase Auth) en schrijven naar `items`
│   ├── session-badge.js     rechtsboven "Ingelogd als …" met uitloggen, of de knoppen "Inloggen" (venster met e-mail en wachtwoord) en "Registreer als beheerder" (een venster met een foto); toont ook de Voorraad-knop
│   ├── item-dialog.js       het bewerkvenster voor een drank of ingrediënt (gedeeld door voorraad.html en het menu)
│   ├── scanner.js           camera + barcodeherkenning
│   ├── voorraad.js          de beheerpagina: lijst, zoeken, voorraad, toevoegen/wijzigen/verwijderen, fles scannen
│   ├── data-loader.js       haalt de tabellen op en zet ze neer voor de pagina's
│   ├── boot.js              wacht op de gegevens en start dan de paginascripts
│   ├── stock.js             wat op is en welke recepten daardoor vervallen
│   └── cards.js             de kaarten op de cocktail- en mocktailpagina (met het menu-vinkje voor de beheerder)
├── img/loewie.webp          de foto in het venster van "Registreer als beheerder"
└── supabase/
    ├── config.toml          CLI-config
    ├── migrations/          0001 t/m 0015: schema, rechten (RLS) en de gegevenswijzigingen sinds de start
    └── seed.sql             startgegevens voor een nieuw project (wordt niet meer gegenereerd)
```

## Beheer

Bezoekers lezen alleen. Dranken en ingrediënten (de tabel `items`) beheer je op de pagina Voorraad, na het inloggen.
Cocktails, mocktails en wijndetails beheer je in Supabase.

- **Alles is een ingrediënt.** De enige vraag per item is of het ook op het **menu** staat: het vinkje "Zichtbaar in het
  menu" (in het bewerkvenster, en als kolom "In menu" in de lijst). In de database is dat `items.serving`: `both` = op het
  menu, `ingredient` = niet op het menu (de waarde `drink` bestaat niet meer, zie `0010`). Een drank of fles staat
  standaard op het menu, een los ingrediënt niet. Wat niet op het menu staat, blijft gewoon werken in recepten en voorraad.
- **Categorie:** elk item staat in een categorie, of in geen: dan staat het op de voorraadpagina onder **Andere** en nooit op het
  menu (`items.category_id` mag leeg zijn, zie `0015`). Alle sterke drank (likeuren, vodka, gin, jenever, rum, whisky,
  aperitieven) zit in één categorie, **Iets Sterker** (zie `0014`); wat daarvan op het menu staat, bepaalt het vinkje "In menu".
- **Voorraad:** de schakelaar "Op voorraad"/"Op" per item, "Alles op voorraad" per categorie, of "Alles weer op voorraad" na het
  boodschappen doen. Of zet `items.in_stock` zelf op `false`. Zo'n drank verdwijnt van het menu en uit de recepten, en elke
  cocktail of mocktail die er niet zonder kan verdwijnt ook.
- **Aantal op voorraad:** `items.quantity` (geheel getal, leeg = onbekend; zie `0016`). Aantal en schakelaar horen bij elkaar:
  de schakelaar op "Op" zet het aantal op 0; een aantal van 0 zet het item op "Op", 1 of meer op "Op voorraad"; een
  schakelaar die weer aan gaat bij aantal 0 maakt er 1 van. Een leeg aantal verandert niets aan de schakelaar. Die koppeling
  zit in de site (`js/admin.js`, `stockPatch`), niet in de database: wie `in_stock` of `quantity` rechtstreeks in Supabase
  wijzigt, moet zelf beide kloppend houden.
- **Alcoholvrij (0%):** frisdrank, koffie en melk zijn altijd alcoholvrij en krijgen daarom geen label: hun categorie heeft
  `categories.alcoholic = false` en hun items hebben geen `zero_proof`. Alleen drank in een categorie met alcohol
  (`alcoholic = true`) kan 0% zijn (bier 0.0). De voorraadpagina toont en bewaart die optie dus alleen daar, en de loader
  toont 0% nooit bij een categorie met `alcoholic = false`. Het oude veld `alcohol_level` (de tekst achter een categorienaam)
  wordt nergens meer gelezen of getoond; zie `0011` voor de regel om de kolom ook echt te verwijderen.
- **Barcode:** `items.barcode` (uniek, mag leeg), voor het scannen van een fles.
- **Recepten en wijnen:** de tabellen `recipes`, `recipe_bottles`, `recipe_lines` en `wines`, in Supabase. Een nieuwe wijn
  staat pas op het menu en de wijnpagina als er een rij in `wines` bij staat.

## Menu en recepten

- **Menu (`index.html`):** de dranken staan per categorie, van alcoholvrij naar sterk, eindigend met **Iets Sterker**
  (sterke drank en likeur die je puur drinkt: Amaretto, Licor 43, Pomocello, Soplica, Filliers, de whisky's). Een categorie
  zonder zichtbare dranken verschijnt niet. Er is geen kop of toelichting boven de dranken: het menu begint meteen met de
  eerste categorie.
- **Categorieën als banden:** elke categorie (en Mocktails en Cocktails) is een gekleurde band over de hele breedte van het
  scherm, met de naam groot erboven en zonder tellers. Op een breed scherm (vanaf 960 px) staat links een index die
  meescrolt, boven de banden, en markeert waar je bent; op een smal scherm doet de zwevende chipbalk bovenaan dat. Een klik
  springt naar die plek.
- **Welke cocktails en mocktails op het menu staan:** alleen die met het vinkje "Op het menu" (`recipes.on_menu`). De
  cocktail- en mocktailpagina tonen ze **allemaal**; onder de lijst op het menu staat een link "Alle cocktails →" (en
  "Alle mocktails →") naar die pagina. Ook bij de dranken ("Cocktails: …") staan alleen recepten die op het menu staan. De beheerder
  zet het vinkje per recept op de cocktail- of mocktailpagina; het is meteen opgeslagen. Nu staan de bekendste op het menu
  (12 cocktails, 5 mocktails, zie `0013`).
- **Een cocktail of mocktail aanklikken** (in de lijst of bij een drank) opent een venster met omschrijving, ingrediënten
  met hoeveelheden, bereiding en een knop naar het online recept. Met ctrl/cmd-klik of in een nieuw tabblad is het
  gewoon een link naar de cocktail- of mocktailpagina.
- **Beheerder:** wie ingelogd is (in hetzelfde tabblad) kan op het menu een drank aanklikken: dan opent
  hetzelfde bewerkvenster als op de voorraadpagina. Wat op is blijft dan zichtbaar, gedimd, zodat je het terug kunt zetten.
  Bezoekers zien hier niets van.
- **Cocktail- en mocktailpagina:** tonen alle beschikbare kaarten, ook die niet op het menu staan; er is geen filter op fles
  of drank en geen navigatie bovenaan; wel een vaste balk met "← Terug naar het menu" die blijft staan bij het scrollen
  (onderaan staan ook nog de knoppen). Voor de beheerder heeft elke kaart het vinkje "Op het menu".

## Inloggen

Rechtsboven staat op elke pagina een blokje. Ingelogd toont het "Ingelogd als …" met een knop om uit te loggen. Anders staan
er twee knoppen:

- **Inloggen** opent een venster met e-mailadres en wachtwoord (een gewoon formulier, dus je wachtwoordmanager of browser
  kan het invullen). Na het inloggen ga je naar de pagina Voorraad. Het formulier staat vanaf het laden van de pagina in
  de DOM, in een dicht venster, zodat wachtwoordmanagers het herkennen.
- **Registreer als beheerder** doet niets echts: het opent een venster met een foto en de melding "Ask our admin Loewie for
  access." (aanmelden voor nieuwe gebruikers staat uit, zie Rechten).

De pagina Voorraad heeft zelf geen inlogformulier meer. Open je die zonder sessie (of loopt je sessie af), dan opent
hetzelfde inlogvenster, met een melding als je sessie verlopen is. **De knop Voorraad in de navigatie is er alleen voor een
ingelogde beheerder.** De sessie staat in `sessionStorage` en verdwijnt als je het tabblad sluit.

## Pagina Voorraad

Beheerpagina voor dranken en ingrediënten (eerder "Ingrediënten", daarna even "Stock"). Inloggen gaat met een
Supabase-account (e-mailadres en wachtwoord) dat in de tabel `admins` staat, via de knop Inloggen rechtsboven.

- **De lijst:** één tabel, met per categorie een kopregel (naam, hoeveel er op voorraad is en "Alles op voorraad"). Items
  zonder categorie staan onderaan onder **Andere**, ook als filterkeuze. Per item: de schakelaar Op voorraad / Op (een echte
  schakelaar: groene baan met de knop rechts is aan, grijs met de knop links is "Op"), de naam met de labels 0% en optioneel,
  het **aantal** (een invulveld; opgeslagen zodra je het veld verlaat of op Enter drukt), het vinkje "In menu", trefwoord en
  andere namen, en de knop Bewerken. Barcode, notitie en het aantal recepten staan niet in de lijst; die zie je in het
  bewerkvenster. De werkbalk en de kolomkoppen blijven staan bij het scrollen. Op een smal scherm wordt elke rij een kaartje.
- **Zoeken en filteren:** op naam, trefwoord, andere namen, notitie of barcode (accenten maken niet uit); op Alles / Op
  voorraad / Op; en per categorie.
- **Toevoegen, bewerken, verwijderen** van een item: naam, categorie (of "Andere (geen categorie)": dan kan het item niet op het
  menu en is het menu-vinkje uit), aantal op voorraad, trefwoord, andere namen, notitie, barcode, en de
  vinkjes in het menu, op voorraad, alcoholvrij en optioneel. Bij een bestaand item staat rechts in het venster een lijst
  met de cocktails en mocktails waarin het voorkomt. Na zo'n wijziging laadt de pagina opnieuw, zodat
  alles klopt. Verwijderen kan niet bij een fles die in een recept zit (de database bewaakt dat) en kan niet ongedaan worden
  gemaakt. Wie de naam of het trefwoord van een item wijzigt, kan receptregels loskoppelen: recepten herkennen items daaraan.
  De kolom `items.to_confirm` (te bevestigen) wordt door de site niet meer getoond of bewerkt; de kolom staat nog in de
  database.

Het scherm zelf is alleen een voorportaal: de gegevens zijn publiek leesbaar via de Supabase-API (dat moet, want het menu
gebruikt ze), en wie mag schrijven bepaalt de database, niet de pagina.

### Een fles scannen

De knop **Scan fles** opent de camera van je telefoon (of laptop). Richt hem op de barcode:

- Staat de barcode al bij een drank, dan opent die drank: de voorraad wisselen, bewerken, of "Scan volgende".
- Een nieuwe barcode koppel je één keer aan een drank (kies uit de lijst) of aan een nieuwe drank; daarna werkt hij altijd.
- Werkt de camera niet (geen toestemming, geen https), dan kun je de barcode intypen.

De camera werkt alleen op een **beveiligde (https) pagina**, of op `localhost`. Herkenning gaat met de ingebouwde
`BarcodeDetector` van de browser (Chrome op Android); heeft de browser die niet (zoals Safari op een iPhone), dan wordt bij het
eerste scannen de bibliotheek [barcode-detector](https://github.com/Sec-ant/barcode-detector) (MIT, vastgezet op een versie)
van jsDelivr gehaald. Een barcode wordt pas herkend als hij twee keer achter elkaar hetzelfde wordt gelezen.

## Opzetten

Gedaan voor het project `kelderrestjes` (eu-central-1, `aspjeliatfudrcjcfidi`); `js/supabase-config.js` is ingevuld.

1. Maak een project op [supabase.com](https://supabase.com/dashboard).
2. Open de **SQL editor** en voer achter elkaar uit de schemamigraties `0001_init.sql`, `0002_item_serving.sql`,
   `0009_item_barcode.sql`, `0011_categories_alcoholic.sql`, `0012_recipe_on_menu.sql`, `0015_items_without_category.sql`
   en `0016_item_quantity.sql`, en dan `seed.sql`. (Bij een bestaande database: draai `0016` **voordat** je de nieuwe site
   uitrolt; de site haalt de kolom `quantity` op en geeft zonder die kolom op elke pagina een fout.) De overige migraties (`0003` t/m `0008`, `0010` en `0014`) zijn gegevenswijzigingen die de seed al bevat; ze zijn alleen nodig voor een
   database die met een oudere seed is gevuld. `0013` kiest welke recepten op het menu staan; draai die na de seed als je
   hetzelfde menu wilt (anders staan alle recepten op het menu). De seed stopt als de database al gevuld is, zodat de
   voorraad nooit per ongeluk wordt overschreven.
3. Vul `js/supabase-config.js` in met de URL en de publishable key (Project Settings → API).
4. Open de site via een webserver, bijvoorbeeld `npx serve .` (bestanden direct openen werkt niet).

Er is geen aparte tool meer die de seed genereert: de database is de bron, en `seed.sql` is gewoon een bestand met
startgegevens.

## Rechten

- **Lezen** mag iedereen met de publishable key (die staat bewust in de pagina).
- **Schrijven** mag alleen een ingelogde gebruiker die in de tabel `admins` staat (de policies in `0001_init.sql`). Met
  alleen de publishable key, zonder login, wordt elke schrijfpoging geweigerd (HTTP 401).
- **Beheerder toevoegen:** maak de gebruiker in het Supabase-dashboard (Authentication → Users → Add user, met "Auto
  Confirm User"), en voeg het ID toe in de SQL editor:
  `insert into public.admins (user_id) values ('<user-id>');`
- **Aanmelden is uit** (Authentication → Sign In / Providers → "Allow new users to sign up"). Zet dat niet aan. Dat is ook
  waarom "Registreer als beheerder" niet echt registreert: het toont alleen een melding.
- De secret/service_role key hoort nooit in de site of in deze repo.

## Tabellen

| Tabel | Wat erin staat |
|---|---|
| `categories` | de groepen op het menu (`label`, `kind`, `alcoholic`, `sort_order`), onder meer "Iets Sterker" voor alle sterke drank, plus "Voorraad" voor de ingrediënten die niet op het menu staan |
| `items` | dranken, flessen en ingrediënten: naam, categorie (mag leeg: "Andere"), `serving` (op het menu of niet), trefwoord, andere namen, notitie, `barcode`, `in_stock`, `quantity` (aantal op voorraad) en de vinkjes |
| `recipes` | cocktails, mocktails en puur-serves (`kind`: cocktail, mocktail, solo), met `on_menu` (staat ook op het menu) |
| `recipe_bottles` | welke items bij een recept horen |
| `recipe_lines` | de receptregels (hoeveelheid en ingrediënt) |
| `wines` | wijndetails, hangt aan een item |
| `admins` | wie mag schrijven (alleen via de SQL editor te beheren) |
