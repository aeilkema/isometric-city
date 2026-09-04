# IsoCity Next — Next-generation architecture and game design

## Doel

IsoCity Next maakt van de huidige browser-citybuilder een veel grotere, snellere en realistischer stadssimulatie die zowel als moderne webapp/PWA als lokale desktopapp kan draaien. De bestaande isometrische identiteit, sprites, voertuigen en savegames blijven het uitgangspunt.

De kernprincipes zijn:

1. **De UI mag nooit de simulatie blokkeren.** React is interface, niet de game-engine.
2. **De simulatie is deterministisch en los van rendering.** Dezelfde seed + commands geeft dezelfde stad.
3. **Alle dure systemen werken op verschillende frequenties.** Verkeer hoeft bijvoorbeeld veel vaker te updaten dan belastingen.
4. **Rendering schaalt met zoom, hardware en viewport.** Alleen tekenen wat zichtbaar en betekenisvol is.
5. **Een stad leeft op meerdere niveaus.** Individuele voertuigen dichtbij, geaggregeerde stromen ver weg.
6. **AI adviseert en bouwt op basis van dezelfde regels als de speler.** Geen gratis geld of magische teleportatie.
7. **Nieuwe content is data-driven.** Nieuwe gebouwen, diensten en infrastructurele varianten horen niet verspreid over tientallen switch-statements.

---

# 1. Huidige technische situatie

De huidige codebasis is functioneel en rijk, maar verschillende kerntaken zitten nog in grote modules:

- `CanvasIsometricGrid.tsx` bevat rendering, interactie en een groot deel van frame-logica.
- `simulation.ts` bevat veel simulatiesystemen in één module.
- `GameContext.tsx` draagt een grote hoeveelheid globale state door React.
- voertuigen, voetgangers, rail en rendering hebben elk substantiële main-thread belasting.
- er is al LOD, spatial indexing en culling, maar de architectuur laat nog te veel werk in dezelfde browser-thread plaatsvinden.
- assets en voorbeeldsteden maken de repository en initiële payload groot.

Conclusie: de grootste winst komt niet van micro-optimalisaties, maar van het scheiden van **UI, simulation, rendering, persistence en AI**.

---

# 2. Nieuwe runtime-architectuur

```text
React / Next.js UI
        |
        | commands + snapshots
        v
Game Runtime Controller
        |
        +---- Simulation Worker
        |        |- economy
        |        |- zoning
        |        |- households
        |        |- jobs
        |        |- services
        |        |- land value
        |        |- utilities
        |        |- city AI
        |
        +---- Mobility Worker
        |        |- road graph
        |        |- pathfinding
        |        |- traffic flow
        |        |- public transport
        |
        +---- Render Runtime
        |        |- camera
        |        |- viewport culling
        |        |- chunk cache
        |        |- LOD
        |        |- sprites/atlases
        |        |- overlays
        |
        +---- Persistence Worker
                 |- autosave
                 |- compression
                 |- migrations
                 |- IndexedDB / desktop filesystem
```

## 2.1 Game clock

Gebruik vaste simulation ticks, niet React renders of willekeurige `setInterval`-cadans.

Aanbevolen frequenties:

| Systeem | Frequentie |
|---|---:|
| camera/input | iedere frame |
| zichtbare voertuigen | 30–60 Hz |
| lokaal verkeer | 10 Hz |
| voetgangers dichtbij | 5–10 Hz |
| verkeersmodel op stadsniveau | 1–2 Hz |
| utilities | 2 Hz |
| gebouwen/groei | 1 Hz |
| huishoudens/werk | 0.5–1 Hz |
| budget/belasting | per sim-dag/maand |
| regionale economie | per sim-week |
| AI planning | 0.2–1 Hz |

De runtime gebruikt een **performance governor** om detail dynamisch terug te schalen zonder de simulatie te veranderen.

## 2.2 Chunked map

Vervang langdurig gebruik van grote geneste JS-arrays als primaire opslag door chunks van bijvoorbeeld 32x32 of 64x64 tiles.

Voordelen:

- alleen zichtbare chunks renderen;
- alleen gewijzigde chunks opnieuw serialiseren;
- regionaal pathfinding-cache;
- snelle dirty-region updates;
- uitbreiding naar zeer grote kaarten;
- later gemakkelijk WebAssembly/SharedArrayBuffer mogelijk.

## 2.3 Typed arrays / SoA

Voor grote hoeveelheden dynamische entiteiten: Structure-of-Arrays in plaats van duizenden kleine objecten.

Voorbeeld voertuigdata:

```text
vehicleX: Float32Array
vehicleY: Float32Array
vehicleSpeed: Float32Array
vehicleRouteIndex: Uint32Array
vehicleKind: Uint8Array
vehicleFlags: Uint16Array
```

Dit verlaagt garbage collection en maakt worker-overdracht/SharedArrayBuffer veel efficiënter.

---

# 3. Rendering: veel mooier én sneller

## 3.1 Renderpad

Fase 1 blijft HTML5 Canvas om bestaande assets en code te behouden. Daarna kan optioneel een WebGL/WebGPU renderer worden toegevoegd achter dezelfde renderer-interface.

### Renderlagen

1. terrain
2. water
3. roads / rails / paths
4. underground overlay
5. static building base
6. building details
7. vegetation
8. moving vehicles
9. pedestrians
10. weather/effects
11. lighting
12. selection/debug overlays

Statische lagen worden per chunk naar offscreen canvases gecachet. Alleen dirty chunks worden opnieuw opgebouwd.

## 3.2 Detailniveaus

### LOD 0 — regionale kaart
- grondgebruikskleuren
- grote weg-/spoorassen
- water
- skyline-silhouetten
- geen individuele voertuigen

### LOD 1 — stadsbeeld
- gebouwen als volledige sprites
- hoofdverkeer als geaggregeerde animatie
- bomen in clusters

### LOD 2 — wijkniveau
- voertuigen
- straatmeubilair
- parkeerplaatsen
- individuele bomen
- lokale verlichting

### LOD 3 — straatniveau
- voetgangers
- fietsen
- bushaltes
- verkeerslichten
- terrassen
- vuilnisbakken
- bankjes
- geparkeerde auto's
- bouwvakkers
- reclameborden
- zonnepanelen
- airco-units
- tuinen en erfafscheidingen

## 3.3 Grafische uitbreiding gebouwen

Gebouwen worden samengesteld uit:

```text
base sprite
+ roof variant
+ facade variant
+ vegetation layer
+ props layer
+ seasonal layer
+ night-light mask
+ condition layer
```

Daardoor kunnen 20 basismodellen visueel honderden varianten opleveren.

Variatieparameters:

- bouwjaar
- architectuurstijl
- dichtheid
- welvaart
- onderhoudsniveau
- district
- hoek/oriëntatie
- seizoen
- dag/nacht
- leegstand
- renovatie

## 3.4 Omgevingsdetail

Toevoegen:

- stoepen en fietspaden
- straatverlichting
- zebrapaden
- verkeersborden
- bomenrijen
- heggen
- bermen
- sloten
- kades
- marktkramen
- terrassen
- bushokjes
- laadpalen
- transformatorhuisjes
- ondergrondse containers
- speeltoestellen
- bouwplaatsen
- kraanwagens
- zonnepanelen
- windturbines
- straatwerkzaamheden
- wegmarkering per wegtype
- sneeuw/natte wegen als latere weerslaag

---

# 4. Realistische stadsimulatie

## 4.1 Huishoudens

Niet iedere inwoner hoeft permanent als volledig object te bestaan. Gebruik huishoudens als economische eenheid en materialiseer individuele personen alleen waar nodig.

Huishouden bevat bijvoorbeeld:

- grootte
- leeftijdsopbouw
- inkomen
- opleiding
- autobezit
- voorkeur voor vervoer
- woonlasten
- werk/schoollocaties
- tevredenheid
- verhuisbereidheid

## 4.2 Arbeidsmarkt

Banen krijgen sectoren en skillniveau:

- retail
- horeca
- logistiek
- industrie
- bouw
- zorg
- onderwijs
- overheid
- zakelijke dienstverlening
- ICT
- creatieve sector
- toerisme
- landbouw

Werkloosheid ontstaat wanneer skills, bereikbaarheid en banen niet aansluiten.

## 4.3 Woningmarkt

Gebouwen hebben huur/koopniveau, capaciteit, kwaliteit en energielabel. Woningprijzen volgen uit:

- bereikbaarheid
- voorzieningen
- geluid
- luchtkwaliteit
- groen
- scholen
- veiligheid
- vraag/aanbod
- belastingen
- onderhoud

## 4.4 Bedrijven

Bedrijven kunnen openen, groeien, verhuizen of sluiten. Ze vragen:

- personeel
- klanten
- leveranciers
- vrachttoegang
- energie
- ruimte

## 4.5 Nutsvoorzieningen

Losse netwerken voor:

- elektriciteit
- drinkwater
- afvalwater
- afvalinzameling
- telecom/data
- stadsverwarming (optioneel)

Niet alleen globale capaciteit: bereikbaarheid en lokale bottlenecks tellen mee.

## 4.6 Milieu

- luchtvervuiling
- geluid
- waterkwaliteit
- bodemverontreiniging
- hitte-eilandeffect
- CO2-uitstoot
- groenratio
- overstromingsrisico

---

# 5. Transport en mobiliteit

## Wegen

Nieuwe typen:

- woonstraat
- eenrichtingsstraat
- 30 km/h straat
- stadsweg
- avenue/boulevard
- 2x2 hoofdweg
- 2x3 hoofdweg
- ringweg
- snelweg
- op-/afritten
- rotonde
- busbaan
- fietsstraat
- autoluwe straat
- voetgangersgebied
- landweg

Eigenschappen per segment:

- lanes
- speed limit
- capacity
- parking
- sidewalk
- bike lane
- bus lane
- median
- tree strip
- tram reservation

## Openbaar vervoer

- bus
- tram
- metro
- trein
- lightrail
- ferry
- regionale trein
- P+R
- hubs

Speler tekent lijnen, haltes en dienstregeling. Reizigers kiezen op basis van generalized cost: tijd + overstappen + prijs + comfort + parkeerdruk.

## Verkeersmodel

Hybride:

- macro-flow voor de hele stad;
- meso-routing per district;
- individuele voertuigen alleen in relevante/zichtbare gebieden.

Hierdoor kan een stad honderdduizenden fictieve verplaatsingen simuleren zonder honderdduizenden canvas-objecten.

---

# 6. Veel meer bouwmogelijkheden

## Wonen

- vrijstaand
- twee-onder-een-kap
- rijwoningen
- portiekflat
- galerijflat
- appartementenblok
- hoogbouw
- sociale woningbouw
- studentenhuisvesting
- seniorencomplex
- tiny houses
- luxe villa's
- woonboten
- mixed-use

## Commercieel

- buurtwinkel
- supermarkt
- winkelstraat
- winkelcentrum
- horeca
- hotel
- kantoor
- business park
- markt
- bioscoop
- congrescentrum

## Industrie/logistiek

- lichte industrie
- zware industrie
- voedselindustrie
- high-tech
- recycling
- distributiecentrum
- magazijn
- havenopslag
- containerterminal
- datacenter

## Publieke diensten

- basisschool
- middelbare school
- mbo
- universiteit
- huisarts
- kliniek
- ziekenhuis
- ambulancepost
- brandweerpost
- politiebureau
- bibliotheek
- gemeentehuis
- rechtbank
- gevangenis
- buurthuis
- zorgcentrum

## Recreatie

- speeltuin
- sportveld
- zwembad
- park
- stadsbos
- hondenpark
- volkstuinen
- skatepark
- stadion
- theater
- museum
- concertzaal
- dierentuin
- pretpark
- strand
- jachthaven

## Infrastructuur

- transformatorstation
- zonnepark
- windpark
- batterijopslag
- gascentrale
- afvalcentrale
- waterzuivering
- pompstation
- rioolgemaal
- recyclingstation
- afvaloverslag
- laadplein
- tankstation
- parkeerterrein
- parkeergarage
- fietsenstalling

---

# 7. AI: burgemeester, adviseurs en AutoMode

## 7.1 Geen LLM nodig voor basis-AI

De beslissingen die de stad daadwerkelijk veranderen moeten deterministisch, uitlegbaar en snel zijn. Daarom bestaat AutoMode uit een planner met scores en constraints.

AI-cyclus:

1. observe city
2. detect bottlenecks
3. rank goals
4. generate candidate actions
5. estimate impact
6. reject unsafe/ruinous actions
7. choose lowest-cost useful action
8. execute via normale game command
9. measure result

## 7.2 AutoMode-profielen

- **Conservative** — langzaam uitbreiden, hoge reserves
- **Balanced** — normale realistische groei
- **Transit First** — compacte stad en OV
- **Green City** — lage emissie, veel groen
- **Growth** — snelle economische expansie
- **Dutch Urbanism** — compacte wijken, fietsinfrastructuur, OV, gemengde functies, weinig autogerichte uitbreiding

## 7.3 Guardrails

AutoMode mag:

- nooit geld onder nul brengen behalve met expliciete leningsregels;
- historische/gelockte gebouwen niet slopen;
- maximaal een instelbaar percentage van budget per sim-maand uitgeven;
- grote projecten faseren;
- infrastructuur vóór nieuwe uitbreiding bouwen;
- eerst bestaande capaciteit benutten.

## 7.4 Progress AI / adviseur

Naast AutoMode komt een analytische adviseur die kan uitleggen:

- waarom groei stagneert;
- welke wijk onbereikbaar is;
- waar scholen tekortschieten;
- waarom belastinginkomsten dalen;
- welke wegen structureel vastlopen;
- welke investering de beste impact per euro heeft.

Een optionele LLM-laag kan die bestaande metrics later in natuurlijke taal uitleggen. De LLM neemt nooit rechtstreeks ongevalideerde game-acties.

---

# 8. Desktop + moderne webapp

## Web

Doel: installable PWA.

- service worker
- app manifest
- IndexedDB saves
- offline game shell
- lazy asset packs
- background save compression
- static export waar mogelijk

## Desktop

Voorkeur: **Tauri 2** als dunne lokale shell rond dezelfde frontend.

Voordelen:

- veel kleiner dan Electron;
- lokale filesystem saves;
- native menu/file dialogs;
- optioneel dedicated local worker/threading;
- auto-update kan later worden toegevoegd;
- dezelfde TypeScript frontend blijft bruikbaar.

Architectuur:

```text
packages/game-core   -> platform-onafhankelijk
apps/web             -> Next/PWA
apps/desktop         -> Tauri shell
```

De huidige repo hoeft niet meteen monorepo te worden. Eerst core abstraheren, daarna desktop-shell toevoegen.

---

# 9. Assetstrategie

De repository bevat zeer grote PNG bronbestanden naast WebP varianten. Voor runtime en repositorygrootte:

1. production runtime gebruikt alleen geoptimaliseerde formaten;
2. source art naar een apart optioneel `assets-source` pakket of Git LFS;
3. thumbnails + atlases per categorie;
4. content packs lazy laden;
5. sprite metadata in JSON/TS catalogus;
6. AVIF/WebP waar geschikt;
7. build controleert dat PNG source art nooit per ongeluk in de runtime bundle komt.

---

# 10. Performance targets

## Browser target

Op een moderne middenklasse desktop:

- 60 FPS bij normale camera-interactie;
- 30 FPS minimum bij drukke stad op hoge detailstand;
- input latency < 50 ms;
- simulation step p95 < 8 ms op normale snelheid;
- geen autosave freeze > 16 ms;
- city load toont UI binnen 2 s, rest streamt daarna;
- memory target < 1.5 GB bij zeer grote stad;
- geen volledige grid clone per simulation tick.

## Schaaldoel

- 256x256 map soepel;
- 512x512 speelbaar;
- 1024x1024 technisch mogelijk via chunks/streaming;
- 100k+ gesimuleerde inwoners via aggregatie;
- duizenden zichtbare bewegende entiteiten met LOD.

---

# 11. Migratiepad

## Fase A — meten en begrenzen

- frame profiler
- simulation profiler
- performance governor
- performance budgets
- save benchmark
- asset inventory

## Fase B — runtime scheiden

- command bus
- immutable UI snapshot
- simulation scheduler
- simulation worker
- dirty chunks
- render cache

## Fase C — rendering

- chunk canvases
- improved camera culling
- sprite atlases
- detail layers
- adaptive quality

## Fase D — realistische systemen

- household model
- job market
- housing market
- utility networks
- mobility demand
- public transport
- municipal services

## Fase E — AI / AutoMode

- planner
- strategies
- action scoring
- diagnostics
- city advisor

## Fase F — content expansion

- data-driven build catalog
- road variants
- modular buildings
- district styles
- props/decorations

## Fase G — distribution

- PWA
- offline assets
- Tauri Windows build
- signed installer
- releases

---

# 12. Eerste implementatie in deze branch

Deze branch start de architectuur zonder de bestaande game te breken:

- `src/core/runtime/PerformanceGovernor.ts`
  - dynamische kwaliteitsregeling op frame- en simulationdruk;
- `src/core/runtime/SimulationScheduler.ts`
  - meerdere systemen op verschillende sim-frequenties;
- `src/games/isocity/ai/CityAutopilot.ts`
  - deterministische, uitlegbare planningkern;
- `src/games/isocity/data/nextGenerationBuildCatalog.ts`
  - data-driven catalogus voor toekomstige bouwopties.

De modules zijn bewust losgekoppeld van React zodat ze daarna stap voor stap in de bestaande game geïntegreerd kunnen worden.

---

# 13. Definitie van succes

IsoCity Next is geslaagd wanneer een gebruiker een grote stad kan laten doorgroeien terwijl:

- de camera direct blijft reageren;
- verkeer en inwoners geloofwaardig blijven;
- de stad logisch reageert op beleid en infrastructuur;
- AutoMode zelfstandig maar zichtbaar verantwoord kan bouwen;
- de speler veel meer infrastructuur en gebouwen kan kiezen;
- de stad visueel op straatniveau leeft;
- dezelfde save zowel in browser/PWA als desktopversie werkt.
