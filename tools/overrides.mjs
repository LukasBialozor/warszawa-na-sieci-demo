// Reczne poprawki tagow OSM dla landmarkow (id elementu OSM -> tagi nadpisujace).
// Stosowane w build-city przed obliczeniem wysokosci/kolorow. Zrodlo wygladu: zdjecia referencyjne (np. locationscout).
const ZT_GLASS = { 'building:colour': '#a9c6c0', 'roof:colour': '#a9c6c0' }; // jasne, lekko zielonkawe szklo dachu Zlotych Tarasow

export const OVERRIDES = {
  // Zlote Tarasy - kopuly falistego dachu
  237574573: ZT_GLASS, 239721522: ZT_GLASS, 239721523: ZT_GLASS, 239721524: ZT_GLASS, 239721525: ZT_GLASS,
  239721526: ZT_GLASS, 239721527: ZT_GLASS, 239721528: ZT_GLASS, 239721529: ZT_GLASS,
};
