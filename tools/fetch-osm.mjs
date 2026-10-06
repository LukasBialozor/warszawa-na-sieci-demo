// Pobiera surowe dane OSM (Overpass API) dla wycinka Warszawy -> data/raw/osm.json
// Zapytanie jest dzielone na warstwy i kafle, bo publiczne serwery Overpass odrzucaja duze zapytania (504).
// Uzycie: npm run fetch-osm
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { BBOX } from '../src/geo.js';

const TILES = 3; // podzial bboxa na TILES x TILES kafli
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const LAYERS = {
  buildings: b => `
    way["building"](${b});
    relation["building"]["type"="multipolygon"](${b});
    way["building:part"](${b});
    relation["building:part"]["type"="multipolygon"](${b});`,
  roads: b => `
    way["highway"](${b});
    way["railway"~"^(rail|tram|light_rail|subway)$"](${b});`,
  areas: b => `
    way["leisure"~"^(park|garden|pitch|playground)$"](${b});
    relation["leisure"~"^(park|garden)$"](${b});
    way["landuse"~"^(grass|forest|recreation_ground|cemetery|meadow|village_green)$"](${b});
    relation["landuse"~"^(grass|forest|recreation_ground|cemetery|meadow)$"](${b});
    way["natural"~"^(water|wood|scrub|grassland|sand|beach)$"](${b});
    relation["natural"~"^(water|wood|sand|beach)$"](${b});
    way["waterway"="riverbank"](${b});`,
  trees: b => `
    node["natural"="tree"](${b});`,
  // detale ulic: przejscia dla pieszych, sygnalizacja, latarnie
  street: b => `
    node["highway"~"^(crossing|traffic_signals|street_lamp)$"](${b});
    node["railway"~"^(crossing|tram_crossing|tram_level_crossing|level_crossing)$"](${b});`,
  // granice dzielnic (admin_level 9) i obszarow MSI (10) + nazwy osiedli/rejonow
  places: b => `
    relation["boundary"="administrative"]["admin_level"~"^(9|10)$"](${b});
    node["place"~"^(suburb|quarter|neighbourhood)$"](${b});`,
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runQuery(body) {
  const query = `[out:json][timeout:180];(${body});out geom;`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'warszawa-swing/0.1 (hobby game prototype)' },
        body: 'data=' + encodeURIComponent(query),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()).elements;
    } catch (e) {
      console.log(`    ${url} -> ${e.message}, ponawiam...`);
      await sleep(3000 * (attempt + 1));
    }
  }
  throw new Error('Wszystkie proby nieudane');
}

mkdirSync('data/raw/cache', { recursive: true });
const all = new Map();

for (const [name, layer] of Object.entries(LAYERS)) {
  for (let i = 0; i < TILES; i++) {
    for (let j = 0; j < TILES; j++) {
      const cache = `data/raw/cache/${name}_${i}_${j}.json`;
      let els;
      if (existsSync(cache)) {
        els = JSON.parse(readFileSync(cache, 'utf8'));
      } else {
        const s = BBOX.south + (BBOX.north - BBOX.south) * i / TILES;
        const n = BBOX.south + (BBOX.north - BBOX.south) * (i + 1) / TILES;
        const w = BBOX.west + (BBOX.east - BBOX.west) * j / TILES;
        const e = BBOX.west + (BBOX.east - BBOX.west) * (j + 1) / TILES;
        console.log(`${name} [${i},${j}] ...`);
        els = await runQuery(layer(`${s},${w},${n},${e}`));
        writeFileSync(cache, JSON.stringify(els));
      }
      for (const el of els) all.set(`${el.type}/${el.id}`, el);
    }
  }
}

const out = JSON.stringify({ elements: [...all.values()] });
writeFileSync('data/raw/osm.json', out);
console.log(`OK: ${all.size} elementow, ${(out.length / 1e6).toFixed(1)} MB -> data/raw/osm.json`);
