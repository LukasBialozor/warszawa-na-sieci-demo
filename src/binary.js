// Pliki binarne gry (lod2.bin, modele .glb). Hosting, ktory serwuje tylko tekst i obrazy (np. artefakty claude.ai),
// dostaje je jako base64 w plikach <nazwa>.txt - gra jest wtedy budowana z VITE_BINARY_AS_TEXT=1
// (npm run build:artifact, tools/build-artifact.mjs).
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const AS_TEXT = import.meta.env.VITE_BINARY_AS_TEXT === '1';

export async function fetchBinary(url) {
  const res = await fetch(AS_TEXT ? url + '.txt' : url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  if (!AS_TEXT) return res.arrayBuffer();
  const text = (await res.text()).trim();
  if (Uint8Array.fromBase64) return Uint8Array.fromBase64(text).buffer;
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out.buffer;
}

// Tekstury wbudowane w .glb: GLTFLoader robi z nich adres blob: i (ImageBitmapLoader) pobiera go przez fetch(),
// co blokuje CSP hostingu z connect-src 'self' (artefakty claude.ai - landmarki wychodzily biale). Ta wtyczka
// dekoduje obraz wprost z danych modelu przez createImageBitmap(Blob), bez zadnego zapytania. Sampler, cache i
// flipY dalej ustawia GLTFLoader (loadTextureImage). Gdy loader wybral TextureLoader (stary Safari/Firefox),
// zostaje jego sciezka (<img> z blob:).
function embeddedImages(parser) {
  return {
    name: 'embedded_images',
    loadTexture(textureIndex) {
      const json = parser.json;
      const sourceIndex = json.textures[textureIndex].source;
      const image = json.images[sourceIndex];
      if (image?.bufferView === undefined || !parser.textureLoader.isImageBitmapLoader) return null;
      const bitmap = parser.getDependency('bufferView', image.bufferView).then(view =>
        createImageBitmap(new Blob([view], { type: image.mimeType }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }));
      const loader = { isImageBitmapLoader: true, load: (url, onLoad, onProgress, onError) => bitmap.then(onLoad, onError) };
      return parser.loadTextureImage(textureIndex, sourceIndex, loader);
    },
  };
}

export async function loadGltf(url) {
  const data = await fetchBinary(url);
  return new GLTFLoader().register(embeddedImages).parseAsync(data, url.slice(0, url.lastIndexOf('/') + 1));
}
