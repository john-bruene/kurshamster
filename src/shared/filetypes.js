/* Dateikategorien für Filter und Formatierung von Größen.
 * Läuft in Node (require) und im Browser (global KH_TYPES). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KH_TYPES = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CATEGORIES = ['documents', 'slides', 'sheets', 'images', 'videos', 'audio', 'archives', 'code', 'other'];

  const EXT = {
    documents: 'pdf doc docx odt rtf txt md tex epub pages djvu ps xps',
    slides: 'ppt pptx pps ppsx odp key',
    sheets: 'xls xlsx xlsm ods csv tsv numbers',
    images: 'jpg jpeg png gif svg webp heic heif tif tiff bmp',
    videos: 'mp4 m4v mov avi mkv webm wmv flv mpg mpeg 3gp ogv ts',
    audio: 'mp3 wav m4a aac ogg oga flac opus wma',
    archives: 'zip rar 7z tar gz tgz bz2 xz',
    code: 'r rmd qmd py ipynb m mat do ado dta sas sps sav por rdata rda rds jl json xml yaml yml sql html htm css js ts java c h cpp hpp cs go rs sh bat ps1 nb wls gms mod dat',
  };

  const byExt = new Map();
  for (const [cat, list] of Object.entries(EXT)) for (const e of list.split(' ')) byExt.set(e, cat);

  function categoryOf(name) {
    const m = /\.([a-z0-9]{1,8})$/i.exec(String(name || ''));
    return (m && byExt.get(m[1].toLowerCase())) || 'other';
  }

  function formatBytes(n, locale) {
    const loc = locale || 'de-DE';
    if (!n) return '0 MB';
    if (n >= 1e9) return (n / 1e9).toLocaleString(loc, { maximumFractionDigits: 2 }) + ' GB';
    if (n >= 1e6) return (n / 1e6).toLocaleString(loc, { maximumFractionDigits: 1 }) + ' MB';
    return Math.max(1, Math.round(n / 1e3)).toLocaleString(loc) + ' kB';
  }

  /** Gibt true zurück, wenn eine Datei den Filter passiert. */
  function passes(file, filter) {
    if (!filter) return true;
    if (filter.categories && !filter.categories.includes(file.cat || categoryOf(file.name))) return false;
    if (filter.maxBytes && file.size != null && file.size > filter.maxBytes) return false;
    return true;
  }

  return { CATEGORIES, categoryOf, formatBytes, passes };
});
