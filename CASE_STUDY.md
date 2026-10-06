# Case study: demo technologiczne „Warszawa na sieci” zbudowane z Claude Code

Ten dokument opisuje, jak powstał projekt: kto co robił, jakich narzędzi i danych użyto, ile to trwało i ile
kosztowało. Projekt to demo technologiczne pokazujące możliwości obecnych modeli AI i tempo ich rozwoju: agent AI
do programowania przeprowadził go od pustego katalogu do działającej, opublikowanej aplikacji 3D.

## W skrócie

| | |
|---|---|
| Czas kalendarzowy | 9 dni (28.09–06.10.2026), praca w kilku sesjach |
| Aktywna praca AI | ok. 20 godzin (czas, w którym pracował agent); subagenty (badania, audyty dokumentacji) działały równolegle, łącznie ok. 50 godzin pracy agentów |
| Praca człowieka | szacunkowo 4,5 godziny: ok. 40 poleceń, ręczne testowanie, zrzuty ekranu i zdjęcia referencyjne, zebranie uwag od znajomych testujących demo |
| Kod napisany przez człowieka | 0 linii; cały kod, skrypty modeli i potok danych napisał Claude Code |
| Model | Claude Opus 5.5 w aplikacji Claude Code (desktop, Windows) |
| Zapytania do modelu | ok. 2,8 tys. |
| Tokeny wejściowe | ok. 806 mln, z czego ok. 98% to odczyty z cache promptów (kontekst rozmowy przetwarzany ponownie w każdym kroku) |
| Tokeny wygenerowane | ok. 2,5 mln (kod, skrypty, opisy, rozumowanie) |
| Symulowany koszt API | ok. 294 USD według cennika API Claude Opus 5.5 |
| Efekt | ok. 7,7 tys. linii JavaScript/Python, 8 plików modeli z Blendera, ok. 18 MB danych miasta i modeli, wideo i zrzuty wyrenderowane przez samo demo; drugie miasto (Wrocław) w przygotowaniu |

### Jak policzono koszt

Liczby tokenów pochodzą z zapisów sesji Claude Code (pole `usage` każdej odpowiedzi modelu). Ceny to cennik API
Claude Opus 5.5 z października 2026:

| Rodzaj tokenów | Liczba | Cena za 1 mln | Koszt |
|---|---|---|---|
| Wejście bez cache | ok. 5,6 tys. | 4,00 USD | ~0 USD |
| Zapis do cache (TTL 1 h) | ok. 6,8 mln | 8,00 USD | ok. 55 USD |
| Zapis do cache (TTL 5 min) | ok. 6,2 mln | 5,00 USD | ok. 31 USD |
| Odczyt z cache | ok. 793 mln | 0,20 USD | ok. 159 USD |
| Wyjście | ok. 2,5 mln | 20,00 USD | ok. 50 USD |
| **Razem** | | | **ok. 294 USD** |

Dla porównania: bez cache promptów te same tokeny wejściowe kosztowałyby ok. 3,2 tys. USD. Przy pracy w Claude
Code w ramach subskrypcji (plan Max) płaci się stały abonament, więc rzeczywisty koszt projektu był częścią
miesięcznej opłaty. Kwota z tabeli pokazuje, ile kosztowałby ten sam przebieg przez API.

### Ile pracy by to wymagało ręcznie

Ostrożny szacunek: doświadczony programista grafiki 3D (three.js + Blender + GIS) potrzebowałby **4–8 tygodni**
pełnego etatu. Najwięcej zajęłyby potok danych (OSM, LOD2, dopasowanie obu źródeł), modele landmarków i fizyka
bujania. To szacunek, nie pomiar.

## Podział pracy

**Człowiek** wyznaczał kierunek i oceniał efekty:
- pomysł (bujanie na sieci nad współczesną Warszawą);
- instalacja Blendera;
- zrzuty ekranu z błędami (migoczące ściany, kamera w ścianie, „budynek bez dołu”, zbyt ciemna noc);
- zdjęcia referencyjne (Google Maps 3D, zdjęcia dworca i Złotych Tarasów);
- priorytety („dokładność ponad wszystko”, „start na PKiN”, „przygotuj do publikacji”).

**Claude Code** wykonał całą resztę:
- architektura aplikacji, fizyka, kamera, HUD, ruch uliczny, pora dnia;
- skrypty pobierające i przetwarzające dane (OSM, CityGML GUGiK, układy współrzędnych);
- modele 3D jako skrypty Pythona dla Blendera uruchamianego bez okna;
- wyszukiwanie informacji o budynkach (subagent badawczy: Wikipedia, rejestr zabytków, artykuły architektoniczne);
- weryfikacja w przeglądarce: zrzuty ekranu, testy liczbowe kolizji i kamery, porównania ze zdjęciami;
- dokumentacja i przygotowanie do publikacji.

## Narzędzia i dane

| Narzędzie | Do czego |
|---|---|
| Claude Code (Opus 5.5) | całe programowanie; wbudowana przeglądarka do testów i podglądu zdjęć referencyjnych; subagent do badań |
| three.js 0.186, Vite 8 | renderowanie 3D (WebGL2) i budowanie |
| three-mesh-bvh | szybkie raycasty (celowanie siecią, kolizja kamery) |
| Blender 5.2 (`bpy`, tryb wsadowy) | modele: bohater ze szkieletem, PKiN, Dworzec Centralny, Złote Tarasy, Złota 44, hotel InterContinental, Most Świętokrzyski (pylon i wanty), iglica Varso, maszt LIM, Kolumna Zygmunta |
| Node.js + proj4 | potok danych: Overpass API, CityGML (EPSG:2180, układ PL-1992), triangulacja, kwantyzacja |
| OpenStreetMap (Overpass API) | budynki z częściami 3D, drogi, tereny, drzewa z gatunkami, przejścia, latarnie, granice dzielnic |
| GUGiK Budynki 3D LOD2 | rzeczywiste kształty dachów ok. 4 tys. budynków (skanowanie laserowe z 2012) |
| Wikimedia Commons, Wikipedia, zdjęcia użytkownika | wyłącznie referencje przy modelowaniu (proporcje, kolory, konstrukcja); żadne zdjęcie nie trafiło do projektu |

## Przebieg

1. **Fundament.** Pobranie OSM w kaflach z cache (serwery Overpass często odrzucają duże zapytania), budowa miasta
   w kawałkach 400 m, kolizje jako graniastosłupy, kamera trzecioosobowa.
2. **Bujanie.** Wahadło z liną o zmiennej długości, bieg po ścianach, przyciąganie, nurkowanie. Kluczowa poprawka:
   punkt obrotu przesunięty znad ściany nad tor lotu, bo wcześniej bohater wahał się w stronę muru i w niego
   uderzał.
3. **Bohater z Blendera.** Tułów z przekrojów (superelipsy), kończyny jako rury, szkielet 19 kości, wzór sieci
   rysowany shaderem. Animacja proceduralna w czasie rzeczywistym.
4. **Dokładność miasta.**
   - Modele LOD2 z GUGiK, dopasowane do OSM przez próbkowanie wysokości dachów w siatce punktów. Budynek zmieniony
     od 2012 roku zostaje z OSM, podobnie budynek, którego bryła ma „pustkę” w pionie (prześwit hotelu
     InterContinental).
   - Kwantyzacja do Int16 zmniejszyła plik z ~24 MB do 5 MB.
5. **Landmarki.**
   - Subagent zebrał wymiary i opisy, a modele powstały jako skrypty Blendera pracujące w układzie współrzędnych
     sceny.
   - Ciekawostka: pierwszy model Dworca Centralnego miał słupy przy długich krawędziach dachu. Zdjęcia
     użytkownika pokazywały dwa słupy pod łukiem dachu, a źródła mówiły o „dachu na dwóch rzędach smukłych
     słupów” o przekroju „trzech krzywych”. Agent połączył te informacje: zdjęcia przedstawiały wschodnią ścianę
     szczytową, a dwa słupy to końce obu rzędów. Model przebudowano zgodnie z tym.
6. **Detale.**
   - 8 stylów fasad z osobnym parterem (tablica tekstur, shader wybiera rząd parteru);
   - drzewa według gatunków z OSM;
   - oznakowanie pasów urywające się w skrzyżowaniach;
   - zebry, latarnie i sygnalizacja.
7. **Życie i światło.**
   - Ruch uliczny po grafie zbudowanym z polilinii OSM (prawostronny, z zachowaniem odstępów).
   - Tramwaje z członami podążającymi po torze.
   - Droga słońca liczona astronomicznie dla Warszawy i bieżącej daty.
   - Noc: okna, latarnie z plamami światła, podświetlony PKiN.
8. **Solidność i publikacja.**
   - Poprawki zgłoszonych błędów: migotanie współpłaszczyznowych ścian, kamera wchodząca w ściany (test 680 pozycji
     przy ścianach, zero przypadków kamery w bryle), zabezpieczenie przed błędem numerycznym.
   - Względne ścieżki, wersja produkcyjna sprawdzona z podkatalogu (jak na GitHub Pages).
   - Automatyczne obniżanie jakości przy niskim FPS, konfiguracja Netlify (`netlify.toml`) i gotowy workflow
     GitHub Pages (`docs/deploy-pages.yml`).
9. **Noc, telefony, link dla znajomych.**
   - Noc była za ciemna: doszły rozproszone światło nieba, łuna miasta, poświata latarni na dolnych piętrach
     i oświetlona jezdnia.
   - Sterowanie dotykowe: pływający drążek (wychylenie do końca = sprint), rozglądanie przeciąganiem, przyciski
     akcji. Przyciski udają klawisze, więc fizyka bohatera nie wymagała zmian. Na telefonach demo startuje w niskiej
     jakości i z mniejszym ruchem ulicznym.
   - Publikacja jako artefakt claude.ai (wersja online: https://claude.ai/artifact/7cQnEK5YTdtchLC79KEtgL).
     Ten hosting nie serwuje plików binarnych, więc osobny build
     (`npm run build:artifact`) zapisuje model LOD2 i modele `.glb` jako base64 w plikach `.txt`. Strona dekoduje je
     przy wczytywaniu.
10. **Testy ze znajomymi.** Człowiek wysłał link kilku osobom i przekazał ich uwagi (zrzuty z telefonów, opisy).
   Agent poprawił:
   - **kamerę przy ścianach**: kolizja PKiN nie obejmowała wystających o 0,7 m lizen, więc bohater biegł po ścianie
     z głową w lizenie, a kamera startowała z jej wnętrza. Do modelu doszły bryły kolizji po licu lizen, a kamera
     liczy kolizję promieniami z głowy, zjeżdża wzdłuż przeszkody albo odsuwa się w bok. Test 21 tys. ujęć na
     ścianach PKiN: bohater znikał z kadru w 82% ujęć, po poprawkach w 4%;
   - **wyjście z podwórka-studni** (zgłoszenie z telefonu): wyższy kąt patrzenia w górę (75° zamiast 54°),
     wspinaczka sterowana względem muru, a nie kamery, przeskok na dach spadzisty za okapem;
   - **sterowanie dotykowe**: szybsze rozglądanie z przyspieszeniem, kamera sama obraca się za ruchem, mniej
     przycisków, podpowiedź przy pierwszym uruchomieniu;
   - **spadki klatek**: pomiar pokazał, że karta graficzna potrzebuje 3–7 ms, a procesor ok. 12 ms na samo
     przygotowanie rysowania. Winne było odrzucanie poza kadrem każdego z ok. 100 tys. drzew, latarni i
     sygnalizatorów osobno, w każdym przebiegu (także cieni). Własne odrzucanie po komórkach 100 m, liczone kilka
     razy na sekundę, dało ok. 2 ms. Na telefonach dodatkowo krótszy zasięg rysowania i gęstsza mgła;
   - **Złotą 44** według zdjęć człowieka: bryły wprost z części budynku w OSM (rdzeń, „żagiel” ze skośnym wierzchem,
     przeszklone fałdy, podium) i biała elewacja w poziome pasy zamiast niebieskiego szkła;
   - **białe landmarki w wersji online** (opis niżej).
11. **Najbardziej rozpoznawalne budynki.** Na prośbę człowieka („InterContinental nie jest idealny”) subagent zebrał
   oficjalne parametry kilkunastu wieżowców i mostu (CTBUH, Wikipedia, artykuły techniczne), a agent porównał je
   z bryłami w scenie. Powstały modele InterContinentalu (prześwit między 5. a 21. kondygnacją według części budynku
   w OSM i opisu konstrukcji, kamienna skośna ściana, kasetonowy strop) i Mostu Świętokrzyskiego (pylon A
   90 m, 48 want). Mostu wcześniej brakowało, choć był jednym z punktów teleportu.
12. **Drugie miasto (w przygotowaniu, jeszcze nieopublikowane).** W wersji rozwojowej demo zaczyna się od wyboru
   miasta. Wrocław powstał tym samym potokiem
   (Overpass, budowa miasta), ale GUGiK nie ma LOD2 dla Dolnego Śląska, więc brakujące wysokości budynków
   uzupełniono z LoD1 2024. Start: szklana, skośnie ścięta korona Sky Tower.

13. **Przygotowanie do udostępnienia.** Z kostiumu zniknął symbol na piersi, a z InterContinentalu logo i napis
   marki. Wideo promocyjne, zrzuty i obraz podglądu linku wyrenderowała sama aplikacja. Pierwsza wersja filmu miała
   wady wytknięte przez człowieka: bohater odbijał się od budynków, a nocą kamera „wariowała”. Agent napisał więc
   autopilota, który co jedną trzecią sekundy symuluje 15 wariantów lotu na 2 s do przodu (prawdziwa fizyka z demo)
   i wybiera ten bez zderzeń, oraz osobną, wygładzoną kamerę, która szuka wolnego miejsca wokół bohatera. Do filmu
   trafiły tylko fragmenty bez kontaktu ze ścianą, ziemią i bez gwałtownych zmian prędkości; montaż w ffmpeg
   z polskimi podpisami. Na koniec projekt trafił do publicznego repozytorium (sam bieżący stan, bez historii
   rozwoju), a strona na GitHub Pages.

## Ciekawsze problemy techniczne

- **Migotanie ziemi.** Dekale ulic z `polygonOffset` przegrywały z ziemią daleko od kamery. Rozwiązanie: ziemia i
  dekale nie zapisują głębi i rysują się w ustalonej kolejności (niebo, ziemia, budynki, dekale), więc test
  głębi nie ma o co się „bić”.
- **Dwa źródła geometrii.** OSM jest aktualne, ale uproszczone; LOD2 jest dokładne, ale z 2012 roku. Połączenie
  ich według zgodności wysokości w punktach próbkowania daje miasto „jak dziś” z prawdziwymi dachami.
- **Modele w układzie sceny.** Skrypty Blendera budują geometrię od razu we współrzędnych sceny (oś Blendera
  (x, −z, y), eksport glTF z osią Y w górę). Modele nie wymagają ustawiania, a kolizje i obszary wykluczeń
  zapisują się obok modelu w pliku JSON.
- **„Śnieżenie” zapalonych okien.** Losowanie, które okno świeci, brało interpolowany atrybut stylu budynku.
  Interpolacja zmienia wartość o ułamki między pikselami, a hash oparty na `sin()` wzmacnia takie różnice do
  zupełnie innych wyników, więc okna wyglądały jak szum telewizora. Poprawka: zaokrąglony styl, hash bez `sin()`
  i maska szyb zapisana w kanale alfa tekstury fasady (ten sam malarz rysuje drugi raz w trybie maski).
- **Białe landmarki w wersji online.** Lokalnie wszystko działało, a po publikacji PKiN był biały. Polityka
  bezpieczeństwa (CSP) opublikowanej strony pozwala pobierać tylko pliki z tego samego serwera, a GLTFLoader wczytuje tekstury
  z modeli przez `fetch()` adresu `blob:`. Agent odtworzył błąd lokalnie, serwując stronę z takim samym nagłówkiem CSP.
  Poprawka to mała wtyczka loadera, która dekoduje obraz wprost z danych modelu (`createImageBitmap`).
- **Gdzie naprawdę idzie czas klatki.** Odczucie „laguje przy dużych budynkach” sugerowało kartę graficzną,
  ale pomiar (zapytania czasowe GPU i stopery w kodzie) wskazał procesor: `BatchedMesh` w three.js z włączonym
  `perObjectFrustumCulled` sprawdza każdy egzemplarz w każdym przebiegu i co klatkę wysyła teksturę pośrednią.
  Wyłączenie wszystkich takich obiektów skróciło przygotowanie klatki z 12,2 do 0,6 ms, co od razu wskazało
  winowajcę.
- **Kolizja a geometria widoczna.** Dekoracje PKiN (lizeny, gzymsy) trafiały do raycastów, choć miały być z nich
  wyłączone: flaga z Blendera siedzi na węźle glTF, a siatka z kilkoma materiałami to grupa z dziećmi. Agent
  wykrył to testem, który sprawdzał, czy punkt leży wewnątrz zamkniętej geometrii (promienie trafiające w tylne
  strony trójkątów).
- **Weryfikacja bez ekranu.** Panel podglądu w tle nie odświeża klatek, więc agent napisał API testowe
  (`game.run`, `game.tick`, `game.snap`). Pozwala ono symulować zadaną liczbę sekund i renderować dowolne ujęcia na
  żądanie.

## Ograniczenia (stan obecny)

- Teren jest płaski: brak skarpy warszawskiej, Wisła leży na poziomie ulic, mosty nie mają prześwitu.
- Fasady są proceduralne (style według dzielnicy i typu), a nie wierne zdjęciom konkretnych kamienic.
- Ruch uliczny nie zatrzymuje się na światłach; pojazdy i piesi nie zderzają się z bohaterem.
- Na telefonach działa sterowanie dotykowe, ale wersja online pobiera ok. 22 MB danych (pliki binarne jako base64),
  a płynność zależy od telefonu.
  Agent testował dotyk w emulacji przeglądarki; na prawdziwych telefonach demo sprawdzali znajomi autora.

## Jak to powtórzyć

Gotowe dane miasta i modele są w repozytorium, więc do uruchomienia wystarczą `npm install` i `npm run dev`.
Cały potok da się też odtworzyć: `npm run fetch-osm`, `npm run build-city`, `npm run build-landmarks`. Wcześniej
trzeba zapisać paczkę LOD2 GUGiK (`1465_gml.zip`, 116 MB) jako `data/raw/gugik/1465_gml.zip` (bez niej
`build-city` pomija LOD2), a `build-landmarks` wymaga Blendera 5.2 (zmienna `BLENDER` = ścieżka). Plik `CLAUDE.md` zawiera notatki, z których agent korzystał między sesjami
(konwencje układu współrzędnych, pułapki, sposób testowania). To dobry punkt wejścia dla kogoś, kto chce dalej
rozwijać projekt z Claude Code.
