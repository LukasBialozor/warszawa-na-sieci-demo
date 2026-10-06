// Adres repozytorium pokazywany w grze. Kolejnosc: zmienna VITE_REPO_URL przy budowaniu, adres odczytany
// z GitHub Pages (uzytkownik.github.io/repo/ -> github.com/uzytkownik/repo), wartosc domyslna ponizej.
const DEFAULT_REPO_URL = 'https://github.com/LukasBialozor/warszawa-na-sieci-demo';

function fromGithubPages() {
  const m = location.hostname.match(/^([\w-]+)\.github\.io$/);
  if (!m) return '';
  const repo = location.pathname.split('/').filter(Boolean)[0];
  return `https://github.com/${m[1]}/${repo || m[1] + '.github.io'}`;
}

export const REPO_URL = import.meta.env.VITE_REPO_URL || fromGithubPages() || DEFAULT_REPO_URL;

// telefon/tablet: sterowanie dotykowe i lzejsze ustawienia (tylko na urzadzeniach dotykowych)
export const TOUCH = matchMedia('(pointer: coarse)').matches;
// zasieg rysowania drobnych obiektow [m]: drzewa, latarnie i sygnalizatory, plamy swiatla latarni
export const DRAW = TOUCH ? { trees: 650, street: 280 } : { trees: 1800, street: 650 };
// telefony: budynki tylko do ~2.4 km, mgla gestsza, zeby granica nie byla widoczna
export const CITY_RANGE = TOUCH ? 2400 : Infinity;
export const FOG = TOUCH ? [300, 2300] : [350, 3800];
