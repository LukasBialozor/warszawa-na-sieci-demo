// Wspolna konfiguracja geograficzna - uzywana przez gre (src/) i narzedzia (tools/).
// Wycinek: Wola (Rondo Daszynskiego) -> Srodmiescie -> Stare Miasto -> Wisla -> Stadion Narodowy
export const BBOX = { south: 52.220, west: 20.975, north: 52.252, east: 21.050 };

// Poczatek ukladu wspolrzednych: Palac Kultury i Nauki
export const ORIGIN = { lat: 52.2318, lon: 21.0060 };

const M_PER_DEG_LAT = 111132.954 - 559.822 * Math.cos(2 * ORIGIN.lat * Math.PI / 180);
const M_PER_DEG_LON = 111412.84 * Math.cos(ORIGIN.lat * Math.PI / 180);

// Swiat gry: x = wschod [m], z = -polnoc [m] (os -z to polnoc), y = gora
export function project(lat, lon) {
  return [(lon - ORIGIN.lon) * M_PER_DEG_LON, -(lat - ORIGIN.lat) * M_PER_DEG_LAT];
}

export const BOUNDS = (() => {
  const [x0, z0] = project(BBOX.north, BBOX.west);
  const [x1, z1] = project(BBOX.south, BBOX.east);
  return { minX: x0, minZ: z0, maxX: x1, maxZ: z1 };
})();

// Miejsca do teleportu (klawisze 1-8). mode: 'ground' = na ulicy, 'roof' = na dachu najwyzszego budynku w poblizu
// (minArea: najmniejsza powierzchnia dachu, na ktorym mozna stanac [m2])
export const PLACES = [
  // start: taras na koronie szybu Palacu Kultury, widok na zachod (Zlota 44, Varso, Rondo ONZ)
  { name: 'Pałac Kultury i Nauki', mode: 'spot', x: -4.4, y: 126, z: 9.6, yaw: 1.93 },
  { name: 'Rondo ONZ', lat: 52.2331, lon: 20.9981, mode: 'ground' },
  { name: 'Varso Tower (iglica)', lat: 52.22866, lon: 21.00016, mode: 'roof', minArea: 15 },
  { name: 'Rondo Daszyńskiego', lat: 52.2301, lon: 20.9841, mode: 'ground' },
  { name: 'Warsaw Spire', lat: 52.23233, lon: 20.98410, mode: 'roof' },
  { name: 'Plac Zamkowy', lat: 52.2475, lon: 21.0135, mode: 'ground' },
  { name: 'Most Świętokrzyski', lat: 52.2396, lon: 21.0330, mode: 'ground' },
  { name: 'Stadion Narodowy', lat: 52.2386, lon: 21.0405, mode: 'ground' },
];

// Landmarki: tablica z nazwa pokazuje sie, gdy gracz zbliza sie na promien r [m]
export const LANDMARKS = [
  { name: 'Pałac Kultury i Nauki', info: '237 m · 1955', lat: 52.2318, lon: 21.0062, r: 140 },
  { name: 'Dworzec Centralny', info: 'Warszawa Centralna · 1975', lat: 52.2289, lon: 21.0030, r: 110 },
  { name: 'Złote Tarasy', info: 'szklany dach z 4780 tafli · 2007', lat: 52.2301, lon: 21.0024, r: 90 },
  { name: 'Złota 44', info: 'Daniel Libeskind · 192 m', lat: 52.2312, lon: 21.0026, r: 70 },
  { name: 'Varso Tower', info: 'najwyższy budynek w UE · 310 m', lat: 52.22866, lon: 21.00016, r: 90 },
  { name: 'Rondo ONZ', info: 'Rondo 1 · Q22 · Cosmopolitan', lat: 52.2331, lon: 20.9981, r: 90 },
  { name: 'Warsaw Spire', info: '220 m · 2016', lat: 52.23233, lon: 20.98410, r: 90 },
  { name: 'Zamek Królewski', info: 'odbudowany 1971–1984', lat: 52.2479, lon: 21.0152, r: 100 },
  { name: 'Kolumna Zygmunta', info: '1644 · najstarszy świecki pomnik Warszawy', lat: 52.24726, lon: 21.01338, r: 45 },
  { name: 'Rynek Starego Miasta', info: 'UNESCO', lat: 52.2497, lon: 21.0122, r: 70 },
  { name: 'Barbakan', info: '1548', lat: 52.2516, lon: 21.0098, r: 50 },
  { name: 'Grób Nieznanego Żołnierza', info: 'Plac Piłsudskiego', lat: 52.2410, lon: 21.0110, r: 60 },
  { name: 'Teatr Wielki – Opera Narodowa', info: '1833', lat: 52.2434, lon: 21.0105, r: 80 },
  { name: 'Most Świętokrzyski', info: 'most wantowy · pylon 90 m', lat: 52.2396, lon: 21.0330, r: 160 },
  { name: 'Stadion Narodowy', info: '58 tys. miejsc · 2011', lat: 52.2395, lon: 21.0458, r: 200 },
  { name: 'Centrum Nauki Kopernik', info: '2010', lat: 52.2418, lon: 21.0288, r: 90 },
  { name: 'Uniwersytet Warszawski', info: 'Krakowskie Przedmieście', lat: 52.2403, lon: 21.0187, r: 80 },
  { name: 'Hala Mirowska', info: '1901', lat: 52.2374, lon: 20.9963, r: 60 },
];
