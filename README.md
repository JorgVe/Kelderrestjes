# Kelderrestjes

Het menu, de cocktails, de mocktails en de wijnen van de huisbar. Alle gegevens komen uit een Supabase-database; de
beheerder wijzigt ze op de pagina Voorraad (en in Supabase zelf).

```
.
├── index.html, cocktails.html, mocktails.html, wijnen.html, voorraad.html, admin.html
├── js/
│   ├── supabase-config.js   project-URL + publishable key
│   ├── supabase-client.js   de (alleen-lezen) client voor bezoekers
│   ├── admin.js             beheerder: inloggen (Supabase Auth) en schrijven naar `items`
│   ├── session-badge.js     rechtsboven "Ingelogd als …" met uitloggen, of de knoppen "Inloggen" (venster met e-mail en wachtwoord) en "Registreer als beheerder" (een venster met een foto); toont ook de knoppen Voorraad en Beheer
│   ├── item-dialog.js       het bewerkvenster voor een drank of ingrediënt (gedeeld door voorraad.html en het menu)
│   ├── scanner.js           camera + barcodeherkenning
│   ├── photo-scan.js        "Scan foto" op Voorraad: een foto van flessen naar de Edge Function scan-bottles
│   ├── voorraad.js          de beheerpagina: lijst, zoeken, voorraad, toevoegen/wijzigen/verwijderen, fles scannen
│   ├── data-loader.js       haalt de tabellen op en zet ze neer voor de pagina's
│   ├── boot.js              wacht op de gegevens en start dan de paginascripts; zet ook de instellingen toe en tekent de flessen in de kop
│   ├── footer.js            de voet van elke pagina (merknaam, de pagina's, naar boven, copyright)
│   ├── stock.js             wat op is en welke recepten daardoor vervallen
│   ├── cards.js             de kaarten op de cocktail- en mocktailpagina, met zoeken (voor de beheerder: menu-vinkje, Bewerken, toevoegen)
│   └── recipe-dialog.js     het venster om een cocktail of mocktail toe te voegen of te wijzigen, met de ingrediëntregels
├── img/loewie.webp          de foto in het venster van "Registreer als beheerder"
├── scripts/cache-bust.py    zet een versie achter de scripts in de pagina's (zie Uitrollen)
├── .githooks/pre-commit     stopt een commit als die versie verouderd is (optioneel, zie Uitrollen)
└── supabase/
    ├── config.toml          CLI-config
    ├── functions/scan-bottles/index.ts   de Edge Function van "Scan foto": foto → Claude → voorraad
    ├── migrations/          0001 t/m 0026: schema, rechten (RLS) en de gegevenswijzigingen sinds de start
    └── seed.sql             startgegevens voor een nieuw project (wordt niet meer gegenereerd)
```

## Beheer

Bezoekers lezen alleen. Dranken en ingrediënten (de tabel `items`) beheer je op de pagina Voorraad, na het inloggen.
Wijnen (ook alle wijngegevens) beheer je op de pagina Wijnen en in het bewerkvenster. Cocktails en mocktails beheer je in Supabase.

- **Alles is een ingrediënt.** De enige vraag per item is of het ook op het **menu** staat: het vinkje "Zichtbaar in het
  menu" (in het bewerkvenster, en als kolom "In menu" in de lijst). In de database is dat `items.serving`: `both` = op het
  menu, `ingredient` = niet op het menu (de waarde `drink` bestaat niet meer, zie `0010`). Een drank of fles staat
  standaard op het menu, een los ingrediënt niet. Wat niet op het menu staat, blijft gewoon werken in recepten en voorraad.
- **Categorie:** elk item staat in een categorie, of in geen: dan staat het op de voorraadpagina onder **Andere** en nooit op het
  menu (`items.category_id` mag leeg zijn, zie `0015`). Alle sterke drank (likeuren, vodka, gin, jenever, rum, whisky,
  aperitieven) zit in één categorie, **Iets Sterker** (zie `0014`); wat daarvan op het menu staat, bepaalt het vinkje "In menu".
- **Voorraad:** de schakelaar "Op voorraad"/"Op" per item, of het aantal. Of zet `items.in_stock` zelf op `false`. Zo'n drank verdwijnt van het menu en uit de recepten, en elke
  cocktail of mocktail die er niet zonder kan verdwijnt ook.
- **Gebruiken in cocktails:** `items.in_cocktails` (standaard aan; zie `0018`), het vinkje "Gebruiken in cocktails" in het
  bewerkvenster. Uit betekent: dit item wordt niet in cocktails en mocktails gebruikt. Een recept waarvan een regel alleen nog
  uit zulke items (of uit wat op is) kan bestaan, vervalt van het menu en van de cocktail- en mocktailpagina, net als bij iets
  dat op is; staan er alternatieven ("A of B") dan blijft het recept bestaan. Bij de drank op het menu staan dan ook geen
  cocktails of mocktails meer. De drank zelf blijft op het menu en in de voorraad, en zijn puur-serveerwijze blijft staan. Dit
  geldt voor cocktails én mocktails.
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
- **Alcoholpercentage:** `items.abv` (bijv. 8,5; leeg = onbekend; zie `0022`), alleen bij categorieën met
  `categories.show_alcohol` (Bier en Iets Sterker; niet bij wijn en frisdrank). Het veld staat dan in het bewerkvenster en het
  percentage staat bij de drank op het menu en op Voorraad. De bestaande percentages zijn leeg: vul ze in via het bewerkvenster.
- **Recepten en hun ingrediënten:** de tabellen `recipes`, `recipe_bottles`, `recipe_lines` en `recipe_line_items` (zie `0019`).
  Elke receptregel is **gekoppeld aan één of meer items**; meer dan één zijn alternatieven ("Havana Club of Bacardí"). Daaraan ziet
  de site welke recepten niet kunnen als iets op is of niet voor cocktails is ingeschakeld; er wordt niets meer uit de tekst van de
  regel geraden. Een regel zonder koppeling (bijv. ijs) wordt niet bijgehouden. Een item dat in recepten is gekoppeld kun je wel
  verwijderen, zie **Een item verwijderen** hieronder. Het oude trefwoord en de "andere namen" van een item doen niets meer (de kolommen `keyword` en `aliases` staan
  nog in de database; `0020` heeft er de koppelingen van de bestaande recepten uit afgeleid).
- **Cocktails en mocktails beheren:** op de cocktail- en mocktailpagina heeft een ingelogde beheerder per kaart de knop **Bewerken**
  en bovenaan **+ Cocktail toevoegen** (of **+ Mocktail toevoegen**). Het venster heeft naam, soort, omschrijving, bereiding, link,
  "Op het menu" en de ingrediëntregels: per regel hoeveelheid, tekst en de gekoppelde items (zoeken en koppelen; bij
  een nieuwe regel stelt het venster items voor die in de tekst voorkomen). Alles wordt in één transactie opgeslagen door de
  database-functie `save_recipe`, ook de flessen van het recept (`recipe_bottles`: de gekoppelde items uit een categorie van soort
  `bottle`). Recepten die niet kunnen (iets is op of uitgeschakeld) ziet de beheerder gedimd, met de reden. Een recept verwijderen
  haalt zijn regels en koppelingen mee weg.
- **Wijnen:** een wijn is een item in de categorie **Wijn** (eerder "Wijn & bubbels") met een rij in `wines` erbij: soort, druif,
  regio en volgorde. Er is één notitie, die van het item (`items.note`), die ook op de wijnpagina staat; alcohol en "te bevestigen"
  bestaan niet meer voor wijn (de kolommen `wines.alcohol`, `wines.note` en `wines.to_confirm` worden niet meer gebruikt). Alles beheer
  je op de site: in het bewerkvenster verschijnt een blok **Wijn** zodra de categorie Wijn is gekozen (op Voorraad, of via
  **Bewerken** en **+ Wijn toevoegen** op de pagina Wijnen, alleen voor een ingelogde beheerder; daar blijft ook een wijn die op is
  zichtbaar, gedimd). Het item en de wijngegevens worden samen opgeslagen. Een wijn naar een andere categorie verplaatsen verwijdert
  de wijngegevens (na een bevestiging); een item verwijderen verwijdert ze ook (`on delete cascade`). De soort moet bubbels, wit,
  rosé of rood zijn (een check in de database); de volgorde bepaalt de plek op de wijnpagina (lager staat eerder). Wijn staat
  standaard niet in cocktails ("Gebruiken in cocktails" uit); wijn die in een receptregel is gekoppeld (Cava of prosecco, Crémant)
  blijft aan, anders verdwijnen die recepten.

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
- **Cocktail- en mocktailpagina:** tonen alle recepten die kunnen, ook die niet op het menu staan; er is geen filter op fles of
  drank. Bovenaan staan de gewone knoppen (Menu, Wijnen, Mocktails, Cocktails, en voor de beheerder Voorraad en Beheer), net als
  op de andere pagina's. Onder de kop staat een zoekveld: het zoekt tegelijk op de naam van de cocktail of mocktail en op de
  ingrediënten (de tekst van de regels en de namen van de gekoppelde items); accenten en hoofdletters maken niet uit, en elk woord
  moet ergens in het recept voorkomen, in willekeurige volgorde ("gin citroen"). Boven de lijst staat hoeveel er overblijven;
  Escape wist de zoekopdracht. Onderaan staat een tip (de vuistregel voor een sour of mocktail) met een knop naar de andere
  lijst. Voor de beheerder heeft elke kaart het vinkje "Op het menu" en de knop Bewerken.
- **Kop en voet:** elke pagina heeft dezelfde kop: de knoppen, de titel en een rij flessen. Het zijn er bij elke keer laden een
  ander aantal (9 tot en met 15) van wisselende hoogte en breedte (`paintBottles()` in `boot.js`; het is sfeer, het aantal heeft
  niets met de voorraad te maken); op de wijnpagina zijn het wijnflessen in de kleuren van bubbels, wit, rosé en rood. De voet
  komt uit `js/footer.js` (op elke pagina alleen `<footer class="site-footer"></footer>`): merknaam, de pagina's (Voorraad en
  Beheer alleen voor een ingelogde beheerder; Cocktails en Mocktails verdwijnen als je die lijst uitzet), "Naar boven" en de
  copyright met het huidige jaar.
- **Een item verwijderen:** in het bewerkvenster (Voorraad, of het menu en de wijnpagina voor de beheerder). Een item dat in
  recepten wordt gebruikt, kan worden verwijderd met de database-functie `remove_item` (zie `0025`): eerst laat het venster zien wat
  er bij verdwijnt, en pas na bevestiging gebeurt het, in één transactie. Recepten (cocktails, mocktails en puur-serves) met een
  regel waarvan dit het enige gekoppelde item is, worden verwijderd, met hun regels, koppelingen en flessen; staat er een alternatief
  bij ("A of B") dan blijft het recept bestaan, zonder dit item. Daarna gaan de koppelingen en het item zelf weg (en bij wijn de
  wijngegevens). Zonder de migratie lukt verwijderen alleen als het item nergens in zit.

## Inloggen

Rechtsboven staat op elke pagina een blokje. Ingelogd toont het "Ingelogd als …" met een knop om uit te loggen. Anders staan
er twee knoppen:

- **Inloggen** opent een venster met e-mailadres en wachtwoord (een gewoon formulier, dus je wachtwoordmanager of browser
  kan het invullen). Na het inloggen ga je naar de pagina Voorraad (sta je op een beheerpagina, dan blijf je daar). Het formulier staat vanaf het laden van de pagina in
  de DOM, in een dicht venster, zodat wachtwoordmanagers het herkennen.
- **Registreer als beheerder** doet niets echts: het opent een venster met een foto en de melding "Ask our admin Loewie for
  access." (aanmelden voor nieuwe gebruikers staat uit, zie Rechten).

De beheerpagina's (Voorraad en Beheer) hebben zelf geen inlogformulier. Open je er een zonder sessie (of loopt je sessie af),
dan opent hetzelfde inlogvenster, met een melding als je sessie verlopen is. **De knoppen Voorraad en Beheer in de navigatie
zijn er alleen voor een ingelogde beheerder.** De sessie staat in `sessionStorage` en verdwijnt als je het tabblad sluit.

## Pagina Beheer

`admin.html` is een voorportaal voor de beheerder en alleen te zien na het inloggen: zonder beheerderssessie blijft de inhoud
verborgen en opent het inlogvenster. De pagina heeft drie blokken:

- **Koppelingen** (nieuw tabblad): de repository `JorgVe/Kelderrestjes` op GitHub (de code en de migraties; een wijziging op `main`
  komt via GitHub Pages vanzelf online) en het Supabase-dashboard van het project `kelderrestjes` (`aspjeliatfudrcjcfidi`; Supabase
  vraagt zelf om in te loggen).
- **Monitoring:** wat de site zelf bij Supabase kan opvragen: of de data-API en het inloggen werken en hoe snel, en (via de
  database-functie `admin_stats`, zie `0021`) PostgreSQL-versie, grootte, aantal rijen per tabel, laatste wijziging en het
  klokverschil. Daaronder **Databaseversie**: welke migraties zijn toegepast en welke nog ontbreken. Processor, geheugen en verkeer
  vraagt Supabase alleen met een persoonlijk toegangstoken; dat hoort niet in een website, dus die zie je alleen in het dashboard.
- **Instellingen** (tabel `settings`, zie `0021`; zonder tabel gelden de standaardwaarden): schakelaars voor de hele site, meteen
  online: recepten verbergen als een ingrediënt op is (aan), wat op is ook aan bezoekers laten zien (uit), **Cocktails** en
  **Mocktails** (aan), de knop "Registreer als beheerder" (aan), en een mededeling bovenaan elke pagina (uit; met tekst). Zet je
  Cocktails of Mocktails uit, dan zijn voor bezoekers de pagina en **alle verwijzingen ernaar** weg: de knop in de navigatie, de lijst
  en de recepten bij de dranken op het menu, de links in de voet en de knop onder de tip, en de link in het receptvenster; de pagina zelf toont dan
  "niet beschikbaar". Een ingelogde beheerder behoudt ze (met een melding op de pagina), om recepten te kunnen beheren. De mededeling
  blijft bij het scrollen bovenaan staan, onder de gele rand.

Net als bij Voorraad is dit een afscherming in de browser, geen beveiliging: de pagina bevat geen geheimen en wie mag schrijven
(ook de instellingen) bepaalt de database. De pagina heeft `noindex`, zodat zoekmachines hem overslaan. Verhuist het project of de
repository, pas dan de adressen in `admin.html` aan.

## Pagina Voorraad

Beheerpagina voor dranken en ingrediënten (eerder "Ingrediënten", daarna even "Stock"). Inloggen gaat met een
Supabase-account (e-mailadres en wachtwoord) dat in de tabel `admins` staat, via de knop Inloggen rechtsboven.

- **De lijst:** één tabel, met per categorie een kopregel (naam en hoeveel er op voorraad is). Items
  zonder categorie staan onderaan onder **Andere**, ook als filterkeuze. Per item: de schakelaar Op voorraad / Op (een echte
  schakelaar: groene baan met de knop rechts is aan, grijs met de knop links is "Op"), de naam met de labels 0% en het alcoholpercentage,
  het **aantal** (een invulveld; opgeslagen zodra je het veld verlaat of op Enter drukt), bij bier en sterkere drank het
  alcoholpercentage, het vinkje "In menu" en de knop Bewerken. Barcode, notitie en de recepten waarin het item voorkomt staan niet in de
  lijst; die zie je in het bewerkvenster. De werkbalk en de kolomkoppen blijven staan bij het scrollen. Op een smal scherm wordt elke rij een kaartje.
- **Zoeken en filteren:** op naam, notitie of barcode (accenten maken niet uit); op Alles / Op
  voorraad / Op; en per categorie.
- **Scan foto:** naast "Scan fles" (de barcodescanner) staat **Scan foto**. Je kiest een foto van flessen (JPEG, PNG of WebP; de browser
  verkleint hem eerst tot hoogstens 2048 px), kiest **Optellen** (het aantal flessen op de foto komt bij de voorraad; de standaard) of
  **Vervangen** (het aantal op de foto wordt het aantal), en kunt eventueel uitleg meegeven ("de twee flessen links zijn Havana Club").
  De foto gaat naar de privébucket `bottle-scans` en daarna roept de site de Supabase Edge Function `scan-bottles` aan met het pad en de
  stand (`image_path`, `stock_mode`, `additional_info`). Die herkent de flessen, zoekt ze in je lijst (op barcode, naam of andere
  namen) en past de voorraad aan via de database-functie `apply_bottle_scan_stock` (aantal en "Op voorraad" horen daarbij samen, zoals
  elders). **Er wordt nooit een deel van een scan toegepast:** is één fles onduidelijk (aantal of herkenning onzeker, of niet in je lijst),
  dan verandert er niets en toont het venster welke; met uitleg kun je opnieuw proberen, zonder de foto opnieuw te uploaden. Na een
  geslaagde scan laadt de pagina opnieuw. Een fles die niet in je lijst staat, wordt niet toegevoegd; voeg hem eerst toe. Bij wijn vult
  de functie alleen lege velden (druif, regio) aan. De bucket, de policies en `apply_bottle_scan_stock` staan in
  `0026_bottle_scans.sql`; de functie zelf in `supabase/functions/scan-bottles/index.ts` (uitrollen met
  `supabase functions deploy scan-bottles`). De herkenning doet Claude (Anthropic API); de functie heeft het geheim `ANTHROPIC_API_KEY`
  nodig (Edge Functions, Secrets). Foto's blijven in de bucket staan: beheerders kunnen er lezen en schrijven maar niet verwijderen.
- **Toevoegen, bewerken, verwijderen** van een item: naam, categorie (of "Andere (geen categorie)": dan kan het item niet op het
  menu en is het menu-vinkje uit), aantal op voorraad, notitie, barcode, het alcoholpercentage (bier en sterkere drank), bij
  wijn het blok Wijn, en de vinkjes (de eigenschappen, rechtsonder in het venster) in het menu, op voorraad, gebruiken in
  cocktails en alcoholvrij. De uitleg bij een veld staat achter het vraagteken naast het label. Bij een bestaand item staat
  rechts in het venster een lijst met de cocktails en mocktails waarin het voorkomt. Na zo'n wijziging laadt de pagina opnieuw, zodat
  alles klopt. Verwijderen kan niet ongedaan worden gemaakt; zit het item in recepten, dan toont de bevestiging eerst welke recepten
  mee verdwijnen (zie **Een item verwijderen**). Een item hernoemen is veilig: recepten zijn aan het item gekoppeld, niet aan zijn naam. De kolom `items.to_confirm` (te
  bevestigen) wordt door de site niet meer getoond of bewerkt; de kolom staat nog in de database.

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

## Uitrollen

De site draait op GitHub Pages: een push naar `main` is de uitrol. Pages laat een browser elk bestand 10 minuten bewaren, dus wie net
voor een uitrol de site opende, kon een **oud script bij een nieuwe pagina** krijgen (de melding "canMix is not defined"). Daarom
heeft elke scripttag een versie: `<script src="js/stock.js?v=1a2b3c4d">`. De versie is een hash van de inhoud van alles in `js/`;
verandert er iets, dan wisselt hij in alle pagina's, en `js/boot.js` zet hem ook achter de scripts die hij zelf laadt. Zo hoort bij elke
pagina precies de versie van de scripts waarmee ze is geschreven.

- **Na elke wijziging in `js/`, vóór het committen:** `python3 scripts/cache-bust.py` en neem de bijgewerkte `*.html` mee in de commit.
  Is er niets veranderd, dan doet het script niets.
- **Controle:** `python3 scripts/cache-bust.py --check` verandert niets en stopt met een foutmelding als een pagina een oude versie heeft.
  `.githooks/pre-commit` doet dat bij elke commit; aanzetten (eenmalig per kopie van de repository): `git config core.hooksPath .githooks`.
- Dit geldt niet voor de pagina's zelf: die kunnen tot 10 minuten oud zijn, maar verwijzen dan naar de bijpassende scripts.
  De scripts van Supabase en de barcode-bibliotheek hebben al een vast versienummer in hun adres.

## Opzetten

Gedaan voor het project `kelderrestjes` (eu-central-1, `aspjeliatfudrcjcfidi`); `js/supabase-config.js` is ingevuld.

1. Maak een project op [supabase.com](https://supabase.com/dashboard).
2. Open de **SQL editor** en voer achter elkaar uit de schemamigraties `0001_init.sql`, `0002_item_serving.sql`,
   `0009_item_barcode.sql`, `0011_categories_alcoholic.sql`, `0012_recipe_on_menu.sql`, `0015_items_without_category.sql`,
   `0016_item_quantity.sql`, `0018_item_in_cocktails.sql`, `0019_recipe_line_items.sql`, `0021_settings_and_admin_stats.sql` en
   `0022_alcohol_columns.sql`, dan `seed.sql`, en daarna `0020_link_recipe_lines.sql` (koppelt de receptregels van de seed aan items),
   `0023_cleanup_categories_and_wines.sql`, `0024_rename_wine_category.sql`, `0025_remove_item.sql` (de functie om een item met zijn
   recepten te verwijderen) en `0026_bottle_scans.sql` (bucket, rechten en voorraadfunctie van Scan foto; de Edge Function rol je apart uit). (Bij een bestaande database: draai de schemamigraties
   **voordat** je de nieuwe site uitrolt, `0025` ook, en `0024` pas **na** het uitrollen. Loopt de database achter, dan valt de site terug op de
   oude kolommen en op koppelen via de tekst, en toont `admin.html` onder Databaseversie wat er ontbreekt.) De overige migraties (`0003` t/m `0008`, `0010` en `0014`) zijn gegevenswijzigingen die de seed al bevat; ze zijn alleen nodig voor een
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
| `items` | dranken, flessen en ingrediënten: naam, categorie (mag leeg: "Andere"), `serving` (op het menu of niet), notitie, `barcode`, `in_stock`, `quantity` (aantal op voorraad), `abv` (alcoholpercentage), `in_cocktails` en de vinkjes |
| `recipes` | cocktails, mocktails en puur-serves (`kind`: cocktail, mocktail, solo), met `on_menu` (staat ook op het menu) |
| `recipe_bottles` | welke items bij een recept horen |
| `recipe_lines` | de receptregels (hoeveelheid en ingrediënt) |
| `recipe_line_items` | welke items een receptregel dekken (meer dan één = alternatieven) |
| `settings` | instellingen van de site (sleutel en waarde), te zetten op `admin.html` |
| `wines` | wijngegevens (soort, druif, regio, volgorde), hangt aan een item |
| `admins` | wie mag schrijven (alleen via de SQL editor te beheren) |
