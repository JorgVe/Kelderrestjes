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
│   ├── scanner.js           camera + barcodeherkenning (en openCamera: alleen de camera, om een foto te maken)
│   ├── photo-scan.js        "Scan foto" op Voorraad: foto maken → concept per fles → jij vult aan en bevestigt → voorraad bijgewerkt
│   ├── dialog-outside.js    klikken buiten een venster sluit het (de vensters van Scan fles en Scan foto)
│   ├── scan-dev.js          alleen op localhost: Scan foto testen met een bewaarde scan (zie "Scan foto testen zonder Claude")
│   ├── pairing.js           "Wijn bij het menu" op de wijnlijst (beheerder): menu van vandaag invullen → welke wijn uit de voorraad past er het best bij
│   ├── pairing-dev.js       alleen op localhost: Wijn bij het menu testen met een bewaard antwoord (zie "Wijn bij het menu")
│   ├── suggest.js           "Help me kiezen" op het menu en de cocktail- en mocktailpagina (voor iedereen): wens intypen → welke cocktail of mocktail past er nu bij
│   ├── invent.js            "Nieuwe cocktail laten bedenken" (beheerder): Claude verzint recepten uit de voorraad, jij controleert er een in het receptvenster
│   ├── drinks-dev.js        alleen op localhost: Help me kiezen en Nieuwe cocktail laten bedenken testen met een bewaard antwoord (zie "Help me kiezen en nieuwe recepten")
│   ├── voorraad.js          de beheerpagina: lijst, zoeken, voorraad, toevoegen/wijzigen/verwijderen, fles scannen
│   ├── data-loader.js       haalt de tabellen op en zet ze neer voor de pagina's
│   ├── boot.js              wacht op de gegevens en start dan de paginascripts; zet ook de instellingen toe en tekent de flessen in de kop
│   ├── footer.js            de voet van elke pagina (merknaam, de pagina's, naar boven, copyright)
│   ├── stock.js             wat op is en welke recepten daardoor vervallen
│   ├── cards.js             de kaarten op de cocktail- en mocktailpagina, met zoeken (voor de beheerder: menu-vinkje, Bewerken, toevoegen)
│   └── recipe-dialog.js     het venster om een cocktail of mocktail toe te voegen of te wijzigen, met de ingrediëntregels
├── tests/                   tests zonder browser (`node --test tests/*.test.mjs`): het controlecijfer van de barcodescanner
├── fixtures/scan/           bewaarde antwoorden van de scanfunctie, om Scan foto mee te testen zonder Claude
├── fixtures/pairing/        bewaarde antwoorden van de wijnfunctie, om Wijn bij het menu mee te testen zonder Claude
├── fixtures/drinks/         bewaarde antwoorden van cocktail-ai, om Help me kiezen en Nieuwe cocktail laten bedenken mee te testen zonder Claude
├── img/loewie.webp          de foto in het venster van "Registreer als beheerder"
├── img/zacht-en-vettig.webp de foto die Help me kiezen toont als de wens "zacht en vettig" bevat
├── scripts/cache-bust.py    zet een versie achter de scripts in de pagina's (zie Uitrollen)
├── .githooks/pre-commit     stopt een commit als die versie verouderd is (optioneel, zie Uitrollen)
└── supabase/
    ├── config.toml          CLI-config
    ├── functions/analyze-bottles/   de Edge Function van "Scan foto": foto → Claude → concept (schrijft niets); met tests
    ├── functions/pair-wine/         de Edge Function van "Wijn bij het menu": menu + wijnen op voorraad → Claude → suggesties (schrijft niets); met tests
    ├── functions/cocktail-ai/       de Edge Function van "Help me kiezen" (bezoekers, met limiet) en "Nieuwe cocktail laten bedenken" (beheerder): schrijft niets; met tests
    ├── migrations/          0001 t/m 0028: schema, rechten (RLS) en de gegevenswijzigingen sinds de start
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
  haalt zijn regels en koppelingen mee weg. Naast **+ Cocktail toevoegen** staat **Nieuwe cocktail laten bedenken** (of mocktail): Claude verzint
  recepten uit wat op voorraad is, zie **Help me kiezen en nieuwe recepten** hieronder. Voor iedereen staat op die pagina ook **Help me kiezen**.
- **Wijnen:** een wijn is een item in de categorie **Wijn** (eerder "Wijn & bubbels") met een rij in `wines` erbij: soort, druif,
  regio en volgorde. Er is één notitie, die van het item (`items.note`), die ook op de wijnpagina staat; alcohol en "te bevestigen"
  bestaan niet meer voor wijn (de kolommen `wines.alcohol`, `wines.note` en `wines.to_confirm` worden niet meer gebruikt). Alles beheer
  je op de site: in het bewerkvenster verschijnt een blok **Wijn** zodra de categorie Wijn is gekozen (op Voorraad, of via
  **Bewerken** en **+ Wijn toevoegen** op de pagina Wijnen, alleen voor een ingelogde beheerder; daar blijft ook een wijn die op is
  zichtbaar, gedimd). Het item en de wijngegevens worden samen opgeslagen. Een wijn naar een andere categorie verplaatsen verwijdert
  de wijngegevens (na een bevestiging); een item verwijderen verwijdert ze ook (`on delete cascade`). De soort moet bubbels, wit,
  rosé of rood zijn (een check in de database); de volgorde bepaalt de plek op de wijnpagina (lager staat eerder). Wijn staat
  standaard niet in cocktails ("Gebruiken in cocktails" uit); wijn die in een receptregel is gekoppeld (Cava of prosecco, Crémant)
  blijft aan, anders verdwijnen die recepten. Op de pagina Wijnen staat voor de beheerder ook de knop **Wijn bij het menu** (zie hieronder).

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
  klokverschil. Daaronder **Databaseversie**: welke migraties zijn toegepast en welke nog ontbreken (tot en met `0028`). Processor, geheugen en verkeer
  vraagt Supabase alleen met een persoonlijk toegangstoken; dat hoort niet in een website, dus die zie je alleen in het dashboard.
- **Instellingen** (tabel `settings`, zie `0021`; zonder tabel gelden de standaardwaarden): schakelaars voor de hele site, meteen
  online: recepten verbergen als een ingrediënt op is (aan), wat op is ook aan bezoekers laten zien (uit), **Cocktails** en
  **Mocktails** (aan), de knop "Registreer als beheerder" (aan), de knop **Help me kiezen** voor bezoekers (aan; zie `0028` en hieronder), en een mededeling bovenaan elke pagina (uit; met tekst). Zet je
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
- **Scan foto:** naast "Scan fles" (de barcodescanner) staat **Scan foto**. Het venster werkt net als dat van de barcodescanner: de camera
  staat meteen aan en met **Foto maken** neem je de foto (met **Andere foto maken** probeer je het opnieuw). Werkt de camera niet (geen
  https, geen toestemming), dan kies je een foto uit je toestel (JPEG, PNG of WebP). Buiten het venster klikken sluit het (niet tijdens een scan en niet in het controlescherm, zodat je ingevulde regels
  niet per ongeluk kwijtraken). Met **Eerdere foto opnieuw scannen** kies je een van de
  laatste 8 foto's die al in de bucket staan en laat je hem opnieuw lezen (met je lijst van nu, en eventueel nieuwe uitleg), zonder opnieuw te uploaden. Je kunt uitleg meegeven ("de twee flessen links zijn
  Havana Club"). De browser verkleint de foto tot hoogstens 2048 px.
  Wie doet wat:
  - **De site** (`js/photo-scan.js`, `js/admin.js`) maakt en uploadt de foto, laat het concept zien en laat jou aanvullen en bevestigen.
  - **Supabase** bewaart de foto in de privébucket `bottle-scans`, draait de Edge Function `analyze-bottles` en past de voorraad aan met de
    database-functie `apply_bottle_scan_stock` (aantal en "Op voorraad" horen daarbij samen, zoals elders).
  - **Claude** leest alleen de foto: welke flessen, hoeveel, wat er op het etiket staat. De functie geeft Claude je lijst met items mee, zodat
    hij een fles aan een item kan koppelen, en controleert dat antwoord daarna zelf.

  De functie schrijft niets: ze geeft een **concept** terug, een regel per fles. Wat de foto niet kon vertellen (geen aantal, geen passende
  fles, niet zeker) blijft leeg en markeert de regel; die vul je in het venster aan. Per regel:
  - **Bekende fles:** de fles staat al gekozen of je kiest hem uit de lijst (de mogelijke eerst). Je kiest **Erbij tellen** (het aantal van
    de foto komt bij de voorraad; de standaard) of **Vervangen** (het aantal van de foto wordt het aantal). Er staat bij wat de voorraad wordt.
  - **Nieuwe fles:** is er geen bekende fles en ook geen mogelijke, dan gaan we uit van een nieuwe fles: die staat al gekozen. Wat de foto
    erover zegt staat vooraf ingevuld: naam, barcode, de categorie die het best past (wijn staat altijd in de categorie Wijn), bij wijn de
    soort (bubbels, wit, rosé, rood; ook te zien aan het etiket, het glas en de sluiting), druif en regio (alleen als ze op het etiket staan) en bij
    bier en sterkere drank het alcoholpercentage. Je past aan wat niet klopt en vult aan wat mist (de naam ook, als de foto die niet kon lezen).
    Bij twijfel tussen mogelijke flessen kies je zelf: een bekende fles of "Nieuwe fles". Het aantal van de foto wordt het aantal van de nieuwe
    fles. Dezelfde regels en standaardwaarden als in het bewerkvenster (`kelderItemDialog.createItem`).
  - **Onthouden:** kies je zelf een bestaande fles voor een regel die de scan niet (of anders) koppelde, dan staat onder die regel het vinkje
    **Onthoud …** (standaard aan). Na het bijwerken van de voorraad komt hoe de fles op de foto stond erbij als **andere naam** van dat item
    (`items.aliases`, te zien en te wijzigen bij "Andere namen" in het bewerkvenster), en een gelezen barcode als barcode van het item als dat er
    nog geen heeft. De volgende keer wordt de fles vanzelf herkend, en Claude krijgt de namen mee in je lijst. Dat gebeurt alleen als de foto een echte
    naam gaf (niet alleen een merk), de naam niet al bij een item hoort en de barcode nog van niemand is. Lukt het onthouden niet, dan blijft de voorraad
    zoals hij is en staat het in de melding. Een verkeerde naam haal je weg bij "Andere namen".
  - Een regel kun je verwijderen, en je kunt er zelf een toevoegen. Staat een bekende fles op twee regels, dan worden de aantallen opgeteld
    (met dezelfde keuze erbij of vervangen; anders vraagt het venster om ze gelijk te maken).

  Pas als elke regel klaar is, en je op **Voorraad bijwerken** drukt, verandert er iets: eerst worden de nieuwe flessen aangemaakt, daarna
  wordt de voorraad van de bekende flessen in één keer bijgewerkt (lukt een deel daarvan niet, dan lukt niets van dat deel). Mislukt er
  halverwege iets, dan blijven de al aangemaakte flessen staan, staan ze in het venster als toegevoegd en worden ze bij een nieuwe poging
  niet nog eens aangemaakt. Daarna kun je met **Nog een foto** meteen de volgende foto maken: de lijst in het venster houdt rekening met
  wat er net is bijgewerkt. De pagina laadt pas opnieuw als je het venster sluit. Met "Opnieuw scannen met uitleg" kom je terug zonder de
  foto opnieuw te uploaden. Bij wijn vult de database alleen lege velden (druif, regio) aan.
  De bucket, de policies en `apply_bottle_scan_stock` staan in `0026_bottle_scans.sql` en `0027_bottle_scan_line_mode.sql` (die laatste maakt
  de keuze erbij/vervangen per regel mogelijk: **rol hem uit voordat de site wordt uitgerold**, anders telt elke regel als "erbij"); de functie in
  `supabase/functions/analyze-bottles/` (uitrollen met `supabase functions deploy analyze-bottles`; de koppeling met je lijst
  staat als gewone code in `match.ts`, getest met `node --test supabase/functions/analyze-bottles/match.test.ts`). De functie heeft het geheim
  `ANTHROPIC_API_KEY` nodig (Edge Functions, Secrets). Foto's blijven in de bucket staan: beheerders kunnen er lezen en schrijven maar niet
  verwijderen.
- **Toevoegen, bewerken, verwijderen** van een item: naam, categorie (of "Andere (geen categorie)": dan kan het item niet op het
  menu en is het menu-vinkje uit), aantal op voorraad, notitie, **andere namen** (gescheiden door komma's; Scan foto gebruikt ze om de fles te herkennen), barcode, het alcoholpercentage (bier en sterkere drank), bij
  wijn het blok Wijn, en de vinkjes (de eigenschappen, rechtsonder in het venster) in het menu, op voorraad, gebruiken in
  cocktails en alcoholvrij. De uitleg bij een veld staat achter het vraagteken naast het label. Bij een bestaand item staat
  rechts in het venster een lijst met de cocktails en mocktails waarin het voorkomt. Na zo'n wijziging laadt de pagina opnieuw, zodat
  alles klopt. Verwijderen kan niet ongedaan worden gemaakt; zit het item in recepten, dan toont de bevestiging eerst welke recepten
  mee verdwijnen (zie **Een item verwijderen**). Een item hernoemen is veilig: recepten zijn aan het item gekoppeld, niet aan zijn naam. De kolom `items.to_confirm` (te
  bevestigen) wordt door de site niet meer getoond of bewerkt; de kolom staat nog in de database.

Het scherm zelf is alleen een voorportaal: de gegevens zijn publiek leesbaar via de Supabase-API (dat moet, want het menu
gebruikt ze), en wie mag schrijven bepaalt de database, niet de pagina.

### Scan foto testen zonder Claude

Elke echte scan kost tijd en geld. Om het venster van Scan foto te proberen of te verbeteren kun je een **bewaarde scan** afspelen: het
antwoord van de scanfunctie staat dan als bestand in `fixtures/scan/` en er gaat niets naar Claude. Dit werkt alleen op je eigen computer
(`localhost` of `127.0.0.1`, `js/scan-dev.js`); op de echte site doet het niets.

Start de site lokaal (in de map van het project) en open de pagina met een parameter achter het adres:

```
python3 -m http.server 3000
```

- `http://127.0.0.1:3000/voorraad.html?scan-fixture=mixed` speelt `fixtures/scan/mixed.json` af. In het fotovenster staat de knop
  **Voorbeeldscan** (je hebt geen foto nodig). Bevestigen schrijft dan wel naar de echte database.
- Voeg `&scan-dry=1` toe om ook **niets** te schrijven: "Voorraad bijwerken" en nieuwe flessen worden nagebootst, met dezelfde controles.
  Laad de pagina opnieuw voor de echte stand.
- Meegeleverd: `mixed` (bekende flessen, een dubbele regel, nieuwe wijn met en zonder gegevens, een nieuwe sterke drank, een twijfelgeval),
  `unreadable` (bijna niets leesbaar) en `empty` (geen fles gezien).
- **Een echte scan bewaren:** na een echte scan op localhost staat in het controlevenster **Bewaar deze scan als voorbeeld**. Dat downloadt
  een `.json`-bestand; zet het in `fixtures/scan/` en open de pagina met `?scan-fixture=<naam zonder .json>`. De flessen in zo'n bestand
  staan met hun nummer uit je database; na het verwijderen van een item kan een oud voorbeeld ernaar blijven wijzen.

### Een fles scannen

De knop **Scan fles** opent de camera van je telefoon (of laptop). Richt hem op de barcode:

- Staat de barcode al bij een drank, dan opent die drank: de voorraad wisselen, bewerken, of "Scan volgende".
- Een nieuwe barcode koppel je één keer aan een drank (kies uit de lijst) of aan een nieuwe drank; daarna werkt hij altijd.
- Werkt de camera niet (geen toestemming, geen https), dan kun je de barcode intypen.

De camera werkt alleen op een **beveiligde (https) pagina**, of op `localhost`. Herkenning gaat met de ingebouwde
`BarcodeDetector` van de browser (Chrome op Android); heeft de browser die niet (zoals Safari op een iPhone), dan wordt bij het
eerste scannen de bibliotheek [barcode-detector](https://github.com/Sec-ant/barcode-detector) (MIT, vastgezet op een versie)
van jsDelivr gehaald. Een barcode met een kloppend controlecijfer (EAN-13, EAN-8, UPC-A) wordt na één keer lezen herkend; andere codes pas als ze twee keer achter
elkaar hetzelfde worden gelezen. De herkenning (op een iPhone: de bibliotheek downloaden) start meteen, terwijl de camera nog om toestemming vraagt.

### Wijn bij het menu

Op de pagina Wijnen staat voor een ingelogde beheerder de knop **Wijn bij het menu**. Je vult in wat er vandaag op het menu staat ("pompoensoep,
ossenhaas met rode wijnsaus en tiramisu, voor 6 personen"), drukt op **Zoek de beste wijn** (of Ctrl+Enter, ⌘+Enter op een Mac) en krijgt per gerecht de
wijn uit je voorraad die er het best bij past, met een korte uitleg, zo nodig een tweede keuze, en bij meer dan een gang ook de ene fles die over het
hele menu het best werkt. Past er niets goed bij, dan staat dat er eerlijk bij. De naam van een wijn is een link naar zijn kaart op de pagina. Het
menu van vandaag wordt in deze browser onthouden (alleen vandaag), zodat je het niet opnieuw hoeft in te typen. Er verandert niets in de voorraad
of de database.

- **De site** (`js/pairing.js`, `js/admin.js`) laat het menu intypen of dicteren en toont de suggesties.
- **Supabase** draait de Edge Function `pair-wine` (`supabase/functions/pair-wine/`): ze controleert dat je beheerder bent (elke vraag kost geld, dus
  bezoekers kunnen haar niet gebruiken), leest welke wijnen op voorraad zijn (op voorraad en niet op nul; een onbekend aantal telt als op voorraad),
  vraagt Claude te kiezen en controleert het antwoord: een wijn die niet op voorraad is of niet bestaat, wordt nooit getoond. Staat er geen wijn op voorraad,
  dan wordt Claude niet eens gevraagd.
- **Claude** krijgt alleen de tekst van het menu en de lijst met wijnen (naam, soort, druif, regio, notitie, aantal flessen) en kiest daaruit. De
  uitleg aan jou is in het Nederlands. Het geheim `ANTHROPIC_API_KEY` is hetzelfde als dat van `analyze-bottles`.
- Uitrollen: `supabase functions deploy pair-wine`; de logica staat in `pairing.ts`, getest met
  `node --test supabase/functions/pair-wine/pairing.test.ts`. Er is geen databasemigratie voor nodig.

**Testen zonder Claude** (alleen op je eigen computer, `js/pairing-dev.js`): open `http://127.0.0.1:3000/wijnen.html?pair-fixture=dinner`. De pagina doet alsof
je beheerder bent en speelt `fixtures/pairing/dinner.json` af: geen inloggen, geen Claude. Meegeleverd: `dinner` (drie gangen met een tweede keuze,
"één fles" en een opmerking), `single` (één gerecht), `nomatch` (een gang waar niets bij past), `notmenu` (geen menu herkend), `nowines` (geen wijn
op voorraad) en `error` (een foutmelding). Het bestand is het antwoord van de functie; de wijnen erin staan met hun naam uit je lijst.

### Help me kiezen en nieuwe recepten

Twee hulpjes, allebei met één Edge Function, `cocktail-ai` (`supabase/functions/cocktail-ai/`). Geen van beide schrijft iets.

**Help me kiezen (voor iedereen).** De knop staat op het menu naast **Alle mocktails** en naast **Alle cocktails**, en op de cocktail- en mocktailpagina rechts in de
kopregel (op een smal scherm naast de titel). Een bezoeker kiest bovenin **Van de kaart** of **Iets nieuws**, typt waar hij zin in heeft ("iets fris, niet te zoet, met
gin") of tikt een paar woorden aan, en drukt op Enter.

- **Van de kaart** (standaard): één tot drie cocktails of mocktails die nu gemaakt kunnen worden, elk met een korte uitleg en de ingrediënten; de naam is een link naar de
  kaart (ook naar de andere pagina als het een mocktail is). Past er niets, dan zegt het dat eerlijk. Onder het resultaat staat **Verzin iets nieuws** voor dezelfde wens.
- **Iets nieuws:** Claude verzint **één nieuw recept** voor deze bezoeker, alleen van wat er nu in huis is. Het staat niet op de kaart en wordt nergens bewaard (een bezoeker
  kan niets schrijven). Een ingelogde beheerder krijgt bij zo'n recept **Controleren en toevoegen**, dat het in het gewone receptvenster opent. Het is een zwaardere vraag
  en **telt dubbel** voor de limiet hieronder.
- **Zonder alcohol:** zegt een bezoeker "zonder alcohol", "alcoholvrij", "zwanger", "moet nog rijden" of iets dergelijks (`wantsNoAlcohol` in `drinks.ts`), dan krijgt hij
  alleen mocktails, wat Claude ook antwoordt: de functie filtert dat zelf, voor beide soorten vraag. Een nieuw recept wordt gecontroleerd als bij de beheerder: alleen
  items op voorraad, een mocktail zonder alcohol, een cocktail met, geen bestaande naam; en alleen een soort waarvan de lijst voor bezoekers aanstaat.
- **Zacht en vettig:** het laatste woordje om aan te tikken is een grapje. Staat "zacht en vettig" in de wens (hoofdletters en dubbele spaties tellen niet, in beide soorten
  vraag), dan start er geen zoekopdracht: de site toont `img/zacht-en-vettig.webp` met het onderschrift "Ik denk dat je zoiets zoekt." Er gaat niets naar de Edge Function
  en er telt niets mee voor de limiet (de controle staat in `search()` in `js/suggest.js`, vóór `ask()`).

- **De site** (`js/suggest.js`) toont het venster en de uitslag. De knop verdwijnt als de beheerder hem uitzet (admin.html, instelling `suggest_enabled`), of als er
  niets te kiezen is.
- **Supabase** kijkt zelf welke recepten nu kunnen (dezelfde regel als `js/stock.js`, in `drinks.ts`; de pagina wordt hierin niet vertrouwd), en houdt de lijsten
  aan of uit die je voor bezoekers hebt aan- of uitgezet. Claude krijgt alleen de korte tekst van de bezoeker en die lijst; een drankje dat niet in de lijst staat kan
  nooit door het antwoord heen.
- **Omdat bezoekers hem aanroepen en elke vraag geld kost, is er een limiet:** een bezoeker mag **8 keer per uur** (4 keer iets nieuws), de hele site **150 keer per 24 uur**
  (`VISITOR_PER_HOUR` en `DAILY_CAP` bovenin `index.ts`; aanpassen kan zonder migratie; iets nieuws telt als twee). Een bezoeker is een versleutelde vingerafdruk van het IP-adres (de
  database bewaart nooit het adres, en rijen ouder dan 2 dagen worden weggegooid): tabel `suggestion_log` en functie `claim_suggestion`, alleen toegankelijk voor de
  Edge Function (`0028`). Kan de limiet niet gecontroleerd worden (bijvoorbeeld omdat `0028` ontbreekt), dan gaat er niets naar Claude. De teksten en antwoorden
  worden niet gelogd, alleen aantallen. Het venster zegt dat de tekst door een AI wordt gelezen en dat je geen persoonlijke gegevens moet invullen.
- **Uitzetten:** admin.html → Instellingen → "Knop Help me kiezen voor bezoekers".

**Nieuwe cocktail of mocktail laten bedenken (beheerder).** Naast **+ Cocktail toevoegen** staat **Nieuwe cocktail laten bedenken** (op de mocktailpagina: mocktail). Een wens
is optioneel ("iets met de amaretto, zonder eiwit"; leeg = verras me). Je krijgt tot drie voorstellen, elk met ingrediënten, bereiding en waarom het past bij de voorraad.
**Controleren en toevoegen** opent het voorstel ingevuld in het gewone receptvenster (met de ingrediënten al gekoppeld aan items): je past aan wat je wilt en drukt
zelf op Opslaan (`save_recipe`). Sluit je dat venster zonder op te slaan, dan staan de voorstellen er nog, zodat je een ander kunt kiezen; **Nog andere voorstellen**
geeft nieuwe en laat de vorige niet terugkomen.

- **Supabase** controleert dat je beheerder bent (elke vraag kost geld), geeft Claude de ingrediënten op voorraad (in voorraad, "Gebruiken in cocktails" aan, niet "alleen
  losse drank") en de recepten die er al zijn, en **controleert elk voorstel**: alleen items die echt op voorraad zijn (een onbekend of op item wordt uit de regel gehaald), een
  mocktail zonder alcohol, een cocktail met alcohol (een 0.0-bier telt als alcoholvrij als het item als zodanig is aangevinkt), geen naam die al bestaat, minstens twee gekoppelde
  ingrediënten en hoogstens twee regels zonder koppeling (ijs, water, een garnering). Wat niet klopt, wordt weggegooid.
- Er wordt niets opgeslagen voordat jij dat doet; "Op het menu" staat in het receptvenster standaard aan, zoals bij elk nieuw recept.

**Uitrollen:** eerst migratie `0028_suggestion_limit.sql` (de limiet en de instelling), dan `supabase functions deploy cocktail-ai --no-verify-jwt` (de sessiecontrole van het platform staat uit
omdat bezoekers geen sessie hebben; voor de beheerdersactie controleert de functie het zelf; zie ook `config.toml`). Het geheim `ANTHROPIC_API_KEY` is hetzelfde als dat van de
andere functies. De logica staat in `drinks.ts`, getest met `node --test supabase/functions/cocktail-ai/drinks.test.ts`. Een testaanroep zonder Claude: stuur bij `suggest` ook `dry_run: true` mee (met `mode: 'new'` voor de andere soort vraag); de functie doet dan alles behalve Claude vragen (ze telt wel mee voor de limiet) en antwoordt `{ status: 'dry_run', mode, pool: <aantal drankjes>, ingredients: <aantal> }`.

**Testen zonder Claude** (alleen op je eigen computer, `js/drinks-dev.js`): open `http://127.0.0.1:3000/cocktails.html?suggest-fixture=fresh` voor Help me kiezen en
`http://127.0.0.1:3000/cocktails.html?invent-fixture=three` voor Nieuwe cocktail laten bedenken (de pagina doet dan alsof je beheerder bent; geen inloggen, geen Claude, geen
limiet; ze mogen samen). Meegeleverd in `fixtures/drinks/`: `suggest-fresh`, `suggest-zero` (alleen mocktails), `suggest-nomatch`, `suggest-limit`, `suggest-error`,
`suggest-disabled`, `suggest-new-one` (een nieuw recept voor een bezoeker, via `?suggest-new-fixture=one`), `suggest-new-mock`, `suggest-new-none`, en `invent-three` (drie voorstellen), `invent-mock`, `invent-none`, `invent-empty` (te weinig op voorraad) en `invent-error`. Let op bij `invent-fixture`: de knoppen
Bewerken en + Cocktail toevoegen zijn dan ook zichtbaar en schrijven alleen als je echt bent ingelogd.

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
   recepten te verwijderen) en `0026_bottle_scans.sql` (bucket, rechten en voorraadfunctie van Scan foto; de Edge Function rol je apart uit) en `0027_bottle_scan_line_mode.sql` (erbij of vervangen per regel) en `0028_suggestion_limit.sql` (de limiet van Help me kiezen; de Edge Function `cocktail-ai` rol je apart uit). (Bij een bestaande database: draai de schemamigraties
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
| `suggestion_log` | vragen aan Help me kiezen (vingerafdruk van de bezoeker en tijdstip), voor de limiet; alleen de Edge Function kan erbij (`0028`) |
| `wines` | wijngegevens (soort, druif, regio, volgorde), hangt aan een item |
| `admins` | wie mag schrijven (alleen via de SQL editor te beheren) |
