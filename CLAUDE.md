# Warszawa – gra z bujaniem na sieci

Przeglądarkowa gra 3D (Three.js + Vite): współczesna Warszawa (stan „jak dziś”, z danych OSM) i bohater bujający się na sieci.
Komunikacja z użytkownikiem po polsku. W tekstach publicznych (README, opisy, strona, wideo, posty) to **demo technologiczne**
pokazujące możliwości obecnych modeli AI i tempo ich rozwoju – nie „gra” (start: „Kliknij, aby zacząć”).

## Komendy
- `npm run dev` – serwer deweloperski, gra pod http://localhost:5173
- `npm run fetch-osm` – pobiera surowe dane OSM (Overpass, kafle + cache w `data/raw/cache/`) → `data/raw/osm.json` (poza gitem)
- `npm run build-landmarks` – wszystkie modele z Blendera (`tools/build-landmarks.mjs`, zmienna `BLENDER` = ścieżka)
- `npm run build` – wersja produkcyjna do `dist/` (`base: './'` – działa z podkatalogu, np. GitHub Pages)
- `npm run build:artifact` – wersja dla artefaktu claude.ai → `dist-artifact/` (`artifact.html` bez `<head>`, binaria jako
  base64 `.txt`, bo hosting nie serwuje `.bin`/`.glb`). Opublikowana: https://claude.ai/artifact/7cQnEK5YTdtchLC79KEtgL
  (aktualizacja: Artifact z `url` i tymi samymi ścieżkami plików; nazwa pliku JS ma hash – stary usunąć przez `null`)
- `npm run build-city` – przerabia OSM → `public/data/city.json` (budynki, drogi, tereny, drzewa, nazwy ulic, dzielnice), potem `tools/build-lod2.mjs` → `public/data/lod2.json` + `lod2.bin`
- LOD2 (GUGiK): `data/raw/gugik/1465_gml.zip` (https://opendata.geoportal.gov.pl/InneDane/Budynki3D/LOD2/1465_gml.zip, 116 MB; CityGML EPSG:2180, kolejność E N, skaning 2012) – cały wycinek gry (`REGION` = `BOUNDS`, można zawęzić zmienną `LOD2_REGION`)
- Blender 5.2: `"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup -P blender/<skrypt>.py -- [--preview plik.png]`
- Landmarki (Blender → `public/models/<nazwa>.glb` + `<nazwa>.json`, lista w `public/models/landmarks.json`):
  `centralna.py` (Dworzec Centralny), `zlote_tarasy.py` (szklany dach), `pkin.py` (PKiN; skrzydła z `data/landmarks/pkin_lod2.json`),
  `zlota44.py` (bryły wprost z `building:part` OSM: rdzeń, „żagiel” i fałdy jako dachy jednospadowe `skillion`, podium;
  elewacja wg zdjęć: białe pasy + okna różnej długości, mapa emisji z zapalonymi oknami), `iglice.py` (iglica Varso,
  maszt LIM, Kolumna Zygmunta), `intercontinental.py` (części OSM: prześwit kond. 5–21, kamień od strony prześwitu;
  bez logo i napisu marki), `most.py` (pylon A 90 m Mostu Świętokrzyskiego, 48 want; nogi jako schodki kolizji).
  Emisja zapisana w modelu (okna, napis dworca) zapala się nocą sama (`nightGain` w main.js), podświetlenie z koloru – lista
  `FLOODLIT`. Podkład LOD2 dla modelu: `DUMP_AT="x,z,promień,plik" node tools/build-lod2.mjs`

## Struktura
- `src/main.js` – start i pętla gry (`tick`; najpierw `requestAnimationFrame`, w pauzie bohater i ruch stoją), teleport
  (`PLACES`), jakość (`Q`, auto przy FPS < 26), podświetlenie landmarków nocą (`FLOODLIT`, `nightGain`), `window.game`.
- `src/hud.js` – nakładka: prędkość, wysokość, stan, FPS, komunikaty, tablice (dzielnica/landmark/wieżowiec), pomoc (`H`).
- `src/geo.js` – wspólne dla gry i narzędzi: wycinek (BBOX), rzutowanie lat/lon → metry, lista miejsc do teleportu. Układ: x = wschód, z = −północ, y = góra, (0,0) = PKiN.
- `src/world/city.js` – siatki miasta (kawałki 400 m; na telefonach dalsze niż `CITY_RANGE` ukryte), dekale ulic/terenów,
  BVH do raycastów (`city.raycast`).
- `src/world/collision.js` – kolizje: każdy budynek to graniastosłup (wielokąt + base/top) w siatce przestrzennej. Pierścienie: zewnętrzny pole > 0, dziury pole < 0 → normalna krawędzi `(dz, -dx)` wskazuje na zewnątrz.
- `src/player/player.js` – fizyka i maszyna stanów: `ground`, `air`, `swing`, `wall`, `zip`. Podkroki przy dużej prędkości.
- `src/player/web.js` – wybór punktu zaczepienia sieci + lina (Line2, obrys + rdzeń).
- `src/world/sky.js` – niebo Preetham, słońce z cieniem za graczem, mgła, mapa otoczenia.
- `src/world/landmarks.js` + `blender/lm_common.py` – modele landmarków. Model jest w układzie gry (Blender: (x, −z, y), eksport glTF +Y),
  opis `.json`: `exclude` (wielokąty – budynki OSM/LOD2 ze środkiem w środku są pomijane), `prisms` (kolizje, opcjonalnie `hf` = siatka
  wysokości dachu), materiały `glass*` dostają odbicia nieba. Trójkąty modelu idą do BVH (sieć przyczepia się do detali).
- `src/world/roofs.js` – kształty dachów z OSM (`roof:shape`: kopuła, piramida/czterospadowy, dwuspadowy, jednospadowy) + `topAt(x,z)` do kolizji.
- `src/world/location.js` – HUD „gdzie jestem”: najbliższa ulica, obszar MSI (admin_level 10), dzielnica (9).
- `src/world/textures.js` – style fasad jako tablica tekstur (`FACADE_STYLES`: kamienica, blok, biurowiec, socrealizm, stare_miasto,
  przemysl, nowy, dawny); kafel 4 przęsła × 4 piętra, dolny rząd = parter (shader w `city.js` bierze go tylko dla najniższej
  kondygnacji). Styl budynku (`s` w city.json/lod2.json) wybiera `build-city` wg obszaru MSI, typu, wysokości, daty i stylu z OSM.
- `src/world/trees.js` – drzewa (BatchedMesh, odrzucanie poza kadrem, LOD koron do 120 m); rodzaj z OSM genus/species/leaf_type,
  lasy (natural=wood) dosadzane co ~7 m.
- `src/world/markings.js` – oznakowanie: linie osiowe/pasów (klasa drogi, lanes, oneway), zebry (linie footway=crossing), szyny;
  linie urywają się w skrzyżowaniach. `src/world/street.js` – latarnie (OSM + dostawiane co 32 m) i sygnalizatory.
- `src/discovery.js` – tablice: nowy obszar/dzielnica (po 1,5 s), landmark w promieniu (`LANDMARKS` w geo.js), podpis
  wieżowca pod graczem (`towers` z build-city: nazwane budynki ≥ 45 m z OSM).
- `src/world/traffic.js` – samochody, autobusy, tramwaje (3 człony), piesi: graf z polilinii OSM (wspólne wierzchołki =
  skrzyżowania), ruch prawostronny, odstępy na pasie, symulacja tylko w promieniu gracza (BatchedMesh).
- `src/world/sky.js` + `night.js` – pora dnia: słońce liczone astronomicznie dla Warszawy i bieżącej daty, `NIGHT`
  (0–1) to wspólny uniform shaderów (okna, latarnie, reflektory, podświetlenie landmarków); `T` = +3 h.
- `src/config.js` – adres repozytorium na ekranie startowym (VITE_REPO_URL / GitHub Pages / stała).
- `src/touch.js` – sterowanie dotykowe (`body.touch`): pływający drążek → `input.moveX/moveY` (wychylenie ≥0.85 = `ShiftLeft`),
  przeciąganie = `input.dx/dy` (z przyspieszeniem), przyciski udają klawisze (`data-key`), SIEĆ (`data-look`) obraca też
  kamerę; `looking` = kciuk ruszał kamerą < 0,9 s temu – inaczej main.js obraca kamerę za ruchem. Podpowiedź
  `#t-hint` przy pierwszym starcie (localStorage `touchHint`).
  `src/input.js`: tryb `free`, gdy pointer lock jest niedostępny (kamera za kursorem + obrót przy krawędzi, `edge(dt)`).
- `src/world/cull.js` – `CellCuller`: drzewa, latarnie i sygnalizatory (BatchedMesh, ~100 tys.) odrzucane po komórkach 100 m
  co 0,15 s (kadr + zasięg `DRAW`); wbudowane `perObjectFrustumCulled` jest wyłączone (kosztowało ~12 ms CPU/klatkę).
- `src/camera.js` – kolizja: 5 promieni z głowy do naroży „bryły” kamery (`sweep`), reszta ramienia rzutowana na
  przeszkodę (`place`, poślizg), przy braku miejsca obrót ramienia w bok (`SWINGS`, ≤10 Hz), pozycja nie może wejść w bryłę
  kolizji (bisekcja). Kamera patrzy na punkt `AIM` m przed głową w zadanym kierunku – celownik = kierunek myszy/palca.
  Pochylenie od −1.3 (w górę ~75°) do 1.35. Długość ramienia 5,2–9 m i FOV 68–86° rosną z prędkością; ramię jest
  wygładzane (`this.arm`, bez skoku przy nagłym zatrzymaniu), tylko przybliżenie do przeszkody jest natychmiastowe.
- `src/config.js` – też `TOUCH` (`pointer: coarse`) i zasięgi zależne od urządzenia: `DRAW` (drzewa/latarnie: 1800/650 m,
  telefon 650/280 m), `FOG` (350–3800 m, telefon 300–2300 m) oraz tylko na telefonach `CITY_RANGE` (budynki do 2,4 km).
- `src/binary.js` – `fetchBinary`/`loadGltf`: wszystkie pliki binarne (lod2.bin, .glb) idą przez nie (`VITE_BINARY_AS_TEXT`).
  Tekstury z .glb dekoduje wtyczka `embeddedImages` (`createImageBitmap(Blob)`): ImageBitmapLoader robi `fetch(blob:)`, który
  CSP artefaktu (`connect-src 'self'`) blokuje – landmarki wychodziły białe. Wersję artefaktu testować z takim nagłówkiem CSP.
- `blender/hero.py` – bohater: tułów z przekrojów (superelipsy), kończyny jako rury, oczy jako sztywne części (bez symbolu na piersi), szkielet 19 kości → `public/models/hero.glb`. Podgląd: `-- --preview <katalog>` (PNG).
- `src/player/avatar.js` – ładuje hero.glb; pozy jako kąty w osiach modelu (x = lewo postaci, z = przód), przeliczane na kości (A-poza → korekta `fix`); wzór sieci rysuje shader (`WEB_GLSL`) z pozycji spoczynkowej.

## Zasady / pułapki
- Bujanie: punkt obrotu wahadła (`player.anchor`) jest przesunięty znad ściany nad tor lotu; lina wizualnie idzie do `player.webPoint`. Skracanie liny tylko płynne (`REEL`), skok = teleport.
- `scene.environment` nadpisuje `material.envMapIntensity` – mocne odbicia tylko przez `env.addReflective(material)`.
- Nie używać `LineGeometry.setPositions` co klatkę (tworzy nowe bufory GPU) – aktualizować bufor w miejscu.
- Kolory budynków liczone w `tools/build-city.mjs` (palety wg rodzaju, `building:colour` z OSM ma pierwszeństwo).
- Formaty: city.json v2 (drzewa `[x, z, rodzaj]`, `zebras`, `lamps`/`signals` = `[x, z, kąt]`, drogi: `c` klasa, `l` pasy, `ow`);
  lod2.bin v2 = Int16 w cm względem `p` budynku (bez UV – liczone w grze z normalnej). Szkło: metalness 0.4, odbicia 0.45.
- Obrys budynku z częściami (`building:part`) jest pomijany (S3DB), ale części wiszące w powietrzu wewnątrz takiego obrysu dostają dopełnienie do ziemi (mapujący często nie mapują podium). Rodzaj `plain` (6) = ściany bez okien (zadaszenia, płyty dachów, kładki).
- Lewa/prawa postaci: +X modelu = LEWA (baza `x = up × fwd`). `handSign` +1 = prawa ręka = kość `*_r`.
- LOD2 jest z 2012 r. – zastępuje budynek OSM tylko gdy wysokości dachu zgadzają się w punktach próbkowania (≥65%, tolerancja max(6 m, 25%)); nowe budynki (Varso, Hub, MSN) zostają z OSM. Indeksy zastąpionych budynków OSM: `lod2.json.replaced` – po każdym build-city trzeba przebudować LOD2 (robi to `npm run build-city`).
- Ręczne poprawki landmarków (kolory, materiały): `tools/overrides.mjs` (id elementu OSM → tagi).
- Budynek > 70 m jest szklany tylko, gdy materiał nie jest kamieniem/cegłą/betonem (PKiN!).
- LOD2 nie zastępuje budynku, gdy bryła OSM ma pustkę w pionie (`osmGapAt`: prześwit InterContinental, nawisy, dachy na słupach).
- Ziemia i dekale (tereny, ulice) nie zapisują głębi: ziemia rysuje się zaraz po niebie (renderOrder −1/−2), dekale po budynkach –
  bez polygonOffset (wcześniej migotały). Kamera: near 0.2, far 12000.
- Shadery modyfikowane przez `onBeforeCompile`: wieloliniowe wstawki GLSL tylko w template literals (`...`); zwykły
  string z prawdziwym znakiem nowej linii psuje parsowanie modułu.
- Ściany budynków OSM są odsunięte o 3–9 cm na zewnątrz (stała per budynek), żeby pokrywające się ściany (części
  OSM, LOD2) nie migotały.
- Bryły kolizji landmarku muszą obejmować wystające detale (lizeny PKiN 0,5–0,7 m: osobne bryły „po licu lizen”) –
  inaczej bohater na ścianie ma głowę w geometrii, a kamera startuje z jej wnętrza. Detale są w raycastach (BVH).
  Flaga `noCollide` z Blendera siedzi na węźle – siatka z kilkoma materiałami to grupa (sprawdzać też rodzica).
- Na ścianie ruch jest względem muru (`_wmove` w player.js: do przodu = w górę); wysokość ściany w danym miejscu
  z `topAt` (dachy spadziste/jednospadowe); przeskok przez krawędź celuje w dach 1,2 m za nią i na 0,45 s wyłącza
  sterowanie w powietrzu (`hopUntil`). Dach jednospadowy z `hf` potrzebuje `e` (eave) – inaczej collide() go nie czyta.
- Start gry: `PLACES[0]` (taras PKiN, tryb `spot`). Jakość: `?q=low`/`?q=high` lub `Q`, automatycznie przy FPS < 26 przez 6 s;
  urządzenia dotykowe (`pointer: coarse`) startują w `low` i z połową ruchu ulicznego.
- Hash w shaderze nigdy z interpolowanego atrybutu bez zaokrąglenia (`floor(vStyle + 0.5)`): drgania interpolacji × hash
  z `sin()` dawały „śnieżenie” okien. Hash bez `sin()` (`hash21` w city.js). Maska szyb = kanał alfa tekstury fasady
  (`maskContext` w textures.js: malarz rysuje drugi raz, szyby białe) – nie progować jasności tekstury.
- Testy dotyku: `resize_window` z szerokością < 768 (emulacja telefonu), zdarzenia `PointerEvent` z `pointerType: 'touch'`.
  Zrzuty z ukrytego panelu: `game.snap(...)` + `toBlob` i POST na lokalny serwer (zrzut ekranu panelu pokazuje starą klatkę).
- Dworzec Centralny: przekrój dachu „trzy krzywe” (łuk między rzędami słupów + skrzydła okapów), 28 słupów w 2 rzędach co 10 m;
  zdjęcia „od frontu” z dwoma słupami pokazują WSCHODNI koniec (od Emilii Plater), nie długi bok.

## Testowanie
W konsoli przeglądarki jest `window.game`. `game.snap([x,y,z], [cel], fov)` renderuje widok z dowolnej kamery na nakładkę (do zrzutów panelu), `game.unsnap()` ją chowa. `game.run(sekundy, ['KeyW','Mouse0'])` symuluje grę bez pętli rAF
(panel podglądu w tle nie rysuje klatek), `game.teleport(i)`, `game.tick(dt)`. Klawisze: kody `KeyboardEvent.code`, mysz `Mouse0`/`Mouse2`.
Testy kamery: pozycje „na ścianie” z `player.collide()` przy krawędziach brył, potem `cam.update` dla 8 kierunków ×
kilku pochyleń; punkt „wewnątrz geometrii” = większość z 6 promieni osiowych trafia najpierw w tylną stronę trójkąta
(`city.bvh.raycastFirst`, normalna · kierunek > 0). Wydajność: stopery wokół `renderer.render` i części `tick`,
czas GPU przez `EXT_disjoint_timer_query_webgl2`. Wersję artefaktu sprawdzać na serwerze z nagłówkiem CSP
`connect-src 'self'` (fetch adresów `blob:` jest wtedy blokowany).

## Materiały promocyjne (wideo, zrzuty)
Klatki renderuje samo demo w panelu przeglądarki. Przeloty: autopilot z planowaniem (MPC) – co 20 ticków zapis stanu
gracza, symulacja 15 wariantów (odchylenie kursu × moment puszczenia liny) na 120 ticków przez `player.update`,
koszt = zderzenia (skok prędkości > 6 m/s poza zaczepieniem liny), ściana, ziemia, niska wysokość; trasy z polilinii
ulic (`city.data.roads`). Przebieg jest powtarzalny tylko po wyzerowaniu stanu gracza (`handSign`, `time`,
`lastRelease`…) na starcie. Kamera do nagrań: osobna `PerspectiveCamera` (nie rusza kamery gry), przesunięcie
względem bohatera wygładzane, wybór pozycji z wolną przestrzenią (raycasty). Ujęcia filmowe: `game.tick` + własna kamera.
Pułapki: w ukrytej karcie `canvas.toBlob` czeka ~1 s – używać `toDataURL`; pas mgły przy horyzoncie ma w buforze
WebGL alfę < 1, więc przed `drawImage` wypełnić płótno kolorem tła strony (inaczej „duchy” poprzednich klatek);
zmiana `camera.position` między tickami zmienia wygładzanie kamery gry i trasę autopilota (zapisać i przywrócić).
Montaż: ffmpeg (xfade, drawtext z `textfile` UTF-8), wersje 16:9 i 4:5; gotowe pliki w `promo/` (poza gitem).
`public/og.jpg` = podgląd linku (og:image z adresem GitHub Pages).

## Plan etapów
1. ✅ Miasto z OSM, kamera, bieg
2. ✅ Fizyka sieci i bujania, bieg po ścianie, przyciąganie (strojenie „czucia” wg uwag użytkownika)
3. ✅ Tekstury fasad (proceduralne – canvas, 8 stylów `FACADE_STYLES`), ulice (oznakowanie, latarnie, sygnalizatory),
   Wisła (woda z odbiciami), bryły LOD2 z GUGiK; mosty płaskie (na poziomie ulic, bez prześwitu – dalej w p. 6)
4. ✅ Postać z Blendera (skrypt bpy → .glb, szkielet; animacja proceduralna w grze)
5. Landmarki jako modele: ✅ PKiN, Dworzec Centralny, Złote Tarasy, Złota 44, InterContinental, iglica Varso, maszt LIM,
   Kolumna Zygmunta, pylon Mostu Świętokrzyskiego; dalej: Spire, Stadion, Zamek
6. ✅ Ruch uliczny (auta, autobusy, tramwaje, piesi), pora dnia z nocnym oświetleniem; dalej: pogoda, postprocessing,
   teren (skarpa, Wisła niżej, mosty)
7. ✅ Publikacja: README, CASE_STUDY, LICENSE (czyste MIT) + NOTICE.md (zakres, dane), netlify.toml, artefakt claude.ai
   (kopia zapasowa), publiczne repozytorium https://github.com/LukasBialozor/warszawa-na-sieci-demo – sam bieżący stan bez historii rozwoju:
   remote `public`, każda publikacja to jeden commit z drzewem `main`
   (`git fetch public` → `git commit-tree main^{tree} -p public/main -m …` → `git push public <sha>:refs/heads/main`).
   Strona: https://lukasbialozor.github.io/warszawa-na-sieci-demo/ – `npm run deploy:pages` (dist/ jako gałąź `gh-pages`, bez workflow;
   push do `.github/workflows/` wymagałby tokenu z uprawnieniem `workflow`).
8. ✅ Telefony: sterowanie dotykowe, niska jakość domyślnie, krótszy zasięg rysowania; poprawki po testach znajomych
   (kamera przy ścianach, wyjście z podwórek, autoobrót kamery, wydajność); dalej: lżejsze dane (mniejszy wycinek)
