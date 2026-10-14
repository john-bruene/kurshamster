/* Hochschulen mit Stud.IP, deren Adresse geprüft wurde (Stand: Oktober 2026).
 * Wird von der App (Auswahlliste) und vom README (Karte, tools/readme-map.js) verwendet.
 * Neue Hochschule? Eintrag ergänzen und `npm run readme:map` ausführen.
 * Läuft in Node (require) und im Browser (global KH_UNIS). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KH_UNIS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // name, Ort, Stud.IP-Adresse, Breite, Länge
  const LIST = [
    ['Universität Augsburg', 'Augsburg', 'https://digicampus.uni-augsburg.de', 48.3334, 10.8975],
    ['Technische Universität Braunschweig', 'Braunschweig', 'https://studip.tu-braunschweig.de', 52.2735, 10.5297],
    ['Universität Bremen', 'Bremen', 'https://elearning.uni-bremen.de', 53.1069, 8.8522],
    ['Technische Universität Clausthal', 'Clausthal-Zellerfeld', 'https://studip.tu-clausthal.de', 51.8049, 10.3349],
    ['Evangelische Hochschule Dresden', 'Dresden', 'https://studip.ehs-dresden.de', 51.0458, 13.7565],
    ['Hochschule Flensburg', 'Flensburg', 'https://elearning.fh-flensburg.de/studip', 54.7745, 9.4510],
    ['Katholische Hochschule Freiburg', 'Freiburg im Breisgau', 'https://studip.kh-freiburg.de', 47.9985, 7.8410],
    ['Hochschule Geisenheim', 'Geisenheim', 'https://studip.hs-gm.de', 49.9858, 7.9580],
    ['Justus-Liebig-Universität Gießen', 'Gießen', 'https://studip.uni-giessen.de', 50.5800, 8.6770],
    ['Georg-August-Universität Göttingen', 'Göttingen', 'https://studip.uni-goettingen.de', 51.5413, 9.9358],
    ['Martin-Luther-Universität Halle-Wittenberg', 'Halle (Saale)', 'https://studip.uni-halle.de', 51.4860, 11.9690],
    ['Technische Universität Hamburg', 'Hamburg', 'https://e-learning.tuhh.de/studip', 53.4600, 9.9690],
    ['Leibniz Universität Hannover', 'Hannover', 'https://studip.uni-hannover.de', 52.3822, 9.7176],
    ['Pädagogische Hochschule Heidelberg', 'Heidelberg', 'https://studip.ph-heidelberg.de', 49.4130, 8.6800],
    ['HAWK Hildesheim/Holzminden/Göttingen', 'Hildesheim', 'https://studip.hawk.de', 52.1430, 9.9650],
    ['Hochschule für Wirtschaft und Umwelt Nürtingen-Geislingen', 'Nürtingen', 'https://neo.hfwu.de', 48.6264, 9.3432],
    ['Carl von Ossietzky Universität Oldenburg', 'Oldenburg', 'https://elearning.uni-oldenburg.de', 53.1474, 8.1810],
    ['Universität Osnabrück', 'Osnabrück', 'https://studip.uni-osnabrueck.de', 52.2716, 8.0444],
    ['Universität Passau', 'Passau', 'https://studip.uni-passau.de/studip', 48.5670, 13.4510],
    ['Hochschule RheinMain', 'Wiesbaden', 'https://studip.hs-rm.de', 50.0960, 8.2170],
    ['Universität Rostock', 'Rostock', 'https://studip.uni-rostock.de', 54.0887, 12.1405],
    ['Hochschule Schmalkalden', 'Schmalkalden', 'https://studip.hs-schmalkalden.de', 50.7230, 10.4560],
    ['Pädagogische Hochschule Schwäbisch Gmünd', 'Schwäbisch Gmünd', 'https://lms.ph-gmuend.de', 48.7980, 9.8160],
    ['Hochschule Trier', 'Trier', 'https://studip.hochschule-trier.de', 49.7530, 6.6510],
    ['Universität Trier', 'Trier', 'https://studip.uni-trier.de', 49.7460, 6.6880],
    ['Universität Vechta', 'Vechta', 'https://www.studip.uni-vechta.de', 52.7260, 8.2870],
    ['Hochschule Wismar', 'Wismar', 'https://studip.hs-wismar.de', 53.8920, 11.4560],
    ['Ostfalia Hochschule für angewandte Wissenschaften', 'Wolfenbüttel', 'https://studip.ostfalia.de', 52.1650, 10.5470],
  ];
  const universities = LIST.map(([name, city, url, lat, lon]) => ({ name, city, url, lat, lon }));
  return { universities, DEFAULT_URL: 'https://studip.uni-goettingen.de' };
});
