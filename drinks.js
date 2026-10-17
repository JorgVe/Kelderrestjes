/* gedeeld door menu en cocktails: naam -> id voor links (#ti-punch) */
const slug = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

/* ---- flessen op de plank, per soort ---- */
const G = {
  "Rum": ["Bacardí","Bacardí Spiced","Havana Club","Kraken","UTC4"],
  "Whisky": ["Gouden Carolus","J&B Rare","Johnnie Walker Black","White Walker"],
  "Vodka, gin & jenever": ["Absolut Vanilia","Bleu D'Argent","Eristoff","Filliers","Soplica"],
  "Likeuren": ["Amaretto","Blue Curaçao","Cointreau","Crème de Cassis","Licor 43","Pomocello"],
  "Aperitieven & port": ["Aperini","Epacho","Funky Spritz","Lillet Blanc","Lillet Rosé","Martini Floreale","Patricio White Port","Rozès LBV Port"]
};

/* ---- cocktails ----
   n = naam, b = flessen die erin passen, t = soort, m = bereiding
   s = [hoeveelheid, ingrediënt, 1 = staat op de bar (mixer/vers)]
   u = link naar online recept */
const R = [
  {n:"Vesper Martini", b:["Bleu D'Argent","Eristoff","Absolut Vanilia","Lillet Blanc"], t:"Klassieker",
   blurb:"Bond's eigen martini. Stevig, droog, koud. Wil je hem zachter: neem Absolut Vanilia in plaats van Eristoff.",
   s:[["60 ml","Bleu D'Argent gin"],["20 ml","Eristoff of Absolut Vanilia"],["10 ml","Lillet Blanc"],["1","schil citroen",1]],
   m:"Shaken met ijs, zeven in een gekoeld coupe. Knijp de schil boven het glas uit.",
   u:"https://www.lillet.com/en-us/cocktails/lillet-vesper/"},

  {n:"Corpse Reviver No. 2", b:["Bleu D'Argent","Cointreau","Lillet Blanc"], t:"Klassieker",
   blurb:"Gelijke delen, gevaarlijk drinkbaar.",
   s:[["25 ml","Bleu D'Argent gin"],["25 ml","Cointreau"],["25 ml","Lillet Blanc"],["25 ml","citroensap",1]],
   m:"Alles shaken met ijs, zeven in een gekoeld coupe. De absint laten we weg.",
   u:"https://www.diffordsguide.com/cocktails/recipe/593/corpse-reviver-no2-savoy-recipe"},

  {n:"Amaretto Sour", b:["Amaretto","Johnnie Walker Black"], t:"Sour",
   blurb:"Amandel, schuimkraag, verrassend droog.",
   s:[["45 ml","Amaretto"],["15 ml","Johnnie Walker Black"],["25 ml","citroensap",1],["10 ml","suikersiroop"],["15 ml","eiwit"]],
   m:"Eerst shaken zonder ijs, daarna mét. Zeven over een groot ijsblok.",
   u:"https://www.diffordsguide.com/cocktails/recipe/53/amaretto-sour"},

  {n:"Scotch Sour", b:["Johnnie Walker Black","J&B Rare"], t:"Sour",
   blurb:"Rook en citroen. Doe de bitters erbij, dat scheelt.",
   s:[["60 ml","Johnnie Walker Black of J&B"],["25 ml","citroensap",1],["15 ml","suikersiroop"],["15 ml","eiwit"],["2 dr","Angostura",1]],
   m:"Eerst shaken zonder ijs, dan met ijs. Zeven in een tumbler over ijs.",
   u:"https://www.diffordsguide.com/cocktails/recipe/2848/scotch-sour"},

  {n:"New York Sour met port", b:["J&B Rare","Rozès LBV Port"], t:"Sour",
   blurb:"Een whisky sour met een laagje port bovenop. Mooi om te zien.",
   s:[["60 ml","J&B Rare"],["25 ml","citroensap",1],["15 ml","suikersiroop"],["15 ml","Rozès LBV Port (bovenop)"]],
   m:"Shaken met ijs, zeven over ijs. Giet de port héél langzaam over de rug van een lepel, anders zakt hij weg. Geen eiwit: dan blijft de laag liggen.",
   u:"https://www.diffordsguide.com/en-au/cocktails/recipe/3398/new-york-sour-cocktail"},

  {n:"Porto Tónico", b:["Patricio White Port","Rozès LBV Port"], t:"Lang & licht",
   blurb:"Wat ze in Porto op het terras drinken. Met de Rozès wordt hij donkerder en zoeter.",
   s:[["60 ml","Patricio White Port of Rozès LBV Port"],["120 ml","tonic",1],["1","schijf sinaasappel",1]],
   m:"Groot wijnglas vol ijs. Port erin, tonic erbij, roeren.",
   u:"https://www.diffordsguide.com/cocktails/recipe/10509/porto-tonico-white-port-and-tonic"},

  {n:"Lillet Tonic", b:["Lillet Blanc","Lillet Rosé"], t:"Lang & licht",
   blurb:"Twee bestanddelen. Blanc is droger, Rosé fruitiger.",
   s:[["50 ml","Lillet Blanc of Rosé"],["100 ml","tonic",1],["1","partje sinaasappel of limoen",1]],
   m:"Hoog glas vol ijs, Lillet erin, tonic erbij, één keer roeren.",
   u:"https://shookd.se/en/drink/lillet-rose-tonic"},

  {n:"Daiquiri", b:["Havana Club","Bacardí"], t:"Klassieker",
   blurb:"Drie ingrediënten. Nergens om te verstoppen.",
   s:[["60 ml","Havana Club of Bacardí"],["25 ml","limoensap"],["15 ml","suikersiroop"]],
   m:"Hard shaken met ijs, zeven in een gekoeld coupe.",
   u:"https://tuxedono2.com/daiquiri-cocktail-recipe"},

  {n:"Dark 'n Stormy", b:["Kraken","Bacardí Spiced"], t:"Lang & licht",
   blurb:"Rum bovenop laten drijven — daar zit de storm.",
   s:[["60 ml","Kraken (of Bacardí Spiced)"],["20 ml","limoensap"],["120 ml","ginger beer",1]],
   m:"Ginger beer en limoen over ijs, rum er langzaam bovenop schenken.",
   u:"https://punchdrink.com/recipes/dark-n-stormy/"},

  {n:"Cuba Libre", b:["Bacardí Spiced","Havana Club","Bacardí"], t:"Lang & licht",
   blurb:"Rum en cola, maar mét limoen. Met Bacardí Spiced wordt hij kruidiger.",
   s:[["50 ml","Bacardí Spiced of Havana Club"],["15 ml","limoensap"],["120 ml","cola",1],["1","partje limoen",1]],
   m:"Hoog glas met ijs, rum en limoensap erin, aanvullen met cola. Eén keer roeren.",
   u:"https://punchdrink.com/recipes/cuba-libre/"},

  {n:"Carajillo", b:["Licor 43"], t:"Na het eten",
   blurb:"Espresso en vanille. De beste afsluiter die je hebt.",
   s:[["50 ml","Licor 43"],["1","espresso",1]],
   m:"Licor 43 over ijs, espresso erover. Kort shaken kan ook, voor schuim.",
   u:"https://cocktail-society.com/recipes/carajillo-cocktail/"},

  {n:"Old Fashioned", b:["Gouden Carolus"], t:"Klassieker",
   blurb:"Belgische single malt, in een klein flesje: genoeg voor een paar glazen.",
   s:[["60 ml","Gouden Carolus Single Malt"],["10 ml","suikersiroop"],["2 dr","Angostura",1],["1","schil sinaasappel",1]],
   m:"Siroop en bitters in het glas, whisky erbij, roeren met ijs tot koud. Over één groot blok. Schil uitknijpen.",
   u:"https://whiskyadvocate.com/old-fashioned-cocktail-recipe/"},

  {n:"Ti' Punch", b:["UTC4"], t:"Klassieker",
   blurb:"Rum van Réunion, zoals ze het daar doen. Klein en puur.",
   s:[["60 ml","UTC4"],["15 ml","limoensap"],["1 tl","rietsuikersiroop"]],
   m:"Siroop en limoensap in een klein glas, rum erbij, roeren. IJs is optioneel.",
   u:"https://cocktailsandbars.com/ti-punch-recipe/"},

  {n:"Kopstootje", b:["Filliers"], t:"Na het eten",
   blurb:"Geen cocktail. Een ritueel.",
   s:[["50 ml","Filliers genever, ijskoud"],["1","pils",1]],
   m:"Genever tot de rand in een klein glas. Eerste slok zonder handen, voorovergebogen. Bier erachteraan.",
   u:"https://www.diffordsguide.com/en-au/cocktails/recipe/3239/kopstoot"},

  {n:"Kamikaze", b:["Eristoff","Cointreau"], t:"Sour",
   blurb:"Een margarita met wodka. Gelijke delen, klaar in een minuut.",
   s:[["30 ml","Eristoff"],["30 ml","Cointreau"],["30 ml","limoensap"]],
   m:"Shaken met ijs, zeven in een gekoeld glas.",
   u:"https://www.masterclass.com/articles/the-kamikaze-cocktail-recipe"},

  {n:"Blue Lagoon", b:["Eristoff","Blue Curaçao"], t:"Lang & licht",
   blurb:"Knalblauw en zoet-zuur. De Pulco doet hier de limonade.",
   s:[["40 ml","Eristoff"],["20 ml","Bols Blue Curaçao"],["100 ml","Pulco, aangelengd"]],
   m:"Wodka en curaçao shaken met ijs, over ijs gieten, aanvullen met aangelengde Pulco (verhouding staat op de fles).",
   u:"https://insanelygoodrecipes.com/blue-lagoon/"},

  {n:"Bramble", b:["Bleu D'Argent","Crème de Cassis"], t:"Klassieker",
   blurb:"Normaal met braambessenlikeur. Crème de cassis doet hetzelfde kunstje.",
   s:[["45 ml","Bleu D'Argent gin"],["25 ml","citroensap",1],["10 ml","suikersiroop"],["15 ml","Crème de Cassis (bovenop)"],["","crushed ice",1]],
   m:"Gin, citroen en siroop shaken, zeven over crushed ice. Druppel de cassis er langzaam overheen.",
   u:"https://www.thewhiskyexchange.com/cocktails/30/bramble"},

  {n:"Kir Royale", b:["Crème de Cassis"], t:"Bubbels",
   blurb:"Twee ingrediënten. Gebruik droge bubbels, de cassis is al zoet genoeg.",
   s:[["15 ml","Crème de Cassis"],["120 ml","cava of prosecco, koud",1]],
   m:"Cassis in een flûte, aanvullen met bubbels.",
   u:"https://www.gimmesomeoven.com/kir-royale-recipe"},

  {n:"Aperini Spritz", b:["Aperini"], t:"Bubbels",
   blurb:"Bitter-oranje aperitief, hier in de klassieke spritz-verhouding.",
   s:[["60 ml","Aperini"],["90 ml","prosecco",1],["1 scheut","bruiswater",1],["1","schijf sinaasappel",1]],
   m:"Wijnglas vol ijs, prosecco, Aperini, bruiswater. Roeren.",
   u:"https://www.masterclass.com/articles/how-to-make-an-aperol-spritz"},

];

/* ---- puur of met één ding erbij ----
   zelfde opbouw als de cocktails, maar zonder recept-link: ze staan alleen op het menu */
const P = [
  {n:"Soplica Pigwowa", b:["Soplica"], t:"Puur",
   blurb:"Poolse wodka met kweeperensmaak. IJskoud of lang.",
   s:[["50 ml","Soplica Pigwowa"],["100 ml","appelsap",1]],
   m:"Puur uit de vriezer, of over ijs met appelsap."},

  {n:"Belgian Pomocello", b:["Pomocello"], t:"Puur",
   blurb:"Na het eten, in een klein glas.",
   s:[["40 ml","Belgian Pomocello"]],
   m:"Ijskoud uit de vriezer. Of over ijs, aangevuld met bruiswater."},

  {n:"Epacho", b:["Epacho"], t:"Puur",
   blurb:"Aperitief-stijl: lang met iets bubbelends.",
   s:[["60 ml","Epacho"],["","bruiswater of tonic",1],["1","schijf sinaasappel",1]],
   m:"Wijnglas met ijs, Epacho erin, aanvullen, schijf sinaasappel erbij."},

  {n:"Funky Spritz", b:["Funky Spritz"], t:"Puur",
   blurb:"Een spritz-basis \"to mix\". De verhouding staat op het etiket.",
   s:[["","Funky Spritz"],["","bruiswater of prosecco",1]],
   m:"Over ijs, aanvullen volgens het etiket."},

  {n:"Martini Floreale", b:["Martini Floreale"], t:"0%",
   blurb:"Alcoholvrij aperitief, voor wie rijdt of gewoon niet wil.",
   s:[["60 ml","Martini Floreale"],["120 ml","tonic",1],["1","schil citroen",1]],
   m:"Hoog glas vol ijs, Floreale erin, tonic erbij."},

  {n:"White Walker", b:["White Walker"], t:"Puur",
   blurb:"Hoort in de vriezer.",
   s:[["40 ml","Johnnie Walker White Walker"]],
   m:"Puur schenken, ijskoud drinken."}
];

/* ---- overige dranken ----
   n = naam, k = trefwoord (kleine letters) om de cocktails erbij te vinden,
   o = 1 als het optioneel is, z = 1 als het 0% is, c = 1 als het nog bevestigd moet worden,
   note = extra regel */
const M = {
  "Fris & mixers": [
    {n:"Coca-Cola Zero", k:"cola", z:1},
    {n:"Coca-Cola Original", k:"cola"},
    {n:"Sprite Zero", k:"sprite", note:"Lemon-lime", z:1},
    {n:"Royal Club", c:1, note:"Smaak nog checken: bitter lemon of ginger ale"},
    {n:"Fever-Tree", c:1, note:"Smaak nog checken: tonic of vlierbloesem"},
    {n:"Tonic", k:"tonic", o:1},
    {n:"Ginger beer", k:"ginger beer", o:1},
    {n:"Bruiswater", k:"bruiswater"},
    {n:"Appelsap", k:"appelsap"},
    {n:"Pulco", k:"pulco", note:"Limonade, aangelengd met water"}
  ],
  "Bier": [
    {n:"Pils", k:"pils"},
    {n:"Tripel"},
    {n:"Donker Belgisch bier", c:1, note:"Misschien Rochefort 10: merk nog bevestigen"},
    {n:"Liefmans On the Rocks 0.0", note:"Alcoholvrij", z:1},
    {n:"Jupiler 0.0", k:"jupiler", z:1},
    {n:"Carlsberg 0.0", k:"carlsberg", z:1}
  ],
  "Wijn & bubbels": [
    {n:"Mañana sparkling"},
    {n:"Crémant", k:"prosecco"},
    {n:"Cava of prosecco", k:"prosecco", o:1},
    {n:"Chardonnay", note:"Wit"},
    {n:"Trebbiano d'Abruzzo", note:"Wit, 12,5%"},
    {n:"Château Ferrés Douces", note:"Bordeaux"},
    {n:"Rode wijn", note:"Donker en vol"}
  ],
  "Koffie & melk": [
    {n:"Espresso", k:"espresso"},
    {n:"Melk", note:"UHT, 50 cl"}
  ]
};

/* ---- volgorde van de dranksoorten: van alcoholvrij naar het sterkst ----
   [naam van de groep in G of M, alcoholniveau voor de weergave] */
const ORDER = [
  ["Fris & mixers","alcoholvrij"],
  ["Koffie & melk","alcoholvrij"],
  ["Bier","laag, ook 0.0"],
  ["Wijn & bubbels","laag"],
  ["Aperitieven & port","laag tot middel"],
  ["Likeuren","middel tot sterk"],
  ["Vodka, gin & jenever","sterk"],
  ["Rum","sterk"],
  ["Whisky","sterk"]
];
const itemsOf = label => G[label] ? G[label].map(n=>({n,bottle:1})) : (M[label]||[]);

/* ---- mocktails: zelfde opbouw als de cocktails, b = dranken uit G of M ---- */
const Z = [
  {n:"Virgin Moscow Mule", b:["Ginger beer"], t:"Lang & licht",
   blurb:"Ginger beer, limoen en veel ijs. Prikkelend, zonder dat je iets mist.",
   s:[["120 ml","Ginger beer",1],["25 ml","limoensap"],["1","partje limoen",1]],
   m:"Hoog glas vol ijs, limoensap erin, aanvullen met ginger beer. Eén keer roeren, partje limoen erbij.",
   u:"https://mindfulmocktail.com/moscow-mule-mocktail/"},

  {n:"Floreale Tonic", b:["Martini Floreale","Tonic"], t:"Klassieker",
   blurb:"De officiële serve: half-half, zodat de kamille doorkomt.",
   s:[["75 ml","Martini Floreale"],["75 ml","tonic",1],["1","schijf sinaasappel",1]],
   m:"Groot wijnglas vol ijs, Floreale erin, tonic erbij, voorzichtig roeren.",
   u:"https://martini.com/drinks/martini-non-alcoholic-floreale-spritz/23237"},

  {n:"Orange Fizz", b:["Appelsap","Bruiswater"], t:"Lang & licht",
   blurb:"Sinaasappel met een scheut limoen en bubbels. Fris en niet te zoet.",
   s:[["100 ml","appelsap",1],["15 ml","limoensap"],["100 ml","bruiswater",1],["1","schijf sinaasappel",1]],
   m:"Appelsap en limoensap over ijs, aanvullen met bruiswater, schijf sinaasappel erbij.",
   u:"https://www.keepingthepeas.com/orange-mocktail/"},

  {n:"Ginger Lemonade", b:["Ginger beer","Bruiswater"], t:"Lang & licht",
   blurb:"Zelfgemaakte limonade met gember uit de fles.",
   s:[["25 ml","citroensap",1],["15 ml","suikersiroop"],["100 ml","ginger beer",1],["50 ml","bruiswater",1]],
   m:"Citroensap en siroop over ijs, aanvullen met ginger beer en bruiswater. Roeren.",
   u:"https://www.alphafoodie.com/simple-and-healthy-ginger-lemonade/"},

  {n:"Zero-Proof Sour", b:["Bruiswater"], t:"Sour",
   blurb:"Citroen, siroop en een schuimkraag. Alles wat een sour nodig heeft, behalve de drank.",
   s:[["30 ml","citroensap",1],["20 ml","suikersiroop"],["15 ml","eiwit"],["60 ml","bruiswater",1]],
   m:"Eerst shaken zonder ijs, daarna met ijs. Zeven over een groot ijsblok en aanvullen met bruiswater.",
   u:"https://punchdrink.com/recipes/nonalcoholic-sour/"},

  {n:"Radler 0.0", b:["Jupiler 0.0","Carlsberg 0.0","Sprite Zero"], t:"Bier & fris",
   blurb:"Half bier, half limonade. De klassieke fietsersdrank, nu zonder alcohol.",
   s:[["150 ml","Jupiler 0.0 of Carlsberg 0.0",1],["150 ml","Sprite Zero",1]],
   m:"Beide koud. Eerst het bier in een hoog glas, dan langzaam de Sprite erbij. Zonder ijs.",
   u:"https://platedcravings.com/radler-beer/"}
];

/* ---- overige ingrediënten (niet op het menu, wel te markeren als op) ----
   k = trefwoord (kleine letters) waarmee we ze in de recepten herkennen */
const ING = [
  {n:"Citroen", k:"citroen"},
  {n:"Limoen", k:"limoen"},
  {n:"Sinaasappel", k:"sinaasappel"},
  {n:"Suikersiroop", k:"siroop"},
  {n:"Eiwit (eieren)", k:"eiwit"},
  {n:"Angostura", k:"angostura"},
  {n:"Crushed ice", k:"crushed ice"}
];

/* ---- uitverkocht ----
   Zet hier de namen (uit G, M of ING) die op zijn, bijv. ["Eristoff","Citroen"].
   Elke cocktail of mocktail die er niet zonder kan, wordt dan als niet beschikbaar getoond.
   Op de pagina "Dranken" kun je dit ook per browser uitproberen en de lijst hier plakken. */
const OUT = [];

/* ---- wijnen (details voor de wijnpagina; op het menu staan ze alleen algemeen) ----
   kind = Bubbels | Wit | Rosé | Rood, n = naam zoals in M
   druif / regio / alc / note mogen leeg (null) zijn: de pagina toont dan "nog invullen"
   c = 1 als iets nog bevestigd moet worden */
const WKINDS = {Bubbels:"Bubbels", Wit:"Witte wijn", "Rosé":"Rosé", Rood:"Rode wijn"};
const W = [
  {n:"Mañana sparkling", kind:"Bubbels", druif:null, regio:null, alc:null, note:"Staat op het etiket als sparkling.", c:1},
  {n:"Crémant", kind:"Bubbels", druif:null, regio:null, alc:null, note:"Ligt in de lade."},
  {n:"Chardonnay", kind:"Wit", druif:"Chardonnay", regio:null, alc:null, note:"Ligt in de lade."},
  {n:"Trebbiano d'Abruzzo", kind:"Wit", druif:"Trebbiano", regio:"Abruzzo, Italië", alc:"12,5%", note:"Stijl Trebbiano d'Abruzzo: op de fles checken.", c:1},
  {n:"Château Ferrés Douces", kind:"Wit", druif:null, regio:"Bordeaux, Frankrijk", alc:null, note:"Wit of rosé: kleur nog checken.", c:1},
  {n:"Rode wijn", kind:"Rood", druif:null, regio:null, alc:null, note:"Donkerrood, geopend en afgesloten met een vacuümstop. Naam nog invullen.", c:1}
];
