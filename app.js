/* ============================================================================
 *  NEXUS GAME HUB — app.js
 *  Master engine: data pipelines, global state, library/favorites persistence,
 *  manual deal entry, hi-res art, infinite-scroll pagination, sub-filter matrix,
 *  and dynamic DOM rendering.
 *  Vanilla JS, no build step. Persists to localStorage.
 * ========================================================================== */
'use strict';

/* --------------------------------------------------------------------------
 * 1. STATIC CONFIGURATION
 * ------------------------------------------------------------------------ */

const SYSTEMS = [
  { id: 'pc',      label: 'PC',          tag: 'PC',  color: '#22d3ee', emoji: '💻' },
  { id: 'xbox',    label: 'Xbox',        tag: 'XSX', color: '#22c55e', emoji: '💚' },
  { id: 'ps',      label: 'PlayStation', tag: 'PS5', color: '#3b82f6', emoji: '💙' },
  { id: 'switch',  label: 'Switch 1',    tag: 'SW',  color: '#ef4444', emoji: '🔴' },
  { id: 'switch2', label: 'Switch 2',    tag: 'SW2', color: '#f97316', emoji: '🟠' },
];

// Category -> which systems it belongs to (for filtering) + presentation.
const CATEGORIES = [
  { id: 'free',        title: '100% Free to Claim Right Now', emoji: '🎁', accent: '#22c55e',
    blurb: 'Limited-time — premium games temporarily $0. Claim before they rotate!', systems: ['pc'] },
  { id: 'pc',          title: 'PC Master Race Deals', emoji: '💻', accent: '#22d3ee',
    blurb: 'Steam · GOG · Epic price drops', systems: ['pc'] },
  { id: 'playstation', title: 'PlayStation Lounge',   emoji: '💙', accent: '#3b82f6',
    blurb: 'PS Store discounts for PS4 & PS5', systems: ['ps'] },
  { id: 'xbox',        title: 'Xbox Arena',           emoji: '💚', accent: '#22c55e',
    blurb: 'Xbox & Microsoft Store deals', systems: ['xbox'] },
  { id: 'nintendo',    title: 'Nintendo eShop Discounts', emoji: '🛑', accent: '#ef4444',
    blurb: 'Switch 1 & Switch 2 eShop sales', systems: ['switch', 'switch2'] },
  { id: 'f2p',         title: 'Free-to-Play Staples (Always Free)', emoji: '🎮', accent: '#3b82f6',
    blurb: 'Permanently free — no purchase, no expiry, valid links forever', systems: ['pc', 'ps', 'xbox'] },
];

// Independent sub-filter dropdowns for console sections. PC & Free sections use
// the multi-select STORE_CHECKS checkbox row instead (see sectionHTML).
const SUBFILTERS = {
  playstation: [{ v: 'all', l: 'All' }, { v: 'ps4', l: 'PS4' }, { v: 'ps5', l: 'PS5' }, { v: 'psplus', l: 'PS Plus Free' }],
  xbox:        [{ v: 'all', l: 'All' }, { v: 'series', l: 'Series X|S' }, { v: 'one', l: 'Xbox One' }, { v: 'gamepass', l: 'Game Pass' }],
  nintendo:    [{ v: 'all', l: 'All' }, { v: 'switch', l: 'Switch 1' }, { v: 'switch2', l: 'Switch 2' }, { v: 'eshop', l: 'eShop Exclusives' }],
};

// Sub-type -> short tag badge label.
const SUBTAG = { ps5: 'PS5', ps4: 'PS4', psplus: 'PS+', switch: 'SW', switch2: 'SW2', eshop: 'eShop', series: 'XSX', one: 'XB1', gamepass: 'GP' };

const STORAGE = {
  favorites: 'nexus.favorites.v1',
  library:   'nexus.library.v1',
  manual:    'nexus.manual.v1',
  // Bumped to v2: discards metadata cached before the hardened Steam proxy /
  // age-gate fixes, so every game re-enriches and can finally pick up trailers.
  meta:      'nexus.meta.v2',
  // Co-op lounge: current friends + saved "crews" (named comparison groups).
  coop:      'nexus.coop.v1',
  // DLC finder cache: base-game -> dlc appids, and dlc appid -> details.
  dlc:       'nexus.dlc.v1',
};

// Visible build marker (shown in the footer) so it's obvious at a glance which
// deploy is live. Bump on each push that changes user-facing behavior.
const APP_BUILD = 'v2026.07.13 · dlc-hints';

const CHEAPSHARK_PAGE_SIZE = 30;
const cheapSharkUrl = (page) =>
  `https://www.cheapshark.com/api/1.0/deals?pageSize=${CHEAPSHARK_PAGE_SIZE}` +
  `&sortBy=Deal Rating&onSale=1&pageNumber=${page}`;

// CheapShark numeric storeID -> brand name (for historical-low store labels).
const CHEAPSHARK_STORES = {
  1: 'Steam', 2: 'GamersGate', 3: 'Green Man Gaming', 7: 'GOG', 8: 'Origin',
  11: 'Humble Store', 13: 'Uplay', 15: 'Fanatical', 21: 'WinGameStore',
  23: 'GameBillet', 24: 'Voidu', 25: 'Epic Games', 27: 'Gamesplanet',
  28: 'Gamesload', 29: '2Game', 30: 'IndieGala', 31: 'Blizzard', 33: 'DLGamer',
  34: 'Noctre', 35: 'DreamGame',
};

// RAWG enrichment (screenshots + a trailer for console exclusives NOT on Steam,
// e.g. Nintendo / PlayStation first-party) is keyed server-side: the /api/rawg
// Pages Function injects the RAWG_API_KEY secret, so no key ships to the browser
// or sits in the public repo. If the secret is not set, /api/rawg returns 501 and
// the app quietly falls back to cover-only. Get a free key at rawg.io/apidocs and
// add it in the Pages project (Settings, Variables and Secrets, RAWG_API_KEY).

// The Steam importer is fully KEYLESS — it reads the public community profile
// (resolved through the CORS-proxy array below), so no Web API key is required.

// Curated Steam AppID map for high-profile multi-platform titles. Lets us pull
// real vertical capsule art onto console/mock cards (keyless), fixing the
// text-initial fallbacks (e.g. Elden Ring's "ER"). Keyed by normalized base title.
const STEAM_APPID = {
  'elden ring': 1245620, 'cyberpunk 2077': 1091500, 'red dead redemption 2': 1174180,
  'baldur s gate 3': 1086940, 'hogwarts legacy': 990080, 'diablo iv': 2344520,
  'starfield': 1716740, 'forza horizon 5': 1551360, 'sea of thieves': 1172620,
  'halo infinite': 1240440, 'god of war': 1593500, 'god of war ragnarök': 2322010,
  'marvel s spider man 2': 2651280, 'marvel s spider man miles morales': 1817190,
  'the last of us part i': 1888930, 'helldivers 2': 553850, 'days gone': 1259420,
  'returnal': 1649240, 'death stranding': 1850570, 'detroit become human': 1222140,
  'sackboy a big adventure': 1599660, 'ghost of tsushima': 2215430,
  'horizon zero dawn complete': 1151640, 'horizon forbidden west': 2420110,
  'ea sports fc 25': 2669320, 'call of duty black ops 6': 2933620, 'mortal kombat 1': 1971870,
  'dragon s dogma 2': 2054970, 'silent hill 2': 2124490, 'resident evil 4': 2050650,
  'dead space': 1693980, 'star wars jedi survivor': 1774580, 'palworld': 1623730,
  'it takes two': 1426210, 'the elder scrolls v skyrim ae': 489830, 'hollow knight': 367520,
  'stardew valley': 413150, 'hades': 1145360, 'hades ii': 1145350, 'dead cells': 588650,
  'cuphead': 268910, 'celeste': 504230, 'octopath traveler ii': 1971650, 'sea of stars': 1244090,
  'control': 870780, 'the witcher 3 wild hunt': 292030, 'sifu': 2138710,
  'cities skylines ii': 949230, 'sons of the forest': 1326470, 'deep rock galactic': 548430,
  'terraria': 105600, 'gears 5': 1097840, 'ori and the will of the wisps': 1057090,
  'grounded': 962130, 'pentiment': 1205520, 'state of decay 2': 495420,
  'age of empires iv': 1466860, 'microsoft flight simulator 2024': 2537590,
  'forza motorsport': 2440510, 'avowed': 2457220, 'senua s saga hellblade ii': 2461850,
  'assassin s creed mirage': 3035570,
};

// Hardcoded premium cover atlas for high-profile CONSOLE / Nintendo exclusives
// (and non-Steam F2P) that Steam can't provide. Values are verified public
// Wikimedia box-art URLs — they load cross-origin in <img> (no hotlink block),
// decoupling cover coverage from Steam's database. Keys are punctuation-insensitive.
const _atlasNorm = (s = '') => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const COVER_ATLAS = Object.fromEntries(Object.entries({
  // ---- PlayStation exclusives ----
  'Bloodborne': 'https://upload.wikimedia.org/wikipedia/en/6/68/Bloodborne_Cover_Wallpaper.jpg',
  'God of War': 'https://upload.wikimedia.org/wikipedia/en/a/a7/God_of_War_4_cover.jpg',
  'God of War (2018)': 'https://upload.wikimedia.org/wikipedia/en/a/a7/God_of_War_4_cover.jpg',
  'Gran Turismo 7': 'https://upload.wikimedia.org/wikipedia/en/1/14/Gran_Turismo_7_cover_art.jpg',
  'Astro Bot': 'https://upload.wikimedia.org/wikipedia/en/a/a9/Astro_Bot_cover_art.jpg',
  // ---- Nintendo Switch exclusives ----
  'The Legend of Zelda: Tears of the Kingdom': 'https://upload.wikimedia.org/wikipedia/en/f/fb/The_Legend_of_Zelda_Tears_of_the_Kingdom_cover.jpg',
  'Super Mario Odyssey': 'https://upload.wikimedia.org/wikipedia/en/8/8d/Super_Mario_Odyssey.jpg',
  'Mario Kart World': 'https://upload.wikimedia.org/wikipedia/en/6/65/Mario_Kart_World_Cover_Artwork.png',
  'Mario Kart 8 Deluxe': 'https://upload.wikimedia.org/wikipedia/en/b/b5/MarioKart8Boxart.jpg',
  'The Legend of Zelda: Breath of the Wild': 'https://upload.wikimedia.org/wikipedia/en/c/c6/The_Legend_of_Zelda_Breath_of_the_Wild.jpg',
  'Super Mario Bros. Wonder': 'https://upload.wikimedia.org/wikipedia/en/a/a3/Mariowonder.png',
  'Super Smash Bros. Ultimate': 'https://upload.wikimedia.org/wikipedia/en/5/50/Super_Smash_Bros._Ultimate.jpg',
  'Animal Crossing: New Horizons': 'https://upload.wikimedia.org/wikipedia/en/1/1f/Animal_Crossing_New_Horizons.jpg',
  'Splatoon 3': 'https://upload.wikimedia.org/wikipedia/en/4/4f/Splatoon.3.jpg',
  'Xenoblade Chronicles 3': 'https://upload.wikimedia.org/wikipedia/en/7/76/Xenoblade_3.png',
  'Metroid Prime Remastered': 'https://upload.wikimedia.org/wikipedia/en/b/ba/MetroidPrimebox.jpg',
  'Metroid Dread': 'https://upload.wikimedia.org/wikipedia/en/5/57/Metroid_Dread_cover_art.jpg',
  "Luigi's Mansion 3": 'https://upload.wikimedia.org/wikipedia/en/e/e0/Luigi%27s_Mansion_3_cover_art.jpg',
  'Kirby and the Forgotten Land': 'https://upload.wikimedia.org/wikipedia/en/5/57/Kirby_and_the_Forgotten_Land.jpg',
  'Pikmin 4': 'https://upload.wikimedia.org/wikipedia/en/1/17/Pikmin_4_cover_art.jpg',
  'Bayonetta 3': 'https://upload.wikimedia.org/wikipedia/en/2/2f/Bayonetta_3_cover_art.jpg',
  'Fire Emblem: Three Houses': 'https://upload.wikimedia.org/wikipedia/en/6/6f/Fire_Emblem_Three_Houses.jpg',
  'Xenoblade Chronicles 2': 'https://upload.wikimedia.org/wikipedia/en/f/f4/Xenoblade_Chronicles_2.jpg',
  "The Legend of Zelda: Link's Awakening": 'https://upload.wikimedia.org/wikipedia/en/5/59/Link%27s_Awakening_%282019_video_game%29.jpg',
  'Donkey Kong Country: Tropical Freeze': 'https://upload.wikimedia.org/wikipedia/en/a/a4/Donkey_Kong_Country_Tropical_Freeze_box.jpg',
  'Super Mario RPG': 'https://upload.wikimedia.org/wikipedia/en/9/9c/Super_Mario_RPG_2023_cover_art.jpg',
  'Paper Mario: The Thousand-Year Door': 'https://upload.wikimedia.org/wikipedia/en/6/6e/Paper_Mario_The_Thousand-Year_Door_2024.jpg',
  'Princess Peach: Showtime!': 'https://upload.wikimedia.org/wikipedia/en/8/8a/Princess_Peach_Showtime_cover.jpg',
  'Pokémon Scarlet and Violet': 'https://upload.wikimedia.org/wikipedia/en/f/f0/Pokemon_Scarlet_and_Violet.jpg',
  'Pokémon Legends: Arceus': 'https://upload.wikimedia.org/wikipedia/en/8/85/Pokemon_Legends_Arceus.jpg',
  'Pokémon Sword and Shield': 'https://upload.wikimedia.org/wikipedia/en/e/e2/Pok%C3%A9mon_Sword_and_Shield.jpg',
  'Mario Party Superstars': 'https://upload.wikimedia.org/wikipedia/en/2/2e/Mario_Party_Superstars_cover_art.jpg',
  // ---- PlayStation exclusives ----
  "Marvel's Spider-Man": 'https://upload.wikimedia.org/wikipedia/en/e/e1/Spider-Man_PS4_cover.jpg',
  'Spider-Man Remastered': 'https://upload.wikimedia.org/wikipedia/en/e/e1/Spider-Man_PS4_cover.jpg',
  "Marvel's Spider-Man 2": 'https://upload.wikimedia.org/wikipedia/en/f/f9/Spider-Man_2_2023.jpg',
  'The Last of Us Part II': 'https://upload.wikimedia.org/wikipedia/en/4/4f/TLOU_P2_Box_Art_Final.png',
  'The Last of Us Part I': 'https://upload.wikimedia.org/wikipedia/en/4/46/Video_Game_Cover_-_The_Last_of_Us_Part_I.png',
  "Uncharted 4: A Thief's End": 'https://upload.wikimedia.org/wikipedia/en/2/2a/Uncharted_4_box_artwork.jpg',
  'Ghost of Tsushima': 'https://upload.wikimedia.org/wikipedia/en/b/b6/Ghost_of_Tsushima.jpg',
  'Horizon Forbidden West': 'https://upload.wikimedia.org/wikipedia/en/1/12/Horizon_Forbidden_West_cover_art.jpg',
  'Horizon Zero Dawn': 'https://upload.wikimedia.org/wikipedia/en/9/93/Horizon_Zero_Dawn.jpg',
  "Demon's Souls": 'https://upload.wikimedia.org/wikipedia/en/a/ac/Demon%27s_Souls_2020.jpg',
  'Ratchet & Clank: Rift Apart': 'https://upload.wikimedia.org/wikipedia/en/1/13/Ratchet_%26_Clank_Rift_Apart_cover_art.jpg',
  'Returnal': 'https://upload.wikimedia.org/wikipedia/en/2/25/Returnal_cover_art.jpg',
  'Final Fantasy VII Rebirth': 'https://upload.wikimedia.org/wikipedia/en/5/5f/Final_Fantasy_VII_Rebirth_cover_art.jpg',
  // ---- Xbox exclusives ----
  "Hellblade: Senua's Sacrifice": 'https://upload.wikimedia.org/wikipedia/en/6/6b/Hellblade_Senua%27s_Sacrifice_cover_art.jpg',
  'Ori and the Blind Forest': 'https://upload.wikimedia.org/wikipedia/en/0/0f/Ori_and_the_blind_forest_cover.jpg',
  // ---- Non-Steam Free-to-Play ----
  'Rocket League': 'https://upload.wikimedia.org/wikipedia/commons/e/e0/Rocket_League_coverart.jpg',
}).map(([k, v]) => [_atlasNorm(k), v]));

function atlasLookup(title) {
  return COVER_ATLAS[_atlasNorm(title)] || COVER_ATLAS[_atlasNorm(cleanTitleForSearch(title))] || null;
}

// Normalize a title to its edition-agnostic base for edition/appid matching.
function baseTitle(t = '') {
  return t.toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[:\-–—!.,()]/g, ' ')
    .replace(/\b(deluxe|ultimate|goty|game of the year|definitive|director s cut|complete|remastered|standard|edition)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// PC/subscription sub-store checkboxes (multi-select store separation).
const STORE_CHECKS = [
  { v: 'Steam', l: 'Steam',                emoji: '🟦' },
  { v: 'Epic',  l: 'Epic Games Store',     emoji: '⚫' },
  { v: 'GOG',   l: 'GOG',                  emoji: '🟣' },
  { v: 'Prime', l: 'Amazon Prime Gaming',  emoji: '🔵' },
  { v: 'Luna',  l: 'Amazon Luna',          emoji: '🌙' },
];

// Build a DEEP merchant link so users land on the actual product/search page
// for that title, never a bare storefront homepage.
function storeLink(store = '', title = '', category = '', system = '', appid) {
  const s = store.toLowerCase();
  const q = encodeURIComponent(title);
  if (appid && s.includes('steam')) return `https://store.steampowered.com/app/${appid}/`;
  if (s.includes('steam'))  return `https://store.steampowered.com/search/?term=${q}`;
  if (s.includes('epic'))   return `https://store.epicgames.com/en-US/browse?q=${q}&sortBy=relevancy&sortDir=DESC`;
  if (s.includes('gog'))    return `https://www.gog.com/en/games?query=${q}`;
  if (s.includes('prime'))  return `https://gaming.amazon.com/search?q=${q}`;
  if (s.includes('luna'))   return `https://luna.amazon.com/`;
  if (category === 'playstation' || s.includes('playstation') || /\bps\b/.test(s))
    return `https://store.playstation.com/en-us/search/${q}`;
  if (category === 'xbox' || s.includes('xbox'))
    return `https://www.xbox.com/en-US/Search/Results?q=${q}`;
  if (category === 'nintendo' || s.includes('eshop') || s.includes('nintendo'))
    return `https://www.nintendo.com/us/search/?q=${q}&p=1`;
  if (appid) return `https://store.steampowered.com/app/${appid}/`;
  return `https://store.steampowered.com/search/?term=${q}`;
}

// Human-readable edition label parsed from a title.
function editionLabel(t = '') {
  const m = t.match(/\b(Deluxe|Ultimate|Definitive|Complete|Remastered|Director'?s Cut|Game of the Year|GOTY)\b/i);
  if (!m) return 'Standard Edition';
  let w = m[1];
  if (/goty|game of the year/i.test(w)) return 'Game of the Year Edition';
  if (/director/i.test(w)) return "Director's Cut";
  w = w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  return `${w} Edition`;
}

/* --------------------------------------------------------------------------
 * 2. UTILITIES
 * ------------------------------------------------------------------------ */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const money = (n) => (n === 0 || n === '0') ? 'FREE' : `$${Number(n).toFixed(2)}`;

const pct = (retail, sale) => {
  retail = Number(retail); sale = Number(sale);
  if (!retail || retail <= 0 || sale >= retail) return 0;
  return Math.round((1 - sale / retail) * 100);
};

const escapeHtml = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const uid = () => 'g_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const initialsOf = (title = 'Game') =>
  title.split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || 'GM';

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (e) { console.warn('Persist failed', key, e); }
}

// Small SVG cover used for compact thumbnails (favorites list, etc.).
function placeholderCover(title = 'Game', accent = '#8b5cf6') {
  const initials = initialsOf(title);
  const t = escapeHtml(title.length > 26 ? title.slice(0, 24) + '…' : title);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='420' viewBox='0 0 300 420'>
      <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
        <stop offset='0' stop-color='${accent}' stop-opacity='0.9'/>
        <stop offset='1' stop-color='#12121c'/></linearGradient></defs>
      <rect width='300' height='420' fill='#12121c'/>
      <rect width='300' height='420' fill='url(#g)' opacity='0.55'/>
      <text x='150' y='210' font-family='Segoe UI,sans-serif' font-size='90' font-weight='800'
        fill='#ffffff' fill-opacity='0.9' text-anchor='middle'>${initials}</text>
      <text x='150' y='372' font-family='Segoe UI,sans-serif' font-size='17' font-weight='600'
        fill='#e5e7eb' text-anchor='middle'>${t}</text></svg>`;
  // NB: encodeURIComponent leaves apostrophes raw, and this data URL gets embedded
  // inside single-quoted onerror="…this.src='…'" handlers — an un-encoded ' would
  // terminate that JS string early (SyntaxError) and the fallback cover would never
  // apply. Encode the SVG's single quotes so the URL is safe in a '…' context.
  return 'data:image/svg+xml,' + encodeURIComponent(svg.replace(/\n\s*/g, ' ')).replace(/'/g, '%27');
}

function toast(msg, kind = 'info') {
  const host = $('#toastHost');
  const colors = { info: 'border-nexus-cyan', ok: 'border-nexus-green', warn: 'border-amber-400', err: 'border-nexus-red' };
  const el = document.createElement('div');
  el.className =
    `pointer-events-auto px-4 py-2.5 rounded-xl bg-nexus-card border ${colors[kind] || colors.info} ` +
    `text-sm text-slate-100 shadow-2xl backdrop-blur transition-all duration-300 translate-y-2 opacity-0`;
  el.textContent = msg;
  host.appendChild(el);
  requestAnimationFrame(() => { el.style.transform = 'translateY(0)'; el.style.opacity = '1'; });
  setTimeout(() => {
    el.style.opacity = '0'; el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 320);
  }, 2600);
}

/* --------------------------------------------------------------------------
 * 3. MOCK / FALLBACK DATA  (console storefronts + Prime + free-to-keep)
 *    Compact tuple tables -> 30+ real-world high-profile titles per console.
 *    row = [title, retail, sale, subtypes?, storeOverride?]
 * ------------------------------------------------------------------------ */

function subTagsFor(subtypes, system) {
  const t = (subtypes || []).map(s => SUBTAG[s]).filter(Boolean);
  if (t.length) return t;
  return [({ pc: 'PC', ps: 'PS5', xbox: 'XSX', switch: 'SW', switch2: 'SW2' })[system] || 'PC'];
}

function mk(category, system, defStore, rows) {
  return rows.map((r, i) => {
    const subtypes = r[3] || [];
    return {
      id: `${category}_${i}`,
      category, system,
      title: r[0], retail: r[1], sale: r[2],
      subtypes, tags: subTagsFor(subtypes, system),
      store: r[4] || defStore,
    };
  });
}

// Permanent Free-to-Play staples — timeless, never expire, always-valid links.
// (Steam appID -> direct product page & real cover art; others use official URLs.)
const F2P_GAMES = [
  { title: 'Fortnite',              tags: ['PC', 'PS5', 'XSX', 'SW'], store: 'Epic Games', url: 'https://store.epicgames.com/en-US/p/fortnite' },
  { title: 'Apex Legends',          tags: ['PC', 'PS5', 'XSX'],       store: 'Steam', appid: 1172470 },
  { title: 'Counter-Strike 2',      tags: ['PC'],                     store: 'Steam', appid: 730 },
  { title: 'Call of Duty: Warzone', tags: ['PC', 'PS5', 'XSX'],       store: 'Battle.net', url: 'https://www.callofduty.com/warzone' },
  { title: 'Dota 2',                tags: ['PC'],                     store: 'Steam', appid: 570 },
  { title: 'VALORANT',              tags: ['PC'],                     store: 'Riot Games', url: 'https://playvalorant.com/' },
  { title: 'Genshin Impact',        tags: ['PC', 'PS5'],              store: 'HoYoverse', url: 'https://genshin.hoyoverse.com/en/download' },
  { title: 'Rocket League',         tags: ['PC', 'PS5', 'XSX', 'SW'], store: 'Epic Games', url: 'https://www.rocketleague.com/' },
  { title: 'Warframe',              tags: ['PC', 'PS5', 'XSX', 'SW'], store: 'Steam', appid: 230410 },
  { title: 'Destiny 2',             tags: ['PC', 'PS5', 'XSX'],       store: 'Steam', appid: 1085660 },
  { title: 'Path of Exile',         tags: ['PC', 'PS5', 'XSX'],       store: 'Steam', appid: 238960 },
  { title: 'Marvel Rivals',         tags: ['PC', 'PS5', 'XSX'],       store: 'Steam', appid: 2767030 },
];
function mkF2P() {
  return F2P_GAMES.map((g, i) => ({
    id: 'f2p_' + i, category: 'f2p', system: 'pc',
    title: g.title, retail: 0, sale: 0, tags: g.tags, subtypes: [], store: g.store,
    url: g.url || (g.appid ? `https://store.steampowered.com/app/${g.appid}/` : undefined),
    imgs: g.appid
      ? [`https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/library_600x900_2x.jpg`,
         `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/library_600x900.jpg`,
         `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg`]
      : [],
    f2p: true,
  }));
}

const MOCK_DEALS = [
  // NOTE: the "100% Free to Claim" (giveaways) row is populated LIVE from
  // CheapShark's zero-price feed — no stale hardcoded giveaways that 404.

  /* ---------- 💻 PC (curated fallback if CheapShark is unreachable) ---------- */
  ...mk('pc', 'pc', 'Steam', [
    ['Cyberpunk 2077: Ultimate Edition', 79.99, 39.99, [], 'Steam'],
    ["Baldur's Gate 3",                  59.99, 41.99, [], 'GOG'],
    ['Elden Ring',                       59.99, 35.99, [], 'Steam'],
    ['Red Dead Redemption 2',            59.99, 19.79, [], 'Steam'],
    ['Hogwarts Legacy',                  59.99, 23.99, [], 'Epic Games'],
    ['Cities: Skylines II',              49.99, 24.99, [], 'Steam'],
    ['Sons of the Forest',               29.99, 20.99, [], 'Steam'],
    ['Hades II',                         29.99, 26.99, [], 'Steam'],
    ['Deep Rock Galactic',               29.99,  9.89, [], 'Steam'],
    ['Terraria',                          9.99,  4.99, [], 'Steam'],
  ]),

  /* ---------- 💙 PLAYSTATION LOUNGE (30) ---------- */
  ...mk('playstation', 'ps', 'PS Store', [
    ["Marvel's Spider-Man 2",            69.99, 41.99, ['ps5']],
    ['God of War Ragnarök',              69.99, 34.99, ['ps5', 'ps4']],
    ['Horizon Forbidden West',           49.99, 19.99, ['ps5', 'ps4']],
    ['Final Fantasy VII Rebirth',        69.99, 39.99, ['ps5']],
    ['Ghost of Tsushima Director’s Cut', 59.99, 29.99, ['ps5', 'ps4']],
    ['The Last of Us Part I',            69.99, 34.99, ['ps5']],
    ["Demon's Souls",                    69.99, 39.99, ['ps5']],
    ['Ratchet & Clank: Rift Apart',      69.99, 29.99, ['ps5']],
    ['Gran Turismo 7',                   69.99, 34.99, ['ps5', 'ps4']],
    ['Returnal',                         69.99, 29.99, ['ps5']],
    ["Marvel's Spider-Man: Miles Morales", 49.99, 19.99, ['ps5', 'ps4']],
    ["Death Stranding Director's Cut",   49.99, 19.99, ['ps5']],
    ['Uncharted: Legacy of Thieves',     49.99, 24.99, ['ps5']],
    ['Sackboy: A Big Adventure',         59.99, 24.99, ['ps5', 'ps4']],
    ['Helldivers 2',                     39.99, 29.99, ['ps5']],
    ['Stellar Blade',                    69.99, 49.99, ['ps5']],
    ['Rise of the Ronin',                69.99, 49.99, ['ps5']],
    ['Astro Bot',                        59.99, 49.99, ['ps5']],
    ['The Last of Us Part II Remastered', 49.99, 29.99, ['ps5']],
    ['LEGO Horizon Adventures',          59.99, 39.99, ['ps5', 'ps4']],
    ['Silent Hill 2',                    69.99, 49.99, ['ps5']],
    ["Dragon's Dogma 2",                 69.99, 41.99, ['ps5']],
    ['Elden Ring',                       59.99, 35.99, ['ps5', 'ps4']],
    ['EA Sports FC 25',                  69.99, 34.99, ['ps5', 'ps4']],
    ['Call of Duty: Black Ops 6',        69.99, 49.99, ['ps5', 'ps4']],
    ['God of War (2018)',                19.99,  9.99, ['ps4']],
    ['Days Gone',                        19.99,  9.99, ['ps4']],
    ['Bloodborne',                        0,     0,    ['psplus', 'ps4']],
    ['Horizon Zero Dawn Complete Edition', 0,   0,    ['psplus', 'ps4']],
    ['Detroit: Become Human',             0,     0,    ['psplus', 'ps4']],
    // Cross-ecosystem alternate editions (also released Standard on Xbox/PC) —
    // these surface the multi-edition grouping in the detail modal.
    ['Cyberpunk 2077: Ultimate Edition', 79.99, 49.99, ['ps5']],
    ['Hogwarts Legacy: Deluxe Edition',  69.99, 34.99, ['ps5', 'ps4']],
    ['Elden Ring: Deluxe Edition',       79.99, 49.99, ['ps5']],
  ]),

  /* ---------- 💚 XBOX ARENA (30) ---------- */
  ...mk('xbox', 'xbox', 'Xbox Store', [
    ['Starfield',                        69.99, 34.99, ['series', 'gamepass']],
    ['Forza Horizon 5',                  59.99, 23.99, ['series', 'one', 'gamepass']],
    ['Halo Infinite',                    59.99, 19.79, ['series', 'one', 'gamepass']],
    ['Sea of Thieves',                   39.99, 15.99, ['series', 'one', 'gamepass']],
    ['Diablo IV',                        69.99, 27.99, ['series', 'gamepass']],
    ['Forza Motorsport',                 69.99, 41.99, ['series', 'gamepass']],
    ['Microsoft Flight Simulator 2024',  69.99, 49.99, ['series', 'gamepass']],
    ['Gears 5',                          29.99,  9.89, ['series', 'one', 'gamepass']],
    ['Age of Empires IV',                39.99, 19.99, ['series', 'gamepass']],
    ["Senua's Saga: Hellblade II",       49.99, 39.99, ['series', 'gamepass']],
    ['Avowed',                           69.99, 49.99, ['series', 'gamepass']],
    ['State of Decay 2',                 29.99,  8.99, ['series', 'one', 'gamepass']],
    ['Ori and the Will of the Wisps',    29.99,  9.99, ['series', 'one', 'gamepass']],
    ['Grounded',                         39.99, 19.99, ['series', 'one', 'gamepass']],
    ['Pentiment',                        19.99, 13.99, ['series', 'gamepass']],
    ['Call of Duty: Black Ops 6',        69.99, 49.99, ['series', 'gamepass']],
    ['EA Sports FC 25',                  69.99, 34.99, ['series', 'one']],
    ['Mortal Kombat 1',                  69.99, 29.99, ['series']],
    ['Cyberpunk 2077',                   59.99, 29.99, ['series', 'one']],
    ['Elden Ring',                       59.99, 41.99, ['series', 'one']],
    ['Red Dead Redemption 2',            59.99, 19.79, ['series', 'one']],
    ["Baldur's Gate 3",                  59.99, 47.99, ['series']],
    ['Assassin’s Creed Mirage',          49.99, 24.99, ['series', 'one']],
    ['Hogwarts Legacy',                  59.99, 23.99, ['series', 'one']],
    ['It Takes Two',                     39.99, 15.99, ['series', 'one', 'gamepass']],
    ['Palworld',                         29.99, 26.99, ['series', 'gamepass']],
    ['The Elder Scrolls V: Skyrim AE',   49.99, 19.99, ['series', 'one']],
    ['Dead Space',                       59.99, 23.99, ['series']],
    ['Resident Evil 4',                  59.99, 23.99, ['series']],
    ['Star Wars Jedi: Survivor',         69.99, 27.99, ['series']],
  ]),

  /* ---------- 🛑 NINTENDO eSHOP (30 · Switch 1 & Switch 2) ---------- */
  ...mk('nintendo', 'switch', 'eShop', [
    ['The Legend of Zelda: Tears of the Kingdom', 69.99, 49.99, ['switch2', 'switch']],
    ['Super Mario Odyssey',              59.99, 39.99, ['switch']],
    ['Mario Kart World',                 79.99, 69.99, ['switch2']],
    ['Metroid Dread',                    59.99, 29.99, ['switch']],
    ['Pikmin 4',                         59.99, 39.99, ['switch', 'switch2']],
    ['The Legend of Zelda: Breath of the Wild', 59.99, 39.99, ['switch']],
    ['Super Mario Bros. Wonder',         59.99, 44.99, ['switch', 'switch2']],
    ['Super Smash Bros. Ultimate',       59.99, 49.99, ['switch']],
    ['Animal Crossing: New Horizons',    59.99, 39.99, ['switch']],
    ['Splatoon 3',                       59.99, 39.99, ['switch']],
    ['Super Mario Party Jamboree',       59.99, 49.99, ['switch', 'switch2']],
    ["Luigi's Mansion 3",                59.99, 39.99, ['switch']],
    ['Kirby and the Forgotten Land',     59.99, 39.99, ['switch', 'switch2']],
    ['Xenoblade Chronicles 3',           59.99, 39.99, ['switch']],
    ['Fire Emblem Engage',               59.99, 29.99, ['switch']],
    ['Mario + Rabbids Sparks of Hope',   59.99, 14.99, ['switch', 'eshop']],
    ['Bayonetta 3',                      59.99, 39.99, ['switch']],
    ['Donkey Kong Country Returns HD',   59.99, 49.99, ['switch', 'switch2']],
    ['Paper Mario: The Thousand-Year Door', 59.99, 49.99, ['switch']],
    ['Princess Peach: Showtime!',        59.99, 39.99, ['switch']],
    ['Metroid Prime Remastered',         39.99, 29.99, ['switch']],
    ['The Legend of Zelda: Echoes of Wisdom', 59.99, 49.99, ['switch', 'switch2']],
    ['Hollow Knight',                    14.99,  7.49, ['switch', 'eshop']],
    ['Stardew Valley',                   14.99, 11.24, ['switch', 'eshop']],
    ['Hades',                            24.99, 12.49, ['switch', 'eshop']],
    ['Dead Cells',                       24.99, 12.49, ['switch', 'eshop']],
    ['Cuphead',                          19.99, 13.39, ['switch', 'eshop']],
    ['Celeste',                          19.99,  4.99, ['switch', 'eshop']],
    ['Octopath Traveler II',             59.99, 41.99, ['switch']],
    ['Sea of Stars',                     34.99, 24.49, ['switch', 'switch2', 'eshop']],
  ]),

  /* ---------- 🎮 FREE-TO-PLAY STAPLES (permanent, never expire) ---------- */
  ...mkF2P(),
];

/* --------------------------------------------------------------------------
 * 4. NEXUS DATA ENGINE
 * ------------------------------------------------------------------------ */

class NexusDataEngine {
  constructor() {
    this.deals = [];
    this.usedFallback = false;
    this.liveCount = 0;
    this.page = 0;
    this.hasMore = true;
    this._seen = new Set();     // lowercased titles across all live pages
  }

  static normalize(raw) {
    const retail = Number(raw.retail ?? raw.normalPrice ?? 0);
    const sale   = Number(raw.sale   ?? raw.salePrice   ?? retail);
    const accent = (CATEGORIES.find(c => c.id === raw.category) || {}).accent || '#8b5cf6';
    const base = baseTitle(raw.title || '');
    const appid = STEAM_APPID[base];
    let imgs = Array.isArray(raw.imgs) ? raw.imgs.slice() : [];
    if (!imgs.length && raw.img) imgs = [raw.img];
    // Metadata fallback: pull real cover art for known titles that shipped with
    // no image (console/mock cards), so we don't fall back to text initials.
    if (!imgs.length) {
      const atlas = atlasLookup(raw.title || '');
      if (atlas) {
        imgs = [atlas];
      } else if (appid) {
        const b = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}`;
        imgs = [`${b}/library_600x900_2x.jpg`, `${b}/library_600x900.jpg`, `${b}/header.jpg`];
      } else if (typeof State !== 'undefined' && State.meta && State.meta[base] && State.meta[base].background) {
        imgs = [State.meta[base].background];
      }
    }
    // Deep merchant link: honor an explicit url (e.g. CheapShark tracking redirect),
    // otherwise synthesize a direct product/search link — never a bare homepage.
    const url = (raw.url && raw.url !== '#')
      ? raw.url
      : storeLink(raw.store || '', raw.title || '', raw.category || '', raw.system || '', appid);
    return {
      id:       raw.id || uid(),
      category: raw.category || 'pc',
      system:   raw.system || 'pc',
      title:    raw.title || 'Untitled Game',
      tags:     Array.isArray(raw.tags) && raw.tags.length ? raw.tags : ['PC'],
      subtypes: Array.isArray(raw.subtypes) ? raw.subtypes : [],
      store:    raw.store || 'Store',
      retail,
      sale,
      discount: pct(retail, sale),
      imgs,
      img:      imgs[0] || placeholderCover(raw.title, accent),
      url,
      source:   raw.source || 'mock',
      fullPrice: !!raw.fullPrice,
      f2p:      !!raw.f2p,
      gameID:    raw.gameID,
      steamAppID: raw.steamAppID,
    };
  }

  // Build a hi-res candidate list from a CheapShark record. We prefer vertical
  // Steam "library" capsule art, then header art, then a regex-upgraded thumb,
  // then the raw thumb — the card walks this list on each <img> error.
  static fromCheapShark(d) {
    const sale   = Number(d.salePrice);
    const retail = Number(d.normalPrice);
    const imgs = [];
    if (d.steamAppID) {
      const base = `https://cdn.cloudflare.steamstatic.com/steam/apps/${d.steamAppID}`;
      imgs.push(`${base}/library_600x900_2x.jpg`, `${base}/library_600x900.jpg`, `${base}/header.jpg`);
    }
    if (d.thumb) {
      // Regex URL manipulator: swap the tiny capsule slug for hi-res variants.
      imgs.push(d.thumb.replace(/capsule_sm_120|capsule_231x87/g, 'library_600x900'));
      imgs.push(d.thumb.replace(/capsule_sm_120|capsule_231x87/g, 'capsule_616x353'));
      imgs.push(d.thumb);
    }
    return NexusDataEngine.normalize({
      id: 'cs_' + d.dealID,
      category: sale === 0 ? 'free' : 'pc',
      system: 'pc',
      title: d.title,
      tags: ['PC'],
      store: sale === 0 ? 'Free · Steam' : 'Steam',
      retail, sale, imgs,
      // NOTE: CheapShark's dealID arrives ALREADY url-encoded (contains %2F/%3D).
      // Re-encoding it double-escapes the token and the redirect 404s back to the
      // homepage — so we pass dealID through verbatim to land on the real store.
      url: 'https://www.cheapshark.com/redirect?dealID=' + d.dealID,
      source: 'cheapshark',
      gameID: d.gameID,
    });
  }

  async fetchPage(page, timeoutMs = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(cheapSharkUrl(page), { signal: controller.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('bad payload');
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  // De-dupe a raw CheapShark array against titles already seen, map to schema.
  _ingest(rawArray) {
    const out = [];
    for (const d of rawArray) {
      const key = (d.title || '').toLowerCase();
      if (!key || this._seen.has(key)) continue;
      this._seen.add(key);
      out.push(NexusDataEngine.fromCheapShark(d));
    }
    return out;
  }

  async load() {
    this.page = 0;
    this.hasMore = true;
    this._seen = new Set();
    let liveDeals = [];
    try {
      const raw = await this.fetchPage(0);
      if (!raw.length) throw new Error('empty payload');
      // Only paid PC deals belong in the PC row (sale > 0). $0 items are giveaways.
      liveDeals = this._ingest(raw).filter(d => d.sale > 0);
      this.liveCount = liveDeals.length;
      if (raw.length < CHEAPSHARK_PAGE_SIZE) this.hasMore = false;
    } catch (err) {
      console.warn('[NexusDataEngine] Live PC feed unavailable, using fallback:', err.message);
      this.usedFallback = true;
      this.hasMore = false;
    }

    // Live limited-time giveaways (separate zero-price feed).
    let giveaways = [];
    try {
      giveaways = await NexusDataEngine.fetchFreeGiveaways();
    } catch (e) {
      console.warn('[NexusDataEngine] giveaway feed unavailable:', e.message);
    }

    const mock = MOCK_DEALS.map(NexusDataEngine.normalize); // F2P staples + console + curated PC

    if (liveDeals.length || giveaways.length) {
      // Live PC deals supersede the curated PC row; console + F2P stay curated.
      const nonPcMock = mock.filter(d => d.category !== 'pc' && d.category !== 'free');
      this.deals = [...giveaways, ...liveDeals, ...nonPcMock];
    } else {
      this.deals = mock; // offline: F2P + console + curated PC (no stale giveaways)
    }
    return this.deals;
  }

  // Live "100% Free to Claim" giveaways — CheapShark zero-price feed. Strictly
  // premium games temporarily marked to $0 (spec filter: price === 0 && retail > 0),
  // which guarantees permanent Free-to-Play titles never leak into this row.
  static async fetchFreeGiveaways(timeoutMs = 7000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch('https://www.cheapshark.com/api/1.0/deals?upperPrice=0&pageSize=20&sortBy=recent', { signal: controller.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const arr = await res.json();
      if (!Array.isArray(arr)) return [];
      return arr
        .filter(d => parseFloat(d.salePrice) === 0 && parseFloat(d.normalPrice) > 0)
        .map(d => NexusDataEngine.fromCheapShark(d));
    } finally {
      clearTimeout(timer);
    }
  }

  // Global encyclopedia search — CheapShark /games returns titles regardless of
  // sale status, so full-price games become searchable & bookmarkable.
  // NOTE: correct endpoint is /api/1.0/games?title= (not the malformed
  // `cheapshark.com{query}` string); returns {gameID,steamAppID,external,thumb,cheapest}.
  static async searchGames(query, timeoutMs = 7000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = `https://www.cheapshark.com/api/1.0/games?title=${encodeURIComponent(query)}&limit=20`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const arr = await res.json();
      if (!Array.isArray(arr)) return [];
      return arr.map(g => {
        const imgs = [];
        if (g.steamAppID) {
          const b = `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.steamAppID}`;
          imgs.push(`${b}/library_600x900_2x.jpg`, `${b}/library_600x900.jpg`, `${b}/header.jpg`);
        }
        if (g.thumb) imgs.push(g.thumb.replace(/capsule_sm_120|capsule_231x87/g, 'library_600x900'), g.thumb);
        const price = Number(g.cheapest) || 0;
        return NexusDataEngine.normalize({
          id: 'csg_' + g.gameID,
          category: 'search',
          system: 'pc',
          title: g.external,
          tags: ['PC'],
          store: 'CheapShark',
          retail: price, sale: price,     // shown as full price — not an active discount
          imgs,
          url: g.steamAppID
            ? `https://store.steampowered.com/app/${g.steamAppID}/`
            : `https://www.cheapshark.com/browse?title=${encodeURIComponent(g.external)}`,
          source: 'encyclopedia',
          fullPrice: true,
          gameID: g.gameID,
          steamAppID: g.steamAppID,
        });
      });
    } finally {
      clearTimeout(timer);
    }
  }

  // Fetch the next CheapShark page (PC + any free-to-keep). Returns new deals.
  async loadMore() {
    if (!this.hasMore || this.usedFallback) return [];
    const nextPage = this.page + 1;
    const raw = await this.fetchPage(nextPage);
    this.page = nextPage;
    const fresh = this._ingest(raw).filter(d => d.sale > 0); // paid PC deals only
    if (raw.length < CHEAPSHARK_PAGE_SIZE) this.hasMore = false;
    this.liveCount += fresh.length;
    return fresh;
  }
}

/* --------------------------------------------------------------------------
 * 5. APPLICATION STATE
 * ------------------------------------------------------------------------ */

const State = {
  engine: new NexusDataEngine(),
  deals: [],
  manual: loadJSON(STORAGE.manual, []),
  favorites: loadJSON(STORAGE.favorites, {}),
  library: loadJSON(STORAGE.library, []),
  meta: loadJSON(STORAGE.meta, {}),
  booted: false,
  loadingMore: false,
  activeDetail: null,
  // Co-op: current friends [{ label, titles:[] }] + saved crews (named groups).
  // Persisted so a comparison survives reloads and multiple crews can be kept.
  coop: loadJSON(STORAGE.coop, { friends: [], groups: [] }),
  // DLC finder: persisted lookup cache (bases + details) + last scan (transient).
  dlcCache: loadJSON(STORAGE.dlc, { bases: {}, details: {} }),
  dlcScan: null,
  searchResults: [],       // encyclopedia (full-price) results for current query
  priceDrops: new Set(),   // normalized titles of favorites with a live cheaper deal
  histCache: {},           // gameID/title -> { price, date, store } historical low
  pushed: 0,               // pseudo history-state depth for modal back-gesture guard
  filters: {
    systems: new Set(SYSTEMS.map(s => s.id)),
    freeOnly: false,
    minDiscount: 0,          // 0 = any; else require deal.discount >= this
    search: '',
    favPlatform: 'all',
    subFilter: { playstation: 'all', xbox: 'all', nintendo: 'all' },
    // Multi-select store separation for the PC & Free (subscription) sections.
    storeFilter: { free: new Set(), pc: new Set() },
  },

  persist() {
    saveJSON(STORAGE.favorites, this.favorites);
    saveJSON(STORAGE.library, this.library);
    saveJSON(STORAGE.manual, this.manual);
    saveJSON(STORAGE.coop, { friends: this.coop.friends, groups: this.coop.groups || [] });
    saveJSON(STORAGE.dlc, this.dlcCache);
  },

  allDeals() {
    const manual = this.manual.map(NexusDataEngine.normalize);
    return [...manual, ...this.deals];
  },

  isFavorite(id) { return !!this.favorites[id]; },
  isOwned(title) {
    const t = (title || '').trim().toLowerCase();
    return this.library.some(g => (g.title || '').trim().toLowerCase() === t);
  },
};

/* --------------------------------------------------------------------------
 * 6. FILTER LOGIC
 * ------------------------------------------------------------------------ */

function systemMeta(id) { return SYSTEMS.find(s => s.id === id) || SYSTEMS[0]; }
function categoryMeta(id) { return CATEGORIES.find(c => c.id === id) || CATEGORIES[1]; }

function subtypeMatch(deal, cat, val) {
  if (!val || val === 'all') return true;
  if (cat === 'free' || cat === 'pc') {
    return (deal.store || '').toLowerCase().includes(val.toLowerCase());
  }
  const subs = (deal.subtypes && deal.subtypes.length) ? deal.subtypes : [];
  return subs.includes(val);
}

function storeMatch(deal, set) {
  if (!set || !set.size) return true;
  const store = (deal.store || '').toLowerCase();
  return [...set].some(v => store.includes(v.toLowerCase()));
}

function dealPasses(deal) {
  const cat = categoryMeta(deal.category);
  if (!cat.systems.some(s => State.filters.systems.has(s))) return false;
  if (State.filters.freeOnly && deal.sale !== 0) return false;
  // Min-discount gate: only actual discounts count (giveaways read as 100% off;
  // permanently free-to-play and full-price titles have 0% and are filtered out).
  if (State.filters.minDiscount > 0 && (deal.discount || 0) < State.filters.minDiscount) return false;
  if (State.filters.search && !deal.title.toLowerCase().includes(State.filters.search)) return false;
  if (deal.category === 'free' || deal.category === 'pc') {
    if (!storeMatch(deal, State.filters.storeFilter[deal.category])) return false;
  } else {
    const sub = State.filters.subFilter[deal.category] || 'all';
    if (!subtypeMatch(deal, deal.category, sub)) return false;
  }
  return true;
}

/* --------------------------------------------------------------------------
 * 7. RENDERING
 * ------------------------------------------------------------------------ */

// Strip edition sub-titles so title→cover CDN matching succeeds more often.
function cleanTitleForSearch(t = '') {
  return t
    .replace(/[:\-–—]\s*(game of the year|goty|definitive|director'?s cut|complete|remastered|deluxe|ultimate|enhanced|standard|anniversary|legendary)\b.*$/i, '')
    .replace(/\b(game of the year edition|goty edition|definitive edition|director'?s cut|complete edition|remastered|deluxe edition|ultimate edition|enhanced edition|anniversary edition|legendary edition)\b/ig, '')
    .replace(/\s{2,}/g, ' ').trim();
}

// Multi-tier cover-art harvester.
//   Tier 1: Steam library capsule from a known steamAppID (built into deal.imgs).
//   Tier 2: keyless title→steamAppID lookup via CheapShark, then Steam capsule.
//   Tier 3: premium CSS fallback frame (handled by the .cover-fallback element).
const ImageHarvester = {
  _appid: {},        // cleanedTitleLower -> steamAppID | null (resolved)
  _inflight: {},     // cleanedTitleLower -> Promise
  _io: null,
  steamArt(appid, hi = true) {
    return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900${hi ? '_2x' : ''}.jpg`;
  },
  findAppId(title) {
    const clean = cleanTitleForSearch(title);
    const key = clean.toLowerCase();
    if (key in this._appid) return Promise.resolve(this._appid[key]);
    if (this._inflight[key]) return this._inflight[key];
    const p = (async () => {
      try {
        const results = await NexusDataEngine.searchGames(clean);
        const target = normTitle(clean);
        const exact = results.find(r => r.steamAppID && normTitle(cleanTitleForSearch(r.title)) === target);
        const any = results.find(r => r.steamAppID);
        const appid = (exact || any) ? (exact || any).steamAppID : null;
        this._appid[key] = appid;
        return appid;
      } catch { this._appid[key] = null; return null; }
      finally { delete this._inflight[key]; }
    })();
    this._inflight[key] = p;
    return p;
  },
  // Tier 2.5: keyless, CORS-enabled (origin=*) Wikipedia box-art lookup for
  // console/Nintendo exclusives absent from Steam. Conservative — only accepts a
  // confidently cover-named file so it never surfaces a screenshot.
  _wiki: {},
  async findWikipediaCover(title) {
    const clean = cleanTitleForSearch(title);
    const key = clean.toLowerCase();
    if (key in this._wiki) return this._wiki[key];
    const api = 'https://en.wikipedia.org/w/api.php';
    // Fast, reliable path: a game article's lead/infobox image IS the box art.
    // pageimages returns it directly — no hash-prefixed URL guessing, no scan.
    try {
      const pj = await fetch(`${api}?action=query&format=json&origin=*&redirects=1&prop=pageimages&piprop=original|thumbnail&pithumbsize=600&titles=${encodeURIComponent(clean)}`).then(r => r.json());
      const pp = Object.values(pj.query.pages)[0];
      const lead = pp && ((pp.thumbnail && pp.thumbnail.source) || (pp.original && pp.original.source));
      if (lead && /\.(jpe?g|png)(\?|$)/i.test(lead) && !/\.svg/i.test(lead)) {
        this._wiki[key] = lead; return lead;
      }
    } catch { /* fall through to the image-scan heuristic */ }
    try {
      const j = await fetch(`${api}?action=query&format=json&origin=*&redirects=1&prop=images&imlimit=60&titles=${encodeURIComponent(clean)}`).then(r => r.json());
      const pg = Object.values(j.query.pages)[0];
      const files = (pg && pg.images ? pg.images.map(i => i.title) : []).filter(t => /\.(jpe?g|png)$/i.test(t) && !/\.svg/i.test(t));
      // Keep only meaningful title words (drop single letters like the "s" in "Luigi's").
      const titleWords = clean.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 2 || /\d/.test(w));
      const score = (t) => {
        const fname = t.replace(/^File:/i, '').replace(/\.(jpe?g|png)$/i, '').toLowerCase();
        let s = 0;
        if (/cover|box ?art|boxart|key ?art/.test(fname)) s += 6;
        // A box-art file name is basically JUST the title; a screenshot adds many
        // descriptive words. Measure the "extra" text beyond the title words.
        let extra = fname.replace(/[^a-z0-9]+/g, ' ');
        titleWords.forEach(w => { extra = extra.split(w).join(' '); });
        extra = extra.replace(/\b(cover|box|art|boxart|edition|hd|the|of)\b/g, '').replace(/[^a-z0-9]/g, '');
        if (extra.length <= 3) s += 5;        // filename ≈ title -> box art
        else if (extra.length > 12) s -= 6;   // lots of extra words -> a scene/screenshot
        if (/logo|icon|screenshot|gameplay|banner|e3|gdc|cropped|booth|photo|map|font|award|wallpaper|fighting|scene|trailer|promo|render/.test(fname)) s -= 8;
        return s;
      };
      files.sort((a, b) => score(b) - score(a));
      if (!files[0] || score(files[0]) < 5) { this._wiki[key] = null; return null; }
      const ij = await fetch(`${api}?action=query&format=json&origin=*&prop=imageinfo&iiprop=url&iiurlwidth=600&titles=${encodeURIComponent(files[0])}`).then(r => r.json());
      const ip = Object.values(ij.query.pages)[0];
      const url = ip.imageinfo && ip.imageinfo[0] && (ip.imageinfo[0].thumburl || ip.imageinfo[0].url);
      this._wiki[key] = url || null;
      return this._wiki[key];
    } catch { this._wiki[key] = null; return null; }
  },
  // Unified cover router: atlas → Steam capsule → Wikipedia → null (Tier 3).
  // `skip` lets the error path bypass a URL that already failed to load (e.g. a
  // stale atlas entry) so a broken cover still recovers via Steam/Wikipedia
  // instead of dead-ending on the text-initial fallback.
  async resolve(title, skip = null) {
    const atlas = atlasLookup(title);
    if (atlas && atlas !== skip) return atlas;
    const appid = await this.findAppId(title);
    if (appid) { const art = this.steamArt(appid, true); if (art !== skip) return art; }
    return this.findWikipediaCover(title);
  },
  // Harvest a cover for a fallback frame that has no Tier-1 art.
  async harvestFrame(frame) {
    if (!frame || frame.dataset.harvestDone === '1') return;
    frame.dataset.harvestDone = '1';
    const title = frame.dataset.harvest;
    const url = await this.resolve(title);
    if (!url) return; // keep Tier 3 fallback
    const holder = frame.querySelector('.cover-holder') || frame;
    const img = document.createElement('img');
    img.className = 'w-full h-full object-cover relative z-[1]';
    img.loading = 'lazy';
    img.alt = title + ' cover';
    img.dataset.title = title;
    img.dataset.harvested = '1';        // already resolved — don't re-harvest on error
    img.dataset.srcs = JSON.stringify([url]);
    img.dataset.idx = '0';
    img.onerror = () => nexusImgErr(img);
    img.onload = () => { const fb = frame.querySelector('.cover-fallback'); if (fb) fb.style.display = 'none'; };
    img.src = url;
    holder.appendChild(img);
  },
  // Lazily harvest only cards that scroll into view (perf across thousands).
  observeAll() {
    if (!('IntersectionObserver' in window)) {
      $$('[data-harvest]').forEach(f => this.harvestFrame(f));
      return;
    }
    if (!this._io) {
      this._io = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) { this.harvestFrame(e.target); this._io.unobserve(e.target); } });
      }, { rootMargin: '300px' });
    }
    $$('[data-harvest]').forEach(f => {
      if (f.dataset.harvestObs !== '1') { f.dataset.harvestObs = '1'; this._io.observe(f); }
    });
  },
};

// Global <img> error walker — Tier-1 candidates → Tier-2 harvest → Tier-3 CSS frame.
function nexusImgErr(img) {
  try {
    const srcs = JSON.parse(img.dataset.srcs || '[]');
    const next = parseInt(img.dataset.idx || '0', 10) + 1;
    if (next < srcs.length) { img.dataset.idx = String(next); img.src = srcs[next]; return; }
  } catch { /* fall through */ }
  // Tier 2/2.5: harvest a cover by title (atlas → Steam → Wikipedia), once per image.
  if (img.dataset.harvested !== '1' && img.dataset.title) {
    img.dataset.harvested = '1';
    const failed = img.src;   // skip whatever just 404'd (e.g. a stale atlas URL)
    ImageHarvester.resolve(img.dataset.title, failed).then(url => {
      if (url) {
        img.dataset.srcs = JSON.stringify([url]);
        img.dataset.idx = '0';
        img.style.display = '';
        img.src = url;
      } else { nexusImgErr(img); }
    }).catch(() => nexusImgErr(img));
    return;
  }
  // Tier 3: reveal the premium CSS fallback frame.
  img.style.display = 'none';
  const fb = img.closest('.cover-frame')?.querySelector('.cover-fallback');
  if (fb) fb.style.display = 'flex';
}
window.nexusImgErr = nexusImgErr;

function cardHTML(deal) {
  const fav = State.isFavorite(deal.id);
  const owned = State.isOwned(deal.title);
  const cat = categoryMeta(deal.category);
  const isFree = deal.sale === 0;
  const imgs = Array.isArray(deal.imgs) ? deal.imgs.filter(u => u && !u.startsWith('data:')) : [];

  const tagBadges = deal.tags.map(t =>
    `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide bg-nexus-bg/70 border border-nexus-border text-slate-300">${escapeHtml(t)}</span>`
  ).join('');

  const priceBlock = deal.f2p
    ? `<span class="text-blue-400 font-extrabold text-lg drop-shadow-[0_0_8px_rgba(59,130,246,.5)]">Free to Play</span>`
    : isFree
    ? `<span class="text-nexus-green font-extrabold text-lg drop-shadow-[0_0_8px_rgba(34,197,94,.5)]">FREE</span>`
    : deal.fullPrice
    ? `<span class="text-slate-200 font-extrabold text-lg">${money(deal.sale)}</span>
       <span class="block text-[10px] text-amber-400/90 font-semibold">Full retail price</span>`
    : `<span class="text-slate-500 line-through text-xs decoration-nexus-red/80 decoration-2">${money(deal.retail)}</span>
       <span class="text-nexus-green font-extrabold text-lg ml-1.5">${money(deal.sale)}</span>`;

  const discountBadge = deal.f2p
    ? `<div class="absolute top-2 left-2 z-[2] px-2 py-1 rounded-md text-[10px] font-black text-white bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,.6)]">FREE-TO-PLAY</div>`
    : deal.fullPrice
    ? `<div class="absolute top-2 left-2 z-[2] px-2 py-1 rounded-md text-[10px] font-black text-nexus-bg bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,.5)]">NOT ON SALE</div>`
    : (deal.discount > 0 || isFree)
    ? `<div class="absolute top-2 left-2 z-[2] px-2 py-1 rounded-md text-xs font-black text-nexus-bg bg-nexus-green shadow-[0_0_12px_rgba(34,197,94,.6)]">
         ${isFree ? '100% OFF' : '-' + deal.discount + '%'}</div>`
    : '';

  // Favorites watchlist: flash a price-drop notice when a bookmarked title now
  // has a live cheaper/active deal.
  const priceDropBadge = State.priceDrops.has(normTitle(deal.title))
    ? `<div class="price-drop-flash absolute top-9 left-2 z-[3] px-2 py-1 rounded-md text-[10px] font-black text-white bg-nexus-red">🔥 PRICE DROP NOTICE</div>`
    : '';

  // Tier 3 — premium CSS fallback frame: dark material gradient, system console
  // emblem, bold title, and a neon inset border matching the system ecosystem.
  const sys = systemMeta(deal.system);
  const fallbackHTML = `
    <div class="cover-fallback absolute inset-0 flex-col justify-between p-3 rounded-2xl"
         style="display:${imgs.length ? 'none' : 'flex'};
           background:
             radial-gradient(120% 85% at 50% 0%, ${cat.accent}44 0%, transparent 55%),
             linear-gradient(160deg, #1b1b2e 0%, #0c0c14 100%);
           box-shadow: inset 0 0 0 2px ${sys.color}55, inset 0 0 22px -6px ${sys.color};">
      <div class="flex justify-between items-start">
        <span class="text-lg drop-shadow" title="${escapeHtml(sys.label)}">${sys.emoji}</span>
        <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/40 border border-white/10"
              style="color:${sys.color}">${escapeHtml(deal.tags[0] || '')}</span>
      </div>
      <div class="absolute inset-0 grid place-items-center pointer-events-none">
        <span class="text-6xl font-black opacity-[0.14] select-none" style="color:${sys.color}">${escapeHtml(initialsOf(deal.title))}</span>
      </div>
      <div class="relative z-[1]">
        <div class="text-sm font-extrabold leading-tight text-slate-100 drop-shadow-lg clamp-2">${escapeHtml(deal.title)}</div>
        <div class="text-[10px] text-slate-400 mt-0.5">${escapeHtml(deal.store)}</div>
      </div>
    </div>`;

  const imgTag = imgs.length
    ? `<img src="${escapeHtml(imgs[0])}" data-srcs='${escapeHtml(JSON.stringify(imgs))}' data-idx="0"
         data-title="${escapeHtml(deal.title)}" alt="${escapeHtml(deal.title)} cover" loading="lazy"
         class="w-full h-full object-cover relative z-[1]" onerror="nexusImgErr(this)" />`
    : '';

  return `
  <article class="deal-card anim-in group relative flex flex-col rounded-2xl bg-nexus-card border border-nexus-border overflow-hidden"
           data-id="${deal.id}" tabindex="0" role="button" aria-label="View details for ${escapeHtml(deal.title)}">
    <div class="cover-frame relative aspect-[2/3] bg-nexus-bg shadow-lg"${imgs.length ? '' : ` data-harvest="${escapeHtml(deal.title)}"`}>
      <div class="cover-holder block w-full h-full">
        ${fallbackHTML}
        ${imgTag}
      </div>
      ${discountBadge}
      ${priceDropBadge}
      <button data-fav="${deal.id}" title="Toggle favorite"
        class="absolute top-2 right-2 z-[2] w-8 h-8 grid place-items-center rounded-full backdrop-blur
               ${fav ? 'bg-nexus-violet text-white shadow-glow-soft' : 'bg-black/50 text-slate-300 hover:text-white'} transition">
        <span class="text-sm">${fav ? '★' : '☆'}</span>
      </button>
      <div class="absolute bottom-2 left-2 z-[2] px-2 py-0.5 rounded-md text-[10px] font-semibold bg-black/60 backdrop-blur text-slate-200 border border-white/10">
        ${escapeHtml(deal.store)}
      </div>
    </div>

    <div class="p-3 flex flex-col gap-2 flex-1">
      <h3 class="font-bold text-sm leading-snug clamp-2 min-h-[2.4em]" title="${escapeHtml(deal.title)}">${escapeHtml(deal.title)}</h3>
      <div class="flex flex-wrap gap-1">${tagBadges}</div>
      <div class="mt-auto flex items-end justify-between pt-1">
        <div class="leading-none">${priceBlock}</div>
      </div>
      <button data-own="${deal.id}"
        class="mt-1 w-full py-1.5 rounded-lg text-xs font-bold transition border
               ${owned ? 'bg-nexus-cyan/15 border-nexus-cyan text-nexus-cyan'
                       : 'bg-nexus-bg border-nexus-border text-slate-300 hover:border-nexus-cyan hover:text-white'}">
        ${owned ? '✓ In Library' : '+ Mark Owned'}
      </button>
    </div>
  </article>`;
}

function sectionHTML(cat, items) {
  let filterControl = '';

  if (cat.id === 'free' || cat.id === 'pc') {
    // PC/subscription store-separation checkbox row.
    const set = State.filters.storeFilter[cat.id];
    const boxes = STORE_CHECKS.map(o => {
      const on = set.has(o.v);
      return `
      <label class="sub-store flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer select-none transition ${on ? 'text-white font-semibold' : 'text-slate-400'}"
             style="border-color:${on ? cat.accent : '#25253a'};background:${on ? cat.accent + '1f' : 'transparent'}">
        <input type="checkbox" data-store-check="${cat.id}" value="${o.v}" ${on ? 'checked' : ''}
               class="w-3.5 h-3.5" style="accent-color:${cat.accent}">
        <span>${o.emoji} ${escapeHtml(o.l)}</span>
      </label>`;
    }).join('');
    filterControl = `<div class="flex flex-wrap items-center gap-1.5">${boxes}</div>`;
  } else {
    // Console dropdown sub-filter.
    const subs = SUBFILTERS[cat.id];
    const cur = State.filters.subFilter[cat.id] || 'all';
    filterControl = subs ? `
      <select data-subfilter="${cat.id}"
        class="bg-nexus-bg border rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none cursor-pointer transition"
        style="border-color:${cat.accent}55">
        ${subs.map(o => `<option value="${o.v}" ${o.v === cur ? 'selected' : ''}>${escapeHtml(o.l)}</option>`).join('')}
      </select>` : '';
  }

  return `
  <section data-cat="${cat.id}">
    <div class="flex items-end justify-between mb-4 flex-wrap gap-3">
      <div>
        <h2 class="text-xl sm:text-2xl font-extrabold flex items-center gap-2.5" style="text-shadow:0 0 22px ${cat.accent}55">
          <span>${cat.emoji}</span><span>${escapeHtml(cat.title)}</span>
        </h2>
        <p class="text-xs text-slate-500 mt-0.5 ml-9">${escapeHtml(cat.blurb)}</p>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        ${filterControl}
        <span data-count-badge="${cat.id}" class="text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap"
              style="color:${cat.accent};border-color:${cat.accent}55;background:${cat.accent}12">
          ${items.length} title${items.length === 1 ? '' : 's'}
        </span>
      </div>
    </div>
    <div data-grid class="grid grid-cols-1 min-[400px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 sm:gap-4">
      ${items.map(cardHTML).join('')}
    </div>
  </section>`;
}

// Favorites watchlist monitor: flag bookmarked titles that now have a live,
// cheaper/active deal so the card can flash a "PRICE DROP NOTICE".
function detectPriceDrops() {
  const drops = new Set();
  Object.values(State.favorites).forEach(f => {
    const deal = State.deals.find(d => normTitle(d.title) === normTitle(f.title) && (d.discount > 0 || d.sale === 0));
    if (deal) {
      const favSale = (typeof f.sale === 'number') ? f.sale : Infinity;
      if (f.fullPrice || deal.sale < favSale) drops.add(normTitle(f.title));
    }
  });
  State.priceDrops = drops;
}

// Encyclopedia (full-price) search results section — only while searching.
function renderSearchSectionHTML(visibleTitles) {
  if (!State.filters.search || !State.searchResults.length) return '';
  const items = State.searchResults.filter(d => !visibleTitles.has(normTitle(d.title)));
  if (!items.length) return '';
  const accent = '#f59e0b';
  return `
  <section data-cat="search">
    <div class="flex items-end justify-between mb-4 flex-wrap gap-3">
      <div>
        <h2 class="text-xl sm:text-2xl font-extrabold flex items-center gap-2.5" style="text-shadow:0 0 22px ${accent}55">
          <span>🔎</span><span>Global Search Results</span>
        </h2>
        <p class="text-xs text-slate-500 mt-0.5 ml-9">Full-catalog matches (incl. full-price titles) via CheapShark — bookmark to watch for drops.</p>
      </div>
      <span class="text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap"
            style="color:${accent};border-color:${accent}55;background:${accent}12">${items.length} title${items.length === 1 ? '' : 's'}</span>
    </div>
    <div data-grid class="grid grid-cols-1 min-[400px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 sm:gap-4">
      ${items.map(cardHTML).join('')}
    </div>
  </section>`;
}

function renderSections() {
  const host = $('#sections');
  const visible = State.allDeals().filter(dealPasses);
  const visibleTitles = new Set(visible.map(v => normTitle(v.title)));
  const searchHTML = renderSearchSectionHTML(visibleTitles);
  const encCount = searchHTML ? State.searchResults.filter(d => !visibleTitles.has(normTitle(d.title))).length : 0;

  $('#dealCounter').textContent =
    `${visible.length} deal${visible.length === 1 ? '' : 's'} shown${encCount ? ` · ${encCount} encyclopedia` : ''}`;

  if (!visible.length && !searchHTML) {
    host.innerHTML = '';
    $('#emptyState').classList.remove('hidden');
    return;
  }
  $('#emptyState').classList.add('hidden');

  const catHTML = CATEGORIES.map(cat => {
    const items = visible.filter(d => d.category === cat.id);
    if (items.length) return sectionHTML(cat, items);
    // Keep the premier giveaways row visible with a note when none are live.
    if (cat.id === 'free' && !State.filters.search && State.filters.systems.has('pc')) {
      return `
      <section data-cat="free">
        <div class="mb-3">
          <h2 class="text-xl sm:text-2xl font-extrabold flex items-center gap-2.5" style="text-shadow:0 0 22px ${cat.accent}55">
            <span>${cat.emoji}</span><span>${escapeHtml(cat.title)}</span>
          </h2>
          <p class="text-xs text-slate-500 mt-0.5 ml-9">${escapeHtml(cat.blurb)}</p>
        </div>
        <div class="p-5 rounded-2xl border border-nexus-border bg-nexus-card/40 text-sm text-slate-400">
          🕓 No limited-time giveaways are live at this moment — they rotate weekly. Grab a
          <span class="text-blue-400 font-semibold">Free-to-Play staple</span> below in the meantime! 🎮
        </div>
      </section>`;
    }
    return '';
  }).join('');

  host.innerHTML = searchHTML + catHTML;
  ImageHarvester.observeAll();   // lazily harvest covers for artless cards
}

async function runEncyclopediaSearch(query) {
  try {
    const results = await NexusDataEngine.searchGames(query);
    if (State.filters.search !== query.toLowerCase().trim()) return; // query moved on
    State.searchResults = results;
    detectPriceDrops();
    renderSections();
  } catch (e) {
    console.warn('[encyclopedia] search failed:', e.message);
  }
}

// Seamlessly append freshly-paginated deals into their existing grids.
function appendNewDeals(fresh) {
  const passing = fresh.filter(dealPasses);
  const byCat = {};
  passing.forEach(d => (byCat[d.category] = byCat[d.category] || []).push(d));

  let needFull = false;
  Object.entries(byCat).forEach(([cat, items]) => {
    const grid = document.querySelector(`section[data-cat="${cat}"] [data-grid]`);
    if (!grid) { needFull = true; return; }
    grid.insertAdjacentHTML('beforeend', items.map(cardHTML).join(''));
    const badge = document.querySelector(`[data-count-badge="${cat}"]`);
    if (badge) {
      const n = State.allDeals().filter(d => d.category === cat && dealPasses(d)).length;
      badge.textContent = `${n} title${n === 1 ? '' : 's'}`;
    }
  });

  if (needFull) renderSections();
  const total = State.allDeals().filter(dealPasses).length;
  $('#dealCounter').textContent = `${total} deal${total === 1 ? '' : 's'} shown`;
  ImageHarvester.observeAll();
}

/* ---- System filter badges ---- */
function renderSystemFilters() {
  $('#systemFilters').innerHTML = SYSTEMS.map(s => {
    const active = State.filters.systems.has(s.id);
    return `
    <button class="sys-badge shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold"
      data-system="${s.id}" data-active="${active}" style="color:${s.color};border-color:${s.color}">
      <span>${s.emoji}</span><span>${s.label}</span>
    </button>`;
  }).join('');
}

/* ---- Header badge counts ---- */
function renderCounts() {
  const setBadge = (name, count) => {
    const el = $(`[data-count="${name}"]`);
    if (!el) return;
    el.textContent = count;
    el.style.transform = count > 0 ? 'scale(1)' : 'scale(0)';
  };
  setBadge('favorites', Object.keys(State.favorites).length);
  setBadge('library', State.library.length);
}

/* ---- Favorites panel ---- */
function renderFavorites() {
  const list = $('#favoritesList');
  const chips = $('#favFilterChips');
  const favArr = Object.values(State.favorites);
  const platforms = ['all', ...new Set(favArr.map(f => f.system))];

  chips.innerHTML = platforms.map(p => {
    const meta = p === 'all' ? { label: 'All', color: '#94a3b8', emoji: '🌐' } : systemMeta(p);
    const active = State.filters.favPlatform === p;
    return `<button data-favfilter="${p}"
      class="shrink-0 px-2.5 py-1 rounded-full text-xs border transition ${active ? 'font-bold' : 'opacity-60'}"
      style="color:${meta.color};border-color:${meta.color}${active ? '' : '55'}">
      ${meta.emoji || ''} ${escapeHtml(meta.label)}</button>`;
  }).join('');

  const filtered = favArr.filter(f => State.filters.favPlatform === 'all' || f.system === State.filters.favPlatform);

  if (!filtered.length) {
    list.innerHTML = `<div class="text-center py-16 text-slate-500">
      <div class="text-4xl mb-2">⭐</div><p class="text-sm">No favorites yet.</p>
      <p class="text-xs mt-1">Tap the ☆ on any deal to pin it here.</p></div>`;
    return;
  }

  list.innerHTML = filtered.map(f => {
    const sys = systemMeta(f.system);
    return `
    <div class="flex gap-3 p-2.5 rounded-xl bg-nexus-card border border-nexus-border">
      <img src="${escapeHtml(f.img)}" alt="" class="w-12 h-16 object-cover rounded-md shrink-0"
           onerror="this.onerror=null;this.src='${placeholderCover(f.title)}'">
      <div class="flex-1 min-w-0">
        <a href="${escapeHtml(f.url)}" target="_blank" rel="noopener" class="font-semibold text-sm hover:text-nexus-cyan transition block truncate">${escapeHtml(f.title)}</a>
        <div class="text-xs mt-0.5" style="color:${sys.color}">${sys.emoji} ${escapeHtml(sys.label)}</div>
        <div class="text-xs mt-1">
          ${f.sale === 0 ? '<span class="text-nexus-green font-bold">FREE</span>'
            : `<span class="text-slate-500 line-through">${money(f.retail)}</span>
               <span class="text-nexus-green font-bold ml-1">${money(f.sale)}</span>`}
        </div>
      </div>
      <button data-fav="${f.id}" title="Remove" class="self-start text-slate-500 hover:text-nexus-red transition text-lg leading-none">×</button>
    </div>`;
  }).join('');
}

/* ---- Library panel ---- */
function renderLibrary() {
  const list = $('#libraryList');
  const countEl = $('#libraryCount');
  if (countEl) countEl.textContent = `${State.library.length} game${State.library.length === 1 ? '' : 's'}`;
  if (!State.library.length) {
    list.innerHTML = `<div class="col-span-full text-center py-16 text-slate-500">
      <div class="text-4xl mb-2">📚</div><p class="text-sm">Your library is empty.</p>
      <p class="text-xs mt-1">Mark deals as owned, or add games from the panel on the right.</p></div>`;
    return;
  }

  list.innerHTML = State.library.map(g => {
    const sys = systemMeta(g.platform === 'Switch2' ? 'switch2'
      : g.platform === 'Switch' ? 'switch'
      : g.platform === 'PlayStation' ? 'ps'
      : g.platform === 'Xbox' ? 'xbox' : 'pc');
    const dlcRows = (g.dlc || []).map((d, i) => `
      <label class="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
        <input type="checkbox" data-dlc="${g.id}" data-dlc-idx="${i}" ${d.owned ? 'checked' : ''} class="accent-nexus-cyan w-3.5 h-3.5">
        <span class="${d.owned ? 'text-slate-300' : 'line-through opacity-60'}">${escapeHtml(d.name)}</span>
      </label>`).join('');

    return `
    <div class="p-3 rounded-xl bg-nexus-card border border-nexus-border">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <h4 class="font-semibold text-sm truncate">${escapeHtml(g.title)}</h4>
          <div class="flex items-center gap-1.5 flex-wrap mt-0.5">
            <span class="text-xs" style="color:${sys.color}">${sys.emoji} ${escapeHtml(sys.label)}</span>
            ${dlcBadge(g)}
          </div>
        </div>
        <button data-lib-remove="${g.id}" class="text-slate-500 hover:text-nexus-red transition text-lg leading-none shrink-0">×</button>
      </div>
      ${dlcRows ? `<div class="mt-2 pl-1 space-y-1 border-l-2 border-nexus-border/70 ml-1">
        <div class="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Add-ons / DLC</div>${dlcRows}</div>` : ''}
      <div class="mt-2 flex gap-1.5">
        <input data-dlc-add="${g.id}" type="text" placeholder="Add DLC…"
          class="flex-1 bg-nexus-bg border border-nexus-border rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-nexus-cyan">
        <button data-dlc-add-btn="${g.id}" class="px-2.5 py-1 rounded-lg bg-nexus-bg border border-nexus-border text-xs hover:border-nexus-cyan transition">+</button>
      </div>
    </div>`;
  }).join('');
}

/* ---- Admin (manual deals) list ---- */
function renderAdminList() {
  const list = $('#adminList');
  if (!State.manual.length) {
    list.innerHTML = `<p class="text-xs text-slate-600 italic">No manual deals yet.</p>`;
    return;
  }
  list.innerHTML = State.manual.map(m => `
    <div class="flex items-center justify-between gap-2 p-2 rounded-lg bg-nexus-card border border-nexus-border">
      <div class="min-w-0">
        <div class="text-sm font-medium truncate">${escapeHtml(m.title)}</div>
        <div class="text-xs text-slate-500">${escapeHtml(categoryMeta(m.category).title)} · ${money(m.sale)}</div>
      </div>
      <button data-manual-remove="${m.id}" class="text-slate-500 hover:text-nexus-red transition text-lg leading-none shrink-0">×</button>
    </div>`).join('');
}

function renderAll() {
  renderSections();
  renderCounts();
}

/* --------------------------------------------------------------------------
 * 8. ACTIONS
 * ------------------------------------------------------------------------ */

function findDeal(id) {
  return State.allDeals().find(d => d.id === id) || State.searchResults.find(d => d.id === id);
}

function toggleFavorite(id) {
  if (State.favorites[id]) {
    delete State.favorites[id];
    toast('Removed from favorites', 'info');
  } else {
    const deal = findDeal(id);
    if (!deal) return;
    State.favorites[id] = {
      id: deal.id, title: deal.title,
      img: (deal.imgs && deal.imgs[0]) ? deal.imgs[0] : placeholderCover(deal.title, categoryMeta(deal.category).accent),
      url: deal.url, system: deal.system, retail: deal.retail, sale: deal.sale,
      fullPrice: !!deal.fullPrice, gameID: deal.gameID,
    };
    toast(deal.fullPrice ? 'Bookmarked — we\'ll watch for a price drop 👀' : 'Added to favorites ⭐', 'ok');
  }
  State.persist();
  renderAll();
  renderFavorites();
  refreshDetailIfOpen(id);
}

function toggleOwned(id) {
  const deal = findDeal(id);
  if (!deal) return;
  const t = deal.title.trim().toLowerCase();
  const idx = State.library.findIndex(g => (g.title || '').trim().toLowerCase() === t);
  if (idx >= 0) {
    State.library.splice(idx, 1);
    toast('Removed from library', 'info');
  } else {
    State.library.push({ id: uid(), title: deal.title, platform: systemToPlatform(deal.system), dlc: [], owned: true });
    toast('Added to library 📚', 'ok');
  }
  State.persist();
  renderAll();
  renderLibrary();
  refreshDetailIfOpen(id);
}

function systemToPlatform(system) {
  return ({ ps: 'PlayStation', xbox: 'Xbox', switch: 'Switch', switch2: 'Switch2', pc: 'PC' })[system] || 'PC';
}

/* --------------------------------------------------------------------------
 * 9. INFINITE SCROLL / LOAD MORE
 * ------------------------------------------------------------------------ */

function updateLoadMoreUI(state) {
  const wrap = $('#loadMoreWrap');
  const btn = $('#loadMoreBtn');
  const note = $('#loadMoreNote');
  if (!wrap || !btn) return;

  if (State.engine.usedFallback) {
    btn.style.display = 'none';
    note.textContent = 'Offline mode — showing the full curated catalogue.';
    return;
  }
  btn.style.display = '';
  if (state === 'loading') { btn.disabled = true; btn.textContent = '⏳ Loading more…'; note.textContent = ''; }
  else if (!State.engine.hasMore) { btn.disabled = true; btn.textContent = '🎉 All caught up'; note.textContent = `Synced ${State.engine.liveCount} live PC deals.`; }
  else { btn.disabled = false; btn.textContent = '⬇ Load More Deals'; note.textContent = `${State.engine.liveCount} live PC deals loaded — scroll for more.`; }
}

async function loadMore() {
  if (!State.booted || State.loadingMore || !State.engine.hasMore || State.engine.usedFallback) return;
  State.loadingMore = true;
  updateLoadMoreUI('loading');
  try {
    const fresh = await State.engine.loadMore();
    if (fresh.length) {
      State.deals.push(...fresh);
      appendNewDeals(fresh);
    }
  } catch (err) {
    console.warn('[loadMore] failed:', err.message);
    toast('Could not load more deals', 'warn');
  } finally {
    State.loadingMore = false;
    updateLoadMoreUI('idle');
  }
}

function setupInfiniteScroll() {
  const sentinel = $('#scrollSentinel');
  if (!sentinel || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) loadMore(); });
  }, { rootMargin: '700px 0px' });
  io.observe(sentinel);
}

/* --------------------------------------------------------------------------
 * 9.5 GAME DETAIL MODAL  (interactive product view + edition matching + RAWG)
 * ------------------------------------------------------------------------ */

const tagBadgeHTML = (t) =>
  `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide bg-nexus-bg/70 border border-nexus-border text-slate-300">${escapeHtml(t)}</span>`;

// Best landscape splash for a deal (derived from Steam header, else null).
function splashOf(deal) {
  const steam = (deal.imgs || []).find(u => /steam\/apps\/\d+/.test(u));
  if (steam) return steam.replace(/library_600x900(_2x)?\.jpg/, 'header.jpg');
  const remote = (deal.imgs || []).find(u => u && !u.startsWith('data:'));
  return remote || null;
}
function coverOf(deal) {
  return (deal.imgs || []).find(u => u && !u.startsWith('data:')) || null;
}

// All tracked listings that share this game's edition-agnostic base title.
function relatedEditions(deal) {
  const base = baseTitle(deal.title);
  return State.allDeals().filter(d => baseTitle(d.title) === base);
}

function fallbackDescription(deal, related) {
  const plats = [...new Set(related.flatMap(d => d.tags))].join(', ');
  const stores = [...new Set(related.map(d => d.store))].join(', ');
  const priceLine = deal.sale === 0
    ? 'It is currently 100% free to keep — claim it from the storefront before the giveaway ends.'
    : `This ${editionLabel(deal.title)} is currently discounted ${deal.discount}% — down from ${money(deal.retail)} to ${money(deal.sale)}.`;
  return `${deal.title} is available across ${related.length} tracked ${related.length === 1 ? 'listing' : 'listings'} (${stores}). ${priceLine} Supported platforms: ${plats}. Add it to your Library to track ownership, or pin it to Favorites to watch for deeper price drops across every ecosystem.`;
}

// Human storefront brand name for a listing (explicit, no mystery redirect).
function storeBrand(deal) {
  const s = (deal.store || '').toLowerCase();
  if (s.includes('steam')) return 'Steam';
  if (s.includes('epic')) return 'Epic Games';
  if (s.includes('gog')) return 'GOG';
  if (s.includes('prime')) return 'Prime Gaming';
  if (s.includes('luna')) return 'Amazon Luna';
  if (deal.category === 'playstation') return 'PlayStation Store';
  if (deal.category === 'xbox') return 'Xbox Store';
  if (deal.category === 'nintendo') return 'Nintendo eShop';
  return deal.store || 'Store';
}
const STORE_ICON = (brand) => ({
  'Steam': '🟦', 'Epic Games': '⚫', 'GOG': '🟣', 'Prime Gaming': '🔵', 'Amazon Luna': '🌙',
  'PlayStation Store': '💙', 'Xbox Store': '💚', 'Nintendo eShop': '🛑',
}[brand] || '🏬');
function buyLabel(deal) {
  const brand = storeBrand(deal);
  return deal.sale === 0 ? `Get Free on ${brand}` : `${deal.source === 'cheapshark' ? 'View Deal' : 'Buy Directly'} on ${brand}`;
}

function editionRowHTML(d, activeId, cheapestId) {
  const isActive = d.id === activeId;
  const isCheapest = d.id === cheapestId;
  const brand = storeBrand(d);
  const price = d.sale === 0
    ? '<span class="text-nexus-green font-extrabold">FREE</span>'
    : `<span class="text-slate-500 line-through text-xs decoration-nexus-red/80 decoration-2">${money(d.retail)}</span>
       <span class="text-nexus-green font-extrabold ml-1.5">${money(d.sale)}</span>`;
  const disc = (d.discount > 0 || d.sale === 0)
    ? `<span class="ml-2 px-1.5 py-0.5 rounded text-[10px] font-black text-nexus-bg bg-nexus-green">${d.sale === 0 ? '100%' : '-' + d.discount + '%'}</span>`
    : '';
  const best = isCheapest ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-black text-nexus-bg bg-amber-400">💰 BEST PRICE</span>` : '';
  return `
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 rounded-xl bg-nexus-card border ${isActive ? 'border-nexus-cyan shadow-glow' : isCheapest ? 'border-amber-400/70' : 'border-nexus-border'}">
      <div class="flex items-center gap-2 min-w-0">
        <span class="text-base">${STORE_ICON(brand)}</span>
        <div class="min-w-0">
          <div class="text-sm font-semibold text-slate-200 truncate">${escapeHtml(brand)}</div>
          <div class="flex flex-wrap gap-1 mt-0.5">${d.tags.map(tagBadgeHTML).join('')}</div>
        </div>
      </div>
      <div class="ml-auto flex items-center gap-3">
        ${best}
        <div class="text-right leading-none whitespace-nowrap">${price}${disc}</div>
        <a href="${escapeHtml(d.url)}" target="_blank" rel="noopener noreferrer"
           class="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-nexus-cyan to-nexus-violet text-nexus-bg hover:opacity-90 transition">
          ${escapeHtml(buyLabel(d))} ↗
        </a>
      </div>
    </div>`;
}

// Clickable/tappable screenshot thumbnails that open the fullscreen lightbox.
function shotsMarkup(urls) {
  return urls.map((s, i) =>
    `<img src="${escapeHtml(s)}" data-shot="${escapeHtml(s)}" alt="Screenshot ${i + 1}" loading="lazy"
       class="h-28 sm:h-36 rounded-lg object-cover border border-nexus-border shrink-0 cursor-zoom-in hover:border-nexus-cyan transition"
       onclick="nexusOpenShot(this)" onerror="this.remove()">`).join('');
}

// Last-resort screenshot fill: if no live media resolved, show the key art so
// the strip is never a stuck spinner (still tappable to enlarge).
function finalizeShots(deal) {
  if (State.activeDetail !== deal.id) return;
  const el = document.getElementById('detailShots');
  if (!el || !el.querySelector('[data-shots-loading]')) return; // real shots already applied
  const urls = [splashOf(deal), coverOf(deal)].filter((v, i, a) => v && a.indexOf(v) === i);
  el.innerHTML = urls.length ? shotsMarkup(urls)
    : `<div class="text-xs text-slate-500 py-6">No screenshots available for this title.</div>`;
}

// Fullscreen screenshot viewer — click or tap a shot to enlarge; arrows / swipe
// to page through the set; Esc, ✕, or backdrop tap to close.
const Lightbox = {
  urls: [], idx: 0, el: null, _key: null,
  open(urls, idx) {
    if (!urls || !urls.length) return;
    this.urls = urls;
    this.idx = Math.max(0, Math.min(idx || 0, urls.length - 1));
    if (!this.el) this._build();
    this.el.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    this._render();
    // Capture phase + stopPropagation so the app's global Esc/arrow handlers
    // (which would close the whole detail modal) never see these keys while the
    // lightbox is up — Esc closes the lightbox only.
    this._key = (e) => {
      if (!['Escape', 'ArrowRight', 'ArrowLeft'].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      if (e.key === 'Escape') this.close();
      else if (e.key === 'ArrowRight') this.next(1);
      else this.next(-1);
    };
    document.addEventListener('keydown', this._key, true);
  },
  _build() {
    const el = document.createElement('div');
    el.id = 'nexus-lightbox';
    el.className = 'hidden fixed inset-0 z-[120] bg-black/95 flex items-center justify-center select-none';
    el.innerHTML = `
      <button data-lb-close aria-label="Close" class="absolute top-3 right-4 w-10 h-10 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl leading-none">×</button>
      <button data-lb-prev aria-label="Previous" class="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-11 h-11 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 text-white text-3xl leading-none">‹</button>
      <button data-lb-next aria-label="Next" class="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-11 h-11 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 text-white text-3xl leading-none">›</button>
      <img data-lb-img alt="" class="max-w-[94vw] max-h-[88vh] object-contain rounded-lg shadow-2xl">
      <div data-lb-count class="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/80 bg-black/50 px-3 py-1 rounded-full"></div>`;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-lb-next]')) this.next(1);
      else if (e.target.closest('[data-lb-prev]')) this.next(-1);
      else if (e.target.closest('[data-lb-close]') || e.target === el) this.close();
    });
    let x0 = null;
    el.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 45) this.next(dx < 0 ? 1 : -1);
    }, { passive: true });
    this.el = el;
  },
  _render() {
    const img = this.el.querySelector('[data-lb-img]');
    img.src = this.urls[this.idx];
    const multi = this.urls.length > 1;
    this.el.querySelector('[data-lb-prev]').style.display = multi ? '' : 'none';
    this.el.querySelector('[data-lb-next]').style.display = multi ? '' : 'none';
    this.el.querySelector('[data-lb-count]').textContent = multi ? `${this.idx + 1} / ${this.urls.length}` : '';
  },
  next(d) { this.idx = (this.idx + d + this.urls.length) % this.urls.length; this._render(); },
  close() {
    if (!this.el) return;
    this.el.classList.add('hidden');
    if (this._key) { document.removeEventListener('keydown', this._key, true); this._key = null; }
    const modal = document.getElementById('game-detail-modal');
    document.body.style.overflow = (modal && modal.classList.contains('open')) ? 'hidden' : '';
  },
};
function nexusOpenShot(imgEl) {
  const box = imgEl.closest('#detailShots') || imgEl.parentElement;
  const urls = [...box.querySelectorAll('[data-shot]')].map(n => n.dataset.shot).filter(Boolean);
  Lightbox.open(urls, Math.max(0, urls.indexOf(imgEl.dataset.shot)));
}
window.nexusOpenShot = nexusOpenShot;

function renderDetail(deal) {
  const cat = categoryMeta(deal.category);
  const related = relatedEditions(deal);
  const splash = splashOf(deal);
  const cover = coverOf(deal);
  const fav = State.isFavorite(deal.id);
  const owned = State.isOwned(deal.title);

  // Cheapest paid listing across all merchants (for the "Best Price" badge).
  const paid = related.filter(d => d.sale > 0);
  const cheapestId = paid.length ? paid.reduce((a, b) => (b.sale < a.sale ? b : a)).id : null;

  // Group related listings by edition, with the current deal's group first.
  const groups = {};
  related.forEach(d => { const l = editionLabel(d.title); (groups[l] = groups[l] || []).push(d); });
  const groupKeys = Object.keys(groups).sort((a, b) =>
    (a === editionLabel(deal.title) ? -1 : b === editionLabel(deal.title) ? 1 : 0));

  const editionsHTML = groupKeys.map(label => `
    <div class="mb-4">
      <h4 class="text-sm font-bold text-slate-300 mb-2 flex items-center gap-2">
        <span class="w-1.5 h-1.5 rounded-full" style="background:${cat.accent}"></span>${escapeHtml(label)}
        <span class="text-xs font-normal text-slate-500">· ${groups[label].length} listing${groups[label].length === 1 ? '' : 's'}</span>
      </h4>
      <div class="space-y-2">${groups[label].map(d => editionRowHTML(d, deal.id, cheapestId)).join('')}</div>
    </div>`).join('');

  const coverBox = cover
    ? `<img src="${escapeHtml(cover)}" alt="${escapeHtml(deal.title)} key art" class="w-full h-full object-cover"
         onerror="this.onerror=null;this.src='${placeholderCover(deal.title, cat.accent)}'">`
    : `<div class="w-full h-full grid place-items-center" style="background:radial-gradient(120% 85% at 50% 0%, ${cat.accent}44 0%, transparent 55%), linear-gradient(160deg,#1b1b2e,#0c0c14)">
         <span class="text-6xl font-black opacity-20" style="color:${cat.accent}">${escapeHtml(initialsOf(deal.title))}</span></div>`;

  const splashStyle = splash
    ? `background-image:url('${escapeHtml(splash)}');background-size:cover;background-position:center`
    : `background:radial-gradient(120% 120% at 50% 0%, ${cat.accent}55 0%, transparent 60%), linear-gradient(160deg,#1b1b2e,#0c0c14)`;

  // Start with a loading state only — never pad the strip with cover art posing
  // as screenshots. enrichDetail() fills real gameplay shots, or finalizeShots()
  // falls back to the key art if no live media resolves.
  const shotsHTML = `<div class="text-xs text-slate-500 py-6 animate-pulse" data-shots-loading>Loading live screenshots…</div>`;

  // Screenshots + trailers now load keylessly from Steam; no note needed.
  const keyHint = '';

  return `
  <!-- Sticky back bar -->
  <div class="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 bg-nexus-surface/85 backdrop-blur border-b border-nexus-border">
    <button data-detail-close class="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-nexus-card border border-nexus-border hover:border-nexus-cyan hover:text-white font-semibold text-sm transition">
      ← Back to Deals Store
    </button>
    <div class="ml-auto flex items-center gap-2">
      <button data-fav="${deal.id}" class="w-9 h-9 grid place-items-center rounded-xl border transition ${fav ? 'bg-nexus-violet text-white border-nexus-violet shadow-glow-soft' : 'bg-nexus-card border-nexus-border text-slate-300 hover:text-white'}">${fav ? '★' : '☆'}</button>
      <button data-own="${deal.id}" class="px-3 py-2 rounded-xl border text-xs font-bold transition ${owned ? 'bg-nexus-cyan/15 border-nexus-cyan text-nexus-cyan' : 'bg-nexus-card border-nexus-border text-slate-300 hover:text-white'}">${owned ? '✓ In Library' : '+ Owned'}</button>
    </div>
  </div>

  <!-- Splash backdrop -->
  <div id="detailSplash" class="relative h-44 sm:h-60 md:h-72 w-full" style="${splashStyle}">
    <div class="absolute inset-0 bg-gradient-to-t from-nexus-surface via-nexus-surface/50 to-transparent"></div>
  </div>

  <!-- Body -->
  <div class="px-4 sm:px-6 md:px-8 pb-12 -mt-16 sm:-mt-20 relative z-10 grid md:grid-cols-[260px_1fr] gap-6">
    <!-- Left: key art -->
    <div>
      <div id="detailCover" class="aspect-[2/3] rounded-2xl overflow-hidden border border-nexus-border shadow-2xl bg-nexus-bg">
        ${coverBox}
      </div>
    </div>

    <!-- Right: info -->
    <div class="min-w-0 pt-4 md:pt-16">
      <h2 class="text-2xl sm:text-3xl font-extrabold leading-tight">${escapeHtml(deal.title)}</h2>
      <div id="detailStudios" class="flex flex-wrap items-center gap-2 mt-2 text-xs text-slate-400">
        <span class="px-2 py-0.5 rounded-full border border-nexus-border">${escapeHtml(cat.emoji + ' ' + cat.title)}</span>
        ${deal.tags.map(tagBadgeHTML).join('')}
        <span class="px-2 py-0.5 rounded-full border border-nexus-border">🏬 ${escapeHtml(deal.store)}</span>
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-3 text-sm">
        ${deal.fullPrice
          ? `<span class="text-slate-300">Current: <b class="text-slate-100">${money(deal.sale)}</b> <span class="text-amber-400/90 text-xs">· not on active sale</span></span>`
          : deal.sale === 0
          ? `<span class="text-nexus-green font-bold">FREE — 100% off ${money(deal.retail)}</span>`
          : `<span class="text-slate-500 line-through">${money(deal.retail)}</span> <span class="text-nexus-green font-extrabold">${money(deal.sale)}</span> <span class="text-nexus-green text-xs">(-${deal.discount}%)</span>`}
      </div>
      <div id="detailHistLow" class="mt-2 text-sm"></div>

      <div class="mt-4">
        <h3 class="text-sm font-bold text-slate-300 mb-1">About this game</h3>
        <p id="detailDesc" class="text-sm text-slate-400 leading-relaxed">${escapeHtml(fallbackDescription(deal, related))}</p>
        ${keyHint}
      </div>

      <div id="detailTrailer" class="mt-5 hidden"></div>

      <div class="mt-5">
        <h3 class="text-sm font-bold text-slate-300 mb-2">Screenshots</h3>
        <div id="detailShots" class="flex gap-3 overflow-x-auto no-scrollbar pb-2">${shotsHTML}</div>
      </div>

      <div class="mt-6">
        <h3 class="text-base font-extrabold text-slate-200 mb-1 flex items-center gap-2">🛒 Price Comparison · All Storefronts</h3>
        <p class="text-xs text-slate-500 mb-3">Every merchant we track for this title — transparent prices, no mystery links.</p>
        ${editionsHTML}
      </div>
    </div>
  </div>`;
}

// Accessible focus management for overlays: on open, remember what was focused
// and move focus inside; trap Tab within the overlay; on close, restore focus to
// the opener. Stack-based so nested overlays (panel → game detail) unwind cleanly.
const FocusManager = {
  _stack: [],
  _focusable(root) {
    return [...root.querySelectorAll(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),video[controls],[tabindex]:not([tabindex="-1"])'
    )].filter(el => el.getClientRects().length > 0);
  },
  activate(container) {
    if (!container) return;
    const entry = { container, restore: document.activeElement, handler: null };
    entry.handler = (e) => {
      if (e.key !== 'Tab') return;
      const items = this._focusable(container);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1], active = document.activeElement;
      if (e.shiftKey && (active === first || !container.contains(active))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !container.contains(active))) { e.preventDefault(); first.focus(); }
    };
    container.addEventListener('keydown', entry.handler);
    this._stack.push(entry);
    const f = this._focusable(container);
    (f[0] || container).focus({ preventScroll: true });
  },
  deactivate(container) {
    let idx = -1;
    for (let i = this._stack.length - 1; i >= 0; i--) {
      if (!container || this._stack[i].container === container) { idx = i; break; }
    }
    if (idx < 0) return;
    const entry = this._stack.splice(idx, 1)[0];
    entry.container.removeEventListener('keydown', entry.handler);
    try { entry.restore?.focus?.({ preventScroll: true }); } catch { /* opener gone */ }
  },
};

function openDetail(id) {
  const deal = findDeal(id);
  if (!deal) return;
  State.activeDetail = id;
  ensureModalHistory();
  const modal = $('#game-detail-modal');
  const content = $('#detailContent');
  content.innerHTML = renderDetail(deal);
  content.scrollTop = 0;
  modal.classList.remove('hidden-init');
  void modal.offsetWidth;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  updateBackToCatalog();
  FocusManager.activate(modal);   // trap focus + remember opener for restore
  enrichDetail(deal);
  loadHistoricalLow(deal);
}

function closeDetail() {
  const modal = $('#game-detail-modal');
  if (modal.classList.contains('hidden-init')) return;
  modal.classList.remove('open');
  const otherPanelOpen = $$('[data-overlay]').some(o => !o.classList.contains('hidden-init'));
  document.body.style.overflow = otherPanelOpen ? 'hidden' : '';
  setTimeout(() => { modal.classList.add('hidden-init'); updateBackToCatalog(); }, 300);
  State.activeDetail = null;
  // Return focus to whatever opened the modal (e.g. the game card).
  FocusManager.deactivate(modal);
}

// Refresh the open modal in place (preserving scroll) after a fav/own toggle.
function refreshDetailIfOpen(id) {
  if (State.activeDetail !== id) return;
  const deal = findDeal(id);
  if (!deal) return;
  const content = $('#detailContent');
  const y = content.scrollTop;
  content.innerHTML = renderDetail(deal);
  content.scrollTop = y;
  enrichDetail(deal); // cache hit = instant, no refetch
  loadHistoricalLow(deal);
}

/* ---- Metadata enrichment ------------------------------------------------
 * Primary source is KEYLESS: Steam's public store `appdetails` endpoint,
 * tunnelled through the same CORS-proxy array the importer uses. It returns
 * real screenshots, official trailers + gameplay videos, a description and the
 * studios — for any title we can resolve a Steam appID for. RAWG stays as an
 * optional augment when a free key is pasted above. Result is cached per base
 * title so re-opening a game (or a sibling edition) is instant.
 * ----------------------------------------------------------------------- */

const _https = (u = '') => u.replace(/^http:\/\//i, 'https://');

// Resolve a Steam appID from every keyless signal we already hold, escalating
// to a CheapShark title search only if the cheaper local lookups miss.
async function resolveSteamAppId(deal) {
  if (deal.steamAppID) return deal.steamAppID;
  const fromImg = (deal.imgs || [])
    .map(u => /steam\/apps\/(\d+)/.exec(u || ''))
    .find(Boolean);
  if (fromImg) return fromImg[1];
  const mapped = STEAM_APPID[_atlasNorm(cleanTitleForSearch(deal.title))]
    || STEAM_APPID[_atlasNorm(deal.title)];
  if (mapped) return mapped;
  try { return await ImageHarvester.findAppId(deal.title); }
  catch { return null; }
}

// Keyless Steam appdetails → normalized meta (screenshots + movies + text).
async function fetchSteamMeta(appid) {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&l=english`;
  // Only accept a proxy response that is genuine appdetails JSON for this appid —
  // otherwise fall through to the next proxy instead of failing on a junk page.
  const ok = (b) => { try { const d = JSON.parse(b); return !!(d && d[appid] && d[appid].success); } catch { return false; } };
  const body = await fetchViaProxyText(url, ok);
  const json = JSON.parse(body);
  const entry = json[appid] || json[String(appid)];
  if (!entry || !entry.success || !entry.data) return null;
  const d = entry.data;
  const screenshots = (d.screenshots || []).map(s => _https(s.path_full)).filter(Boolean);
  const movies = (d.movies || []).map(m => {
    let mp4 = _https(m.mp4?.max || m.mp4?.['480'] || '');
    let webm = _https(m.webm?.max || m.webm?.['480'] || '');
    // Steam migrated store trailers to adaptive manifests (dash_h264/hls_h264) and
    // dropped the mp4/webm fields, so those come back empty now. The direct files
    // still live at a derivable path, so rebuild the mp4 from the movie id — a plain
    // <video> plays it with no streaming lib (verified: it returns video/mp4).
    if (!mp4 && !webm && m.id) {
      mp4 = `https://video.akamai.steamstatic.com/store_trailers/${m.id}/movie_max.mp4`;
    }
    return { name: m.name || 'Video', poster: _https(m.thumbnail || ''),
             src: mp4 || webm, type: mp4 ? 'video/mp4' : 'video/webm' };
  }).filter(m => m.src);
  return {
    name: d.name,
    background: _https(d.header_image || d.background_raw || '') || null,
    screenshots,
    movies,
    description: (d.short_description || '').replace(/<[^>]+>/g, '').trim(),
    developers: d.developers || [],
    publishers: d.publishers || [],
  };
}

// Fold an optional RAWG payload into an existing (Steam) meta, filling gaps.
function mergeMeta(a, b) {
  if (!a) a = {};
  if (!b) return a;
  const uniq = arr => [...new Set(arr.filter(Boolean))];
  const bMovies = b.trailer
    ? [{ name: 'Trailer', poster: b.trailerPoster || null, src: b.trailer, type: 'video/mp4' }]
    : [];
  return {
    name: a.name || b.name,
    background: a.background || b.background || null,
    screenshots: uniq([...(a.screenshots || []), ...(b.screenshots || [])]),
    movies: (a.movies && a.movies.length) ? a.movies : bMovies,
    description: (b.description && b.description.length > (a.description || '').length)
      ? b.description : (a.description || b.description || ''),
    developers: uniq([...(a.developers || []), ...(b.developers || [])]),
    publishers: uniq([...(a.publishers || []), ...(b.publishers || [])]),
  };
}

async function fetchRawgMeta(title) {
  // Route RAWG through our Pages Function so the key stays server-side. A 501
  // (secret not set) makes the first fetch !ok -> we throw -> caller falls back.
  const rawg = (path) => '/api/rawg?url=' + encodeURIComponent('https://api.rawg.io/api/' + path);
  const s = await fetch(rawg(`games?search=${encodeURIComponent(title)}&page_size=1`));
  if (!s.ok) throw new Error('RAWG search ' + s.status);
  const g = (await s.json()).results?.[0];
  if (!g) return null;
  const meta = {
    name: g.name,
    background: g.background_image || null,
    screenshots: (g.short_screenshots || []).map(x => x.image).filter(Boolean),
  };
  try {
    const d = await fetch(rawg(`games/${g.id}`));
    if (d.ok) {
      const dj = await d.json();
      meta.description = dj.description_raw || '';
      meta.developers = (dj.developers || []).map(x => x.name);
      meta.publishers = (dj.publishers || []).map(x => x.name);
      meta.background = meta.background || dj.background_image;
    }
  } catch { /* details optional */ }
  try {
    const m = await fetch(rawg(`games/${g.id}/movies`));
    if (m.ok) {
      const mv = (await m.json()).results?.[0];
      if (mv) { meta.trailer = mv.data?.max || mv.data?.['480'] || null; meta.trailerPoster = mv.preview || null; }
    }
  } catch { /* movies optional */ }
  return meta;
}

async function enrichDetail(deal) {
  const base = baseTitle(deal.title);
  const cached = State.meta[base];
  if (cached) { applyMeta(deal, cached); ensureDetailCover(deal, cached); finalizeShots(deal); return; }

  // Make sure the modal's key-art panel never stays blank, even before metadata
  // resolves (console exclusives whose card art hadn't been harvested yet).
  ensureDetailCover(deal, null);

  let meta = null;
  // Keyless primary source: Steam appdetails (screenshots + trailer + gameplay).
  try {
    const appid = await resolveSteamAppId(deal);
    if (appid) meta = await fetchSteamMeta(appid);
  } catch (e) { console.warn('[Steam meta] enrichment failed:', e.message); }

  // Fill gaps from RAWG (key injected server-side by /api/rawg): the media source
  // for console exclusives that aren't on Steam (screenshots + a trailer). Only
  // call it when Steam left the view short, to keep RAWG usage light. If the
  // RAWG_API_KEY secret isn't set, /api/rawg returns 501 and this no-ops cleanly.
  const needsMedia = !meta || !(meta.screenshots && meta.screenshots.length) || !(meta.movies && meta.movies.length);
  if (needsMedia) {
    try {
      const r = await fetchRawgMeta(deal.title);
      if (r) meta = mergeMeta(meta, r);
    } catch (e) { console.warn('[RAWG] enrichment failed:', e.message); }
  }

  if (meta) {
    State.meta[base] = meta;
    saveJSON(STORAGE.meta, State.meta);
    applyMeta(deal, meta);
    ensureDetailCover(deal, meta);
  }
  finalizeShots(deal); // fill key-art fallback if no live screenshots resolved
}

// Guarantee the detail modal shows real key art: reuse the deal's cover, fall
// back to the fetched background, else harvest one (atlas → Steam → Wikipedia).
async function ensureDetailCover(deal, meta) {
  if (State.activeDetail !== deal.id) return;
  let box = document.getElementById('detailCover');
  if (!box || box.querySelector('img')) return; // already showing real art
  let url = coverOf(deal) || (meta && meta.background) || null;
  if (!url) { try { url = await ImageHarvester.resolve(deal.title); } catch { /* keep initials */ } }
  if (!url || State.activeDetail !== deal.id) return;
  box = document.getElementById('detailCover');
  if (!box || box.querySelector('img')) return;
  const cat = categoryMeta(deal.category);
  box.innerHTML =
    `<img src="${escapeHtml(url)}" alt="${escapeHtml(deal.title)} key art" class="w-full h-full object-cover"
       onerror="this.onerror=null;this.src='${placeholderCover(deal.title, cat.accent)}'">`;
  // Feed it back so the grid card + splash pick up the same art.
  if (Array.isArray(deal.imgs) && !deal.imgs.includes(url)) deal.imgs.push(url);
}

// Apply fetched/cached metadata: upgrade art everywhere + fill modal sections.
function applyMeta(deal, meta) {
  // Upgrade stored art + the grid card (works even if it was a text fallback).
  if (meta.background && Array.isArray(deal.imgs) && !deal.imgs.includes(meta.background)) {
    deal.imgs.unshift(meta.background);
    const card = document.querySelector(`.deal-card[data-id="${deal.id}"]`);
    if (card) card.outerHTML = cardHTML(deal);
  }

  if (State.activeDetail !== deal.id) return; // modal moved on; art upgrade still applied

  if (meta.description) {
    const el = $('#detailDesc');
    if (el) el.textContent = meta.description.length > 900 ? meta.description.slice(0, 900) + '…' : meta.description;
  }
  const studios = [...(meta.developers || []), ...(meta.publishers || [])];
  if (studios.length) {
    const el = $('#detailStudios');
    if (el) el.insertAdjacentHTML('beforeend',
      [...new Set(studios)].slice(0, 4).map(s => `<span class="px-2 py-0.5 rounded-full border border-nexus-border">🎮 ${escapeHtml(s)}</span>`).join(''));
  }
  if (meta.screenshots && meta.screenshots.length) {
    const el = $('#detailShots');
    // Drop any shot identical to the cover so the strip is all gameplay.
    const cover = coverOf(deal);
    const shots = [...new Set(meta.screenshots.filter(s => s && s !== cover))];
    if (el && shots.length) el.innerHTML = shotsMarkup(shots);
  }
  // Trailer + gameplay clips. Steam's `movies` array leads with the official
  // trailer/highlight, followed by gameplay reveals; RAWG contributes a single
  // trailer. Render the lead full-width and the rest as a scrollable strip.
  const movies = meta.movies && meta.movies.length
    ? meta.movies
    : (meta.trailer ? [{ name: 'Trailer', poster: meta.trailerPoster || null, src: meta.trailer, type: 'video/mp4' }] : []);
  if (movies.length) {
    const el = $('#detailTrailer');
    if (el) {
      const lead = movies[0];
      const rest = movies.slice(1);
      el.classList.remove('hidden');
      el.innerHTML = `
        <h3 class="text-sm font-bold text-slate-300 mb-2">🎬 Trailer &amp; Gameplay</h3>
        ${videoBlock(lead, true)}
        ${rest.length ? `<div class="flex gap-4 overflow-x-auto no-scrollbar pb-2 mt-4">
          ${rest.map(m => videoBlock(m, false)).join('')}
        </div>` : ''}`;
    }
  }
}

// One trailer/gameplay clip: a click-to-play video with a big play overlay (so it
// reads unmistakably as a video, not a screenshot) and the clip's Steam title as
// a caption. `lead` renders full-width; the rest render as compact strip cards.
function videoBlock(m, lead) {
  const frame = lead
    ? 'w-full max-w-2xl aspect-video'
    : 'w-72 aspect-video shrink-0';
  const label = escapeHtml(m.name || (lead ? 'Trailer' : 'Gameplay'));
  return `
    <figure class="m-0 ${lead ? '' : 'shrink-0'}">
      <div class="video-wrap relative ${frame} rounded-xl overflow-hidden border border-nexus-border bg-black">
        <video playsinline controls preload="none" ${m.poster ? `poster="${escapeHtml(m.poster)}"` : ''}
          class="w-full h-full object-cover"
          onplay="this.closest('.video-wrap').querySelector('.play-ov')?.remove()">
          <source src="${escapeHtml(m.src)}" type="${escapeHtml(m.type || 'video/mp4')}">
        </video>
        <button type="button" class="play-ov absolute inset-0 flex items-center justify-center bg-black/25 hover:bg-black/10 transition group"
          aria-label="Play ${label}"
          onclick="const v=this.closest('.video-wrap').querySelector('video'); v.play(); this.remove();">
          <span class="grid place-items-center rounded-full bg-black/60 backdrop-blur text-white shadow-glow-soft group-hover:scale-110 transition
                       ${lead ? 'w-16 h-16 text-2xl' : 'w-11 h-11 text-lg'}">▶</span>
        </button>
      </div>
      <figcaption class="text-xs text-slate-400 mt-1.5 ${lead ? '' : 'w-72 truncate'}">${label}</figcaption>
    </figure>`;
}

/* ---- Historical lowest-price lookup (CheapShark game lookup) ---- */
// Resolve a CheapShark gameID for a deal (from the deal, or by title search).
async function resolveGameID(deal) {
  if (deal.gameID) return deal.gameID;
  const results = await NexusDataEngine.searchGames(deal.title).catch(() => []);
  const match = results.find(r => normTitle(r.title) === normTitle(deal.title)) || results[0];
  return match ? match.gameID : null;
}

// NOTE: correct endpoint is /api/1.0/games?id=<gameID> (not `cheapshark.com{gameID}`).
// Returns { cheapestPriceEver:{price,date}, deals:[{storeID,price,...}] }.
async function fetchHistoricalLow(deal) {
  const cacheKey = deal.gameID || normTitle(deal.title);
  if (State.histCache[cacheKey]) return State.histCache[cacheKey];
  const gameID = await resolveGameID(deal);
  if (!gameID) return null;
  const res = await fetch(`https://www.cheapshark.com/api/1.0/games?id=${encodeURIComponent(gameID)}`);
  if (!res.ok) throw new Error('game lookup ' + res.status);
  const j = await res.json();
  const low = j.cheapestPriceEver;
  if (!low || low.price == null) return null;
  // cheapestPriceEver has no storeID, so we surface the store of the current
  // cheapest live deal as the reference storefront.
  let store = '';
  if (Array.isArray(j.deals) && j.deals.length) {
    const cheapest = j.deals.reduce((a, b) => (Number(b.price) < Number(a.price) ? b : a));
    store = CHEAPSHARK_STORES[Number(cheapest.storeID)] || '';
  }
  const out = { price: Number(low.price), date: low.date ? Number(low.date) * 1000 : null, store };
  State.histCache[cacheKey] = out;
  return out;
}

async function loadHistoricalLow(deal) {
  const el = $('#detailHistLow');
  if (!el) return;
  el.innerHTML = `<span class="text-slate-500">🛒 Checking all-time historical low…</span>`;
  try {
    const low = await fetchHistoricalLow(deal);
    if (State.activeDetail !== deal.id) return;
    if (!low) { el.innerHTML = ''; return; }
    const dateStr = low.date ? new Date(low.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
    const storeStr = low.store ? ` (seen on ${escapeHtml(low.store)})` : '';
    el.innerHTML = `
      <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-400/10 border border-amber-400/40 text-amber-300 font-semibold">
        🛒 All-Time Historical Low: <span class="text-amber-200 font-extrabold">${money(low.price)}</span>${storeStr}${dateStr ? ` · <span class="text-slate-400 font-normal">${dateStr}</span>` : ''}
      </span>`;
  } catch (e) {
    if (State.activeDetail === deal.id) el.innerHTML = '';
    console.warn('[historical-low] failed:', e.message);
  }
}

function resetFilters() {
  State.filters.systems = new Set(SYSTEMS.map(s => s.id));
  State.filters.freeOnly = false;
  State.filters.minDiscount = 0;
  State.filters.search = '';
  Object.keys(State.filters.subFilter).forEach(k => State.filters.subFilter[k] = 'all');
  Object.values(State.filters.storeFilter).forEach(set => set.clear());
  State.searchResults = [];                       // flush encyclopedia results
  const free = $('#toggleFreeOnly');
  free.dataset.active = 'false'; free.style.opacity = '';
  const md = $('#minDiscountFilter'); if (md) md.value = '0';
  $('#searchInput').value = '';
  $('#searchInputMobile').value = '';
  const csi = $('#consoleSearchInput'); if (csi) { csi.value = ''; renderConsoleResults(''); }
  if (anyOverlayOpen()) requestCloseOverlays();    // return to the main catalog
  renderSystemFilters();
  renderAll();
  window.scrollTo({ top: 0, behavior: 'smooth' }); // reset viewport to page 0
  toast('Engine filters reset · main catalog restored', 'ok');
}

/* --------------------------------------------------------------------------
 * 10. PANELS
 * ------------------------------------------------------------------------ */

function openPanel(name) {
  const overlay = $(`[data-overlay="${name}"]`);
  if (!overlay) return;
  ensureModalHistory();
  overlay.classList.remove('hidden-init');
  void overlay.offsetWidth;
  $('[data-backdrop]', overlay).style.opacity = '1';
  $('.panel', overlay).classList.add('open');
  document.body.style.overflow = 'hidden';
  if (name === 'favorites') renderFavorites();
  if (name === 'library') { renderLibrary(); renderLibraryExtras(); }
  if (name === 'admin') renderAdminList();
  updateBackToCatalog();
  FocusManager.activate($('.panel', overlay));
}

function closePanel(overlay) {
  FocusManager.deactivate($('.panel', overlay));
  $('[data-backdrop]', overlay).style.opacity = '0';
  $('.panel', overlay).classList.remove('open');
  document.body.style.overflow = '';
  setTimeout(() => { overlay.classList.add('hidden-init'); updateBackToCatalog(); }, 320);
}

/* --------------------------------------------------------------------------
 * 11. EVENT WIRING (delegation)
 * ------------------------------------------------------------------------ */

function wireEvents() {
  $$('[data-open]').forEach(btn => btn.addEventListener('click', () => openPanel(btn.dataset.open)));

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]') || e.target.closest('[data-backdrop]')) { requestCloseOverlays(); return; }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && anyOverlayOpen()) requestCloseOverlays();
  });

  document.addEventListener('click', (e) => {
    // Autocomplete: pick a suggestion, or hide the box when clicking outside it.
    const suggest = e.target.closest('[data-suggest-title]');
    if (suggest) { pickSuggestion(suggest); return; }
    if (!e.target.closest('#search-suggestions') && e.target.id !== 'ownedTitleInput') hideSuggestions();

    // Back to Main Catalog control.
    if (e.target.closest('#backToCatalog')) { backToCatalog(); return; }

    const favBtn = e.target.closest('[data-fav]');
    if (favBtn) { toggleFavorite(favBtn.dataset.fav); return; }
    const ownBtn = e.target.closest('[data-own]');
    if (ownBtn) { toggleOwned(ownBtn.dataset.own); return; }
    const sysBtn = e.target.closest('[data-system]');
    if (sysBtn) { toggleSystem(sysBtn.dataset.system); return; }
    const favFilter = e.target.closest('[data-favfilter]');
    if (favFilter) { State.filters.favPlatform = favFilter.dataset.favfilter; renderFavorites(); return; }
    const libRemove = e.target.closest('[data-lib-remove]');
    if (libRemove) {
      State.library = State.library.filter(g => g.id !== libRemove.dataset.libRemove);
      State.persist(); renderLibrary(); renderAll(); return;
    }
    const dlcAddBtn = e.target.closest('[data-dlc-add-btn]');
    if (dlcAddBtn) { addDlc(dlcAddBtn.dataset.dlcAddBtn); return; }
    const manualRemove = e.target.closest('[data-manual-remove]');
    if (manualRemove) {
      State.manual = State.manual.filter(m => m.id !== manualRemove.dataset.manualRemove);
      State.persist(); renderAdminList(); renderAll(); toast('Manual deal removed', 'info'); return;
    }
    const loadMoreBtn = e.target.closest('#loadMoreBtn');
    if (loadMoreBtn) { loadMore(); return; }

    // Library extensions: co-op sync + steam import.
    if (e.target.closest('#genSyncBtn')) { handleGenSync(); return; }
    if (e.target.closest('#copySyncBtn')) { handleCopySync(); return; }
    if (e.target.closest('#compareCoopBtn')) { handleCompareCoop(); return; }
    if (e.target.closest('#saveCoopBtn')) { handleSaveCoopGroup(); return; }
    if (e.target.closest('#dlcScanBtn')) { runScanDlc(); return; }
    if (e.target.closest('#dlcClose')) { const el = $('#dlcResults'); if (el) { el.classList.add('hidden'); el.innerHTML = ''; } return; }
    const dlcWish = e.target.closest('[data-dlc-wish]');
    if (dlcWish) { wishlistDlc(dlcWish.dataset.dlcWish); return; }
    const dlcOwn = e.target.closest('[data-dlc-own]');
    if (dlcOwn) { const [gid, nm] = dlcOwn.dataset.dlcOwn.split('::'); ownDlc(gid, decodeURIComponent(nm)); return; }
    const dlcGame = e.target.closest('[data-dlc-game]');
    if (dlcGame) { showDlcForGame(dlcGame.dataset.dlcGame); return; }
    const coopLoad = e.target.closest('[data-coop-load]');
    if (coopLoad) { handleLoadCoopGroup(coopLoad.dataset.coopLoad); return; }
    const coopDel = e.target.closest('[data-coop-del]');
    if (coopDel) { handleDeleteCoopGroup(coopDel.dataset.coopDel); return; }
    if (e.target.closest('#steamImportBtn') || e.target.closest('#steamSyncRetry')) { handleSteamImport(); return; }
    if (e.target.closest('#steamDiagBtn')) { testSteamConnection(); return; }

    // Detail modal close (back button or backdrop click).
    if (e.target.closest('[data-detail-close]') || e.target.closest('[data-detail-backdrop]')) { requestCloseOverlays(); return; }

    // Card click -> open the game detail modal (after fav/own already returned).
    const card = e.target.closest('.deal-card');
    if (card && card.dataset.id) { openDetail(card.dataset.id); return; }
  });

  // Change events: DLC checkboxes + per-section sub-filters.
  document.addEventListener('change', (e) => {
    const chk = e.target.closest('[data-dlc]');
    if (chk) {
      const game = State.library.find(g => g.id === chk.dataset.dlc);
      if (game && game.dlc[chk.dataset.dlcIdx]) {
        game.dlc[chk.dataset.dlcIdx].owned = chk.checked;
        State.persist(); renderLibrary();
      }
      return;
    }
    if (e.target.id === 'minDiscountFilter') {
      State.filters.minDiscount = Number(e.target.value) || 0;
      renderAll();
      return;
    }
    const sf = e.target.closest('[data-subfilter]');
    if (sf) {
      State.filters.subFilter[sf.dataset.subfilter] = sf.value;
      renderSections();
      return;
    }
    const sc = e.target.closest('[data-store-check]');
    if (sc) {
      const set = State.filters.storeFilter[sc.dataset.storeCheck];
      if (sc.checked) set.add(sc.value); else set.delete(sc.value);
      renderSections();
      return;
    }
    // Console "Search & Checkmark" bulk-add toggle.
    const ca = e.target.closest('[data-console-add]');
    if (ca) {
      if (ca.checked) addOwnedGame(ca.dataset.consoleAdd, systemToPlatform(ca.dataset.consoleSys));
      else removeOwnedByTitle(ca.dataset.consoleAdd);
      State.persist();
      renderLibrary(); renderAll(); renderCoopResults();
      const label = ca.closest('label')?.querySelector('span');
      if (label) label.className = `text-sm truncate ${ca.checked ? 'text-nexus-cyan' : 'text-slate-300'}`;
      return;
    }
  });

  // Delegated inputs living in dynamic panels: console search + owned-title autocomplete.
  document.addEventListener('input', (e) => {
    if (e.target.id === 'consoleSearchInput') renderConsoleResults(e.target.value);
    if (e.target.id === 'ownedTitleInput') onOwnedTitleInput(e.target.value);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-dlc-add]')) { e.preventDefault(); addDlc(e.target.dataset.dlcAdd); return; }
    // Keyboard activation for focusable game cards (Enter or Space opens detail).
    // Ignore when the focus is on an inner control (fav/own buttons, links).
    if ((e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar')) {
      const card = e.target.closest?.('.deal-card');
      if (card && card === e.target && card.dataset.id) { e.preventDefault(); openDetail(card.dataset.id); }
    }
  });

  $('#toggleFreeOnly').addEventListener('click', (e) => {
    State.filters.freeOnly = !State.filters.freeOnly;
    e.currentTarget.dataset.active = String(State.filters.freeOnly);
    e.currentTarget.style.opacity = State.filters.freeOnly ? '1' : '';
    renderAll();
  });
  $('#clearFilters').addEventListener('click', resetFilters);
  $('#resetAllBtn')?.addEventListener('click', resetFilters);

  let searchTimer, encTimer;
  const onSearch = (val) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const q = val.trim().toLowerCase();
      State.filters.search = q;
      if (q.length < 3) State.searchResults = [];   // clear stale encyclopedia hits
      renderAll();
      clearTimeout(encTimer);
      if (q.length >= 3) encTimer = setTimeout(() => runEncyclopediaSearch(val.trim()), 320);
    }, 180);
  };
  $('#searchInput').addEventListener('input', (e) => { $('#searchInputMobile').value = e.target.value; onSearch(e.target.value); });
  $('#searchInputMobile').addEventListener('input', (e) => { $('#searchInput').value = e.target.value; onSearch(e.target.value); });

  $('#refreshBtn').addEventListener('click', () => boot(true));

  $('#ownedForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const title = (fd.get('title') || '').trim();
    if (!title) return;
    const dlcRaw = (fd.get('dlc') || '').trim();
    const dlc = dlcRaw ? dlcRaw.split(',').map(s => s.trim()).filter(Boolean).map(name => ({ name, owned: true })) : [];
    // Verified metadata captured from a clicked suggestion (authentic cover + ID).
    const titleInput = $('#ownedTitleInput');
    const appid = titleInput?.dataset.appid || '';
    const gameID = titleInput?.dataset.gameid || '';
    const imgs = appid ? [`https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`] : [];
    State.library.push({ id: uid(), title, platform: fd.get('platform') || 'PC', dlc, owned: true, imgs, appid: appid || undefined, gameID: gameID || undefined });
    State.persist();
    e.target.reset();
    if (titleInput) { titleInput.dataset.appid = ''; titleInput.dataset.gameid = ''; }
    hideSuggestions();
    renderLibrary(); renderAll();
    toast(`"${title}" added to library`, 'ok');
  });

  $('#adminForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const title = (fd.get('title') || '').trim();
    if (!title) return;
    const category = fd.get('category') || 'pc';
    const catSystems = categoryMeta(category).systems;
    const tags = (fd.get('tags') || '').split(',').map(s => s.trim()).filter(Boolean);
    const retail = parseFloat(fd.get('retail')) || 0;
    const sale = fd.get('sale') === '' ? retail : (parseFloat(fd.get('sale')) || 0);
    const img = (fd.get('img') || '').trim();
    const deal = {
      id: uid(), category, system: catSystems[0], title,
      tags: tags.length ? tags : [systemMeta(catSystems[0]).tag],
      store: 'Manual Entry', retail, sale,
      imgs: img ? [img] : [], url: (fd.get('url') || '').trim() || '#', source: 'manual',
    };
    State.manual.unshift(deal);
    State.persist();
    e.target.reset();
    renderAdminList(); renderAll();
    toast(`Deal "${title}" injected`, 'ok');
  });
}

function toggleSystem(id) {
  const set = State.filters.systems;
  if (set.has(id)) {
    if (set.size > 1) set.delete(id);
    else { toast('At least one system must stay on', 'warn'); return; }
  } else {
    set.add(id);
  }
  renderSystemFilters();
  renderAll();
}

function addDlc(gameId) {
  const input = $(`[data-dlc-add="${gameId}"]`);
  if (!input) return;
  const name = input.value.trim();
  if (!name) return;
  const game = State.library.find(g => g.id === gameId);
  if (!game) return;
  game.dlc = game.dlc || [];
  game.dlc.push({ name, owned: true });
  State.persist();
  renderLibrary();
}

/* --------------------------------------------------------------------------
 * 11.5 LIBRARY EXTENSIONS  (console search · Steam import · co-op sync)
 * ------------------------------------------------------------------------ */

const normTitle = (t = '') => t.toLowerCase().replace(/\s+/g, ' ').trim();

function ownedTitleSet() { return new Set(State.library.map(g => normTitle(g.title))); }

function addOwnedGame(title, platform = 'PC', opts = {}) {
  const n = normTitle(title);
  if (!n || State.library.some(g => normTitle(g.title) === n)) return false;
  const entry = { id: uid(), title: title.trim(), platform, dlc: [], owned: true };
  // Steam import now carries a real appID -> attach authentic vertical cover art.
  if (opts.appid) {
    entry.appid = String(opts.appid);
    entry.imgs = [`https://cdn.cloudflare.steamstatic.com/steam/apps/${opts.appid}/library_600x900.jpg`];
  }
  State.library.push(entry);
  return true;
}
function removeOwnedByTitle(title) {
  const n = normTitle(title);
  const before = State.library.length;
  State.library = State.library.filter(g => normTitle(g.title) !== n);
  return State.library.length < before;
}

/* ---- Console "Search & Checkmark" registry (from the mock catalogue) ---- */
const CONSOLE_LIBRARY = (() => {
  const seen = new Set(); const out = [];
  MOCK_DEALS.filter(d => ['playstation', 'xbox', 'nintendo'].includes(d.category)).forEach(d => {
    const n = normTitle(d.title);
    if (seen.has(n)) return; seen.add(n);
    out.push({ title: d.title, system: d.system });
  });
  return out.sort((a, b) => a.title.localeCompare(b.title));
})();

function renderConsoleResults(query = '') {
  const host = $('#consoleSearchResults');
  if (!host) return;
  const q = normTitle(query);
  const owned = ownedTitleSet();
  const list = CONSOLE_LIBRARY.filter(g => !q || normTitle(g.title).includes(q));
  if (!list.length) {
    host.innerHTML = `<p class="text-xs text-slate-500 py-3">No console titles match “${escapeHtml(query)}”.</p>`;
    return;
  }
  host.innerHTML = list.map(g => {
    const on = owned.has(normTitle(g.title));
    const sys = systemMeta(g.system);
    return `
      <label class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-nexus-card cursor-pointer">
        <input type="checkbox" data-console-add="${escapeHtml(g.title)}" data-console-sys="${g.system}" ${on ? 'checked' : ''} class="w-4 h-4 shrink-0" style="accent-color:${sys.color}">
        <span class="text-sm truncate ${on ? 'text-nexus-cyan' : 'text-slate-300'}">${escapeHtml(g.title)}</span>
        <span class="ml-auto text-[10px] shrink-0" style="color:${sys.color}">${sys.emoji} ${escapeHtml(sys.label)}</span>
      </label>`;
  }).join('');
}

/* ---- Steam public-library importer ---- */
function parseSteamId(input) {
  const v = (input || '').trim();
  let m;
  if (/^\d{17}$/.test(v)) return { type: 'id', id: v };
  if ((m = v.match(/steamcommunity\.com\/profiles\/(\d{17})/))) return { type: 'id', id: m[1] };
  if ((m = v.match(/steamcommunity\.com\/id\/([^\/\s?#]+)/))) return { type: 'vanity', vanity: m[1] };
  if (/^[A-Za-z0-9_.-]{2,32}$/.test(v)) return { type: 'vanity', vanity: v };
  return null;
}

// Steam's Web API sends no CORS headers, so we tunnel through free public proxies.
// Fail-safe ARRAY: tried sequentially — a 403 / timeout / error on one rolls to the
// next, so no single proxy is a point of failure. (Corrected endpoint forms:
// allorigins.win -> api.allorigins.win/get, corsproxy.io -> /?url=, freeboard.io ->
// thingproxy.freeboard.io/fetch.)
const CORS_PROXIES = [
  // Our OWN Cloudflare Pages Function — same-origin, reliable, no third party.
  // On the deployed site this resolves and always works; on local/other hosts it
  // 404s and we fall through to the public proxies below.
  (u) => `/api/steam?url=${encodeURIComponent(u)}`,                     // raw body
  (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`, // raw body
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,          // raw body
  (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`, // wraps body in .contents
  (u) => `https://thingproxy.freeboard.io/fetch/${u}`,                  // raw body
];
const PROXY_TIMEOUT_MS = 8000;

// Fetch a public Steam page/XML through the proxy array, returning the raw body
// text. AllOrigins nests the body as a JSON string under `.contents`; corsproxy.io
// and thingproxy return it raw. Any 403/timeout rolls to the next proxy.
async function fetchViaProxyText(targetUrl, validate) {
  let lastErr;
  for (let i = 0; i < CORS_PROXIES.length; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
    try {
      const res = await fetch(CORS_PROXIES[i](targetUrl), { signal: controller.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const raw = await res.text();
      let body = raw;
      try { const j = JSON.parse(raw); if (j && typeof j.contents === 'string') body = j.contents; } catch { /* already raw */ }
      if (!body) throw new Error('empty payload');
      // A proxy can answer 200 with a junk/error page. If the caller gave a
      // validator and the body doesn't pass, treat it as a miss and roll on.
      if (validate && !validate(body)) throw new Error('unusable payload');
      return body;
    } catch (e) {
      lastErr = e;
      console.warn(`[Steam import] CORS proxy ${i + 1}/${CORS_PROXIES.length} failed (${e.message}) — trying next…`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('All CORS proxies are unreachable right now (last: ' + (lastErr?.message || 'unknown') + '). Please try again shortly.');
}

// Human labels for each proxy row in the connection diagnostic.
function proxyLabel(i) {
  return ['Cloudflare function (this site)', 'codetabs.com', 'corsproxy.io', 'allorigins.win', 'thingproxy'][i] || ('proxy ' + (i + 1));
}

// Probe every proxy against a known-good public appdetails call (Team Fortress 2,
// appid 440) and report which ones actually return valid Steam JSON. Lets a user
// see on the LIVE site exactly where the pipeline breaks (e.g. the serverless
// function 404ing = wrong site / failed deploy) instead of a generic failure.
async function testSteamConnection() {
  const out = $('#steamDiagResult');
  if (out) out.innerHTML = '<span class="text-nexus-cyan">⏳ Probing each proxy against Steam (appid 440)…</span>';
  // TF2 (440) has both screenshots and a trailer, so a good response proves the
  // whole media pipeline — including that `movies` survive the proxy hop.
  const testUrl = 'https://store.steampowered.com/api/appdetails?appids=440&l=english';
  const rows = [];
  let anyOk = false, media = null;
  for (let i = 0; i < CORS_PROXIES.length; i++) {
    const t0 = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
    let verdict, ok = false, detail = '';
    try {
      const res = await fetch(CORS_PROXIES[i](testUrl), { signal: controller.signal });
      const raw = await res.text();
      let body = raw;
      try { const j = JSON.parse(raw); if (j && typeof j.contents === 'string') body = j.contents; } catch { /* raw */ }
      try {
        const d = JSON.parse(body);
        ok = !!(d && d['440'] && d['440'].success);
        if (ok && !media) {
          const data = d['440'].data || {};
          media = { movies: (data.movies || []).length, shots: (data.screenshots || []).length };
        }
      } catch { ok = false; }
      if (ok) { verdict = 'OK'; anyOk = true; }
      else if (!res.ok) { verdict = 'HTTP ' + res.status; detail = res.status === 404 ? ' (function not deployed here?)' : ''; }
      else { verdict = 'bad payload'; detail = ' (reachable, but no valid Steam JSON)'; }
    } catch (e) {
      verdict = e.name === 'AbortError' ? 'timeout' : 'blocked/error';
    } finally {
      clearTimeout(timer);
    }
    rows.push({ label: proxyLabel(i), verdict, ok, ms: Date.now() - t0, detail });
  }
  if (!out) return;
  const rowsHTML = rows.map(r =>
    `<div class="flex items-center gap-2 py-0.5">
       <span>${r.ok ? '✅' : '❌'}</span>
       <span class="text-slate-300">${escapeHtml(r.label)}</span>
       <span class="ml-auto ${r.ok ? 'text-nexus-green' : 'text-slate-500'}">${escapeHtml(r.verdict)}${escapeHtml(r.detail)} · ${r.ms}ms</span>
     </div>`).join('');
  const mediaLine = media
    ? `<div class="mt-1 ${media.movies ? 'text-nexus-green' : 'text-amber-400'}">Test game (TF2): ${media.shots} screenshots, ${media.movies} trailer/gameplay clip${media.movies === 1 ? '' : 's'} ${media.movies ? '✓ videos reach the app' : '— Steam returned no video for this probe'}</div>`
    : '';
  const summary = anyOk
    ? `<div class="text-nexus-green font-semibold mt-1">✓ At least one proxy works — screenshots & sync can reach Steam.</div>`
    : `<div class="text-amber-400 font-semibold mt-1">⚠ No proxy could reach Steam. If the Cloudflare-function row is 404, you're on a site without the serverless proxy (use the GitHub-connected deploy), or the last deploy failed.</div>`;
  out.innerHTML = `<div class="rounded-lg border border-nexus-border bg-nexus-bg p-2 mt-1">${rowsHTML}${mediaLine}${summary}</div>`;
}

// Keyless public-profile summary XML -> { steamID64, privacyState }.
function parseSteamProfileXml(xml) {
  const id = /<steamID64>(\d+)<\/steamID64>/.exec(xml);
  const priv = /<privacyState>(.*?)<\/privacyState>/.exec(xml);
  return { steamID64: id ? id[1] : null, privacyState: priv ? priv[1] : null };
}
// Owned-games via the official Steam Web API (IPlayerService/GetOwnedGames),
// routed through OUR Cloudflare function (index 0) which injects the secret key
// server-side. Public CORS proxies can't inject the key, so this must NOT fan out
// across the proxy array. Steam login-gates the old keyless /games/ page, so this
// is the only reliable path. Distinguishes the missing-key / not-deployed cases so
// the UI can explain them instead of a generic failure.
async function fetchOwnedGames(id64) {
  const api = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/`
    + `?steamid=${id64}&include_appinfo=1&include_played_free_games=1&format=json`;
  let res;
  try {
    res = await fetch(CORS_PROXIES[0](api));   // our /api/steam function only
  } catch {
    const e = new Error('Could not reach the Steam sync service.'); e.noFn = true; throw e;
  }
  if (res.status === 404) {
    const e = new Error('Steam sync runs only on the deployed site (the proxy function is not available here).');
    e.noFn = true; throw e;
  }
  if (res.status === 501) {
    const e = new Error('Steam sync isn’t set up yet: the server is missing its Steam API key. Ask the site owner to add the STEAM_API_KEY secret.');
    e.noKey = true; throw e;
  }
  if (!res.ok) throw new Error('Steam Web API error (HTTP ' + res.status + ').');
  let json;
  try { json = JSON.parse(await res.text()); } catch { throw new Error('Steam returned an unreadable response.'); }
  return (json && json.response) || {};
}

// Import: resolve the public profile (vanity or ID64) keylessly, inspect privacy,
// then pull the owned-games list via the keyed Web API.
async function importSteamLibrary(input) {
  const parsed = parseSteamId(input);
  if (!parsed) throw new Error('Unrecognized input — enter a 17-digit SteamID64 or your custom vanity name.');
  const path = parsed.type === 'id' ? `profiles/${parsed.id}` : `id/${encodeURIComponent(parsed.vanity)}`;

  // 1) Keyless profile summary: resolves a vanity name -> SteamID64 and reveals
  //    the privacy state. (Still works anonymously — only the games *list* page is
  //    login-gated, not the profile summary XML.)
  const summaryXml = await fetchViaProxyText(`https://steamcommunity.com/${path}/?xml=1`,
    (b) => /<steamID64>\d+<\/steamID64>/.test(b) || /<privacyState>/.test(b));
  const profile = parseSteamProfileXml(summaryXml);
  if (!profile.steamID64) {
    throw new Error(parsed.type === 'vanity'
      ? `No public Steam profile found for “${parsed.vanity}”. Double-check the vanity name.`
      : 'That SteamID64 did not resolve to a public profile.');
  }
  // 2) Privacy inspector — a non-public profile can never expose its games.
  if (profile.privacyState && profile.privacyState !== 'public') {
    const e = new Error('Profile is private'); e.privacy = true; throw e;
  }

  // 3) Owned games via the official Web API (key injected server-side).
  const resp = await fetchOwnedGames(profile.steamID64);
  const games = Array.isArray(resp.games) ? resp.games : [];
  if (!games.length) {
    // Valid key + public profile but no games array => "Game details" is private
    // (a setting distinct from profile visibility), or the account owns nothing.
    const e = new Error('Games list unavailable'); e.gated = true; throw e;
  }

  let added = 0;
  games.forEach(g => { if (g.name && addOwnedGame(g.name, 'PC', { appid: g.appid })) added++; });
  State.persist();
  renderLibrary(); renderAll(); renderConsoleResults($('#consoleSearchInput')?.value || '');
  return { total: games.length, added };
}

/* ---- Co-op sync codes (serverless friend library sharing) ---- */
function b64urlEncode(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(b) {
  b = b.replace(/-/g, '+').replace(/_/g, '/');
  while (b.length % 4) b += '=';
  return decodeURIComponent(escape(atob(b)));
}
const SYNC_KEY = 'NEXUS';
function encodeSync(titles) {
  const json = JSON.stringify(titles);
  let x = '';
  for (let i = 0; i < json.length; i++) x += String.fromCharCode(json.charCodeAt(i) ^ SYNC_KEY.charCodeAt(i % SYNC_KEY.length));
  return b64urlEncode(x);
}
function decodeSync(code) {
  try {
    let raw = (code || '').trim();
    const m = raw.match(/sync=([^&#\s]+)/);
    if (m) raw = m[1];
    const x = b64urlDecode(raw);
    let json = '';
    for (let i = 0; i < x.length; i++) json += String.fromCharCode(x.charCodeAt(i) ^ SYNC_KEY.charCodeAt(i % SYNC_KEY.length));
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter(t => typeof t === 'string') : null;
  } catch { return null; }
}
function currentSyncCode() { return encodeSync(State.library.map(g => g.title)); }
function syncLink(code) { return `${location.origin}${location.pathname}#sync=${code}`; }

function computeCoopIntersection() {
  // Host library = normalized owned titles (de-duped). We compute a STRICT
  // intersection: repeatedly filter the host set against each friend library so
  // only games present in EVERY library survive. (Never overwrite host w/ client.)
  const hostLibrary = [...new Set(State.library.map(g => normTitle(g.title)))];
  let commonGames = hostLibrary;
  State.coop.friends.forEach(friend => {
    const friendLibrary = friend.titles.map(normTitle);
    commonGames = commonGames.filter(gameId => friendLibrary.includes(gameId));
  });
  const disp = new Map(State.library.map(g => [normTitle(g.title), g.title]));
  return commonGames.map(n => disp.get(n) || n);
}

function coopCardHTML(title) {
  const deal = State.allDeals().find(d => normTitle(d.title) === normTitle(title));
  const isF2P = deal && deal.f2p;
  const onSale = deal && !isF2P && (deal.sale === 0 || deal.discount > 0);
  const cover = deal ? coverOf(deal) : null;
  const media = cover
    ? `<img src="${escapeHtml(cover)}" alt="" class="w-full h-full object-cover" onerror="this.remove()">`
    : `<div class="w-full h-full grid place-items-center text-lg font-black text-slate-600">${escapeHtml(initialsOf(title))}</div>`;
  const tag = isF2P
    ? `<span class="text-[10px] font-bold text-blue-400">🎮 Free-to-Play</span>`
    : onSale
    ? (deal.sale === 0
        ? `<span class="text-[10px] font-bold text-nexus-green">🔥 FREE NOW</span>`
        : `<span class="text-[10px] font-bold text-nexus-green">🔥 -${deal.discount}% · ${money(deal.sale)}</span>`)
    : `<span class="text-[10px] text-slate-500">Owned by all</span>`;
  const link = deal && (isF2P || onSale)
    ? `<a href="${escapeHtml(deal.url)}" target="_blank" rel="noopener noreferrer" class="block mt-1 text-[10px] font-bold text-nexus-cyan hover:underline">${isF2P ? 'Play Free' : 'View Deal'} ↗</a>` : '';
  const border = isF2P ? 'border-blue-500' : onSale ? 'border-nexus-green shadow-glow' : 'border-nexus-border';
  return `
    <div class="rounded-lg bg-nexus-card border ${border} overflow-hidden">
      <div class="aspect-[3/4] bg-nexus-bg">${media}</div>
      <div class="p-2">
        <div class="text-xs font-semibold text-slate-200 truncate" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
        ${tag}${link}
      </div>
    </div>`;
}

function renderCoopResults() {
  const host = $('#coopResults');
  if (!host) return;
  if (!State.coop.friends.length) {
    host.innerHTML = `<p class="text-xs text-slate-500">Paste friend codes above and compare to reveal games everyone owns.</p>`;
    return;
  }

  // Free-to-Play staples are a global reference library — instantly shared by
  // everyone, no ownership or private keys needed.
  const f2pTitles = [...new Map(State.allDeals().filter(d => d.f2p).map(d => [normTitle(d.title), d.title])).values()];
  const f2pHTML = f2pTitles.length ? `
    <div class="mb-5">
      <div class="text-xs font-bold text-blue-400 mb-2 flex items-center gap-1.5">⚡ Immediate Shared Games <span class="font-normal text-slate-500">(Free-to-Play for Everyone)</span></div>
      <div class="grid grid-cols-3 gap-2">${f2pTitles.map(coopCardHTML).join('')}</div>
    </div>` : '';

  const inter = computeCoopIntersection();
  const libs = State.coop.friends.length + 1;
  let ownedHTML;
  if (!inter.length) {
    ownedHTML = `<div class="text-center py-6 px-3 rounded-xl border border-nexus-border bg-nexus-bg text-slate-400 text-sm">
      🙅 No overlapping co-op games detected. Check out current sales to match portfolios!</div>`;
  } else {
    const onSaleCount = inter.filter(t => { const d = State.allDeals().find(x => normTitle(x.title) === normTitle(t)); return d && (d.sale === 0 || d.discount > 0); }).length;
    ownedHTML = `
      <div class="text-xs text-slate-400 mb-2">🎯 <b class="text-slate-200">${inter.length}</b> game${inter.length === 1 ? '' : 's'} owned by all <b class="text-slate-200">${libs}</b> players${onSaleCount ? ` · <span class="text-nexus-green">${onSaleCount} on sale now</span>` : ''}</div>
      <div class="grid grid-cols-3 gap-2">${inter.map(coopCardHTML).join('')}</div>`;
  }

  host.innerHTML = f2pHTML + `<div class="text-xs font-bold text-slate-300 mb-2">🤝 Games You All Own</div>` + ownedHTML;
}

// Build all Library-panel extension sections (called when the panel opens).
function renderLibraryExtras() {
  const host = $('#libExtras');
  if (!host) return;
  host.innerHTML = `
  <details class="lib-section" open>
    <summary>🎮 Console Search &amp; Checkmark</summary>
    <div class="pt-2">
      <p class="text-xs text-slate-500 mb-2">Search PlayStation, Xbox &amp; Nintendo titles and tick everything you own.</p>
      <input id="consoleSearchInput" type="text" placeholder="Type a game title… (e.g. Mario, Halo, God of War)" autocomplete="off"
        class="w-full bg-nexus-bg border border-nexus-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-nexus-cyan" />
      <div id="consoleSearchResults" class="mt-2 max-h-60 overflow-y-auto pr-1"></div>
    </div>
  </details>

  <details class="lib-section">
    <summary>📥 Import Steam Library</summary>
    <div class="pt-2 space-y-2">
      <p class="text-xs text-slate-500">Enter your public SteamID64 <b>or</b> custom vanity name. Your profile's <b>Game Details</b> must be set to Public so Steam will share your games.</p>
      <input id="steamIdInput" type="text" placeholder="76561198… or your vanity name (e.g. gabelogannewell)" autocomplete="off"
        class="w-full bg-nexus-bg border border-nexus-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-nexus-cyan" />
      <button id="steamImportBtn" class="w-full px-3 py-2 rounded-lg bg-gradient-to-r from-nexus-cyan to-nexus-violet text-nexus-bg font-bold text-sm hover:opacity-90 transition">🔄 Sync Library</button>
      <div id="steamImportStatus" class="text-xs text-slate-400 leading-relaxed"></div>
      <div class="flex items-center justify-between">
        <button id="steamDiagBtn" class="text-[11px] text-slate-500 hover:text-nexus-cyan underline decoration-dotted transition">🔧 Test Steam connection</button>
      </div>
      <div id="steamDiagResult" class="text-[11px] leading-relaxed"></div>

      <!-- Automated privacy-protection injector -->
      <div id="steam-privacy-helper" class="hidden rounded-xl border border-amber-500/50 p-3" style="background:#241d08">
        <div class="font-bold text-amber-300 text-sm mb-1">🔒 Sync Unsuccessful — we couldn't read your games list</div>
        <p class="text-xs text-amber-200/80 mb-2">Making your profile public isn't enough: <b>Game details</b> is a <b>separate</b> privacy setting, and it's the one that exposes your games. Set it to Public:</p>
        <ol class="text-xs text-amber-100/90 list-decimal list-inside space-y-1">
          <li>Open Steam → <b>Edit Profile</b> → <b>Privacy Settings</b>.</li>
          <li>Set <b>'My profile'</b> to <b>Public</b>.</li>
          <li>Set <b>'Game details'</b> to <b>Public</b> — <span class="text-amber-300">this is the one that was blocking you.</span></li>
          <li>Wait ~30s for Steam to apply it, then tap <b>'Sync Library'</b> below.</li>
        </ol>
        <p class="text-[11px] text-amber-200/60 mt-2">Already Public and still failing? Make sure the individual games aren't hidden, wait ~30s, and retry — or use <b>Console Search</b> or <b>Add Manually</b> above to build your library instead.</p>
        <button id="steamSyncRetry" class="mt-2 w-full py-2 rounded-lg bg-amber-400 text-nexus-bg font-bold text-xs hover:opacity-90 transition">🔄 Sync Library</button>
      </div>
    </div>
  </details>

  <details class="lib-section">
    <summary>🤝 Co-op Lounge: Play with Friends</summary>
    <div class="pt-2 space-y-4">
      <div>
        <p class="text-xs text-slate-500 mb-2">📤 Share your library — generate a sync code and text the link to friends.</p>
        <button id="genSyncBtn" class="w-full py-2 rounded-lg bg-nexus-bg border border-nexus-border text-sm font-semibold hover:border-nexus-cyan transition">📤 Generate My Sync Code</button>
        <div id="syncCodeWrap" class="hidden mt-2 flex gap-1.5">
          <input id="syncCodeOutput" readonly class="flex-1 bg-nexus-bg border border-nexus-border rounded-lg px-2 py-1.5 text-xs text-slate-300 font-mono" />
          <button id="copySyncBtn" class="shrink-0 px-3 py-1.5 rounded-lg bg-nexus-cyan text-nexus-bg font-bold text-xs hover:opacity-90 transition">Copy Link</button>
        </div>
      </div>
      <div>
        <p class="text-xs text-slate-500 mb-2">📥 Paste up to 4 friend sync codes (one per line):</p>
        <textarea id="coopCodesInput" rows="4" placeholder="paste friend sync codes or links here…"
          class="w-full bg-nexus-bg border border-nexus-border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-nexus-cyan resize-y"></textarea>
        <button id="compareCoopBtn" class="mt-2 w-full py-2 rounded-lg bg-gradient-to-r from-nexus-violet to-nexus-cyan text-nexus-bg font-bold text-sm hover:opacity-90 transition">🎮 Find Games We All Own</button>
      </div>
      <div id="coopResults"></div>

      <div class="pt-1 border-t border-nexus-border">
        <p class="text-xs text-slate-500 mb-2 mt-3">💾 Save this crew so you don't have to paste codes again:</p>
        <div class="flex gap-1.5">
          <input id="coopGroupName" type="text" placeholder="Crew name (e.g. Weekend Squad)" autocomplete="off"
            class="flex-1 bg-nexus-bg border border-nexus-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-nexus-cyan" />
          <button id="saveCoopBtn" class="shrink-0 px-3 py-1.5 rounded-lg bg-nexus-violet text-white font-bold text-xs hover:opacity-90 transition">💾 Save Crew</button>
        </div>
        <div class="mt-2">
          <div class="text-xs font-bold text-slate-300 mb-1.5">🗂️ Saved Crews</div>
          <div id="coopGroups" class="space-y-1.5"></div>
        </div>
      </div>
    </div>
  </details>`;

  renderConsoleResults('');
  renderCoopResults();
  renderCoopGroups();
}

/* ---- Library-extension button handlers ---- */
function handleGenSync() {
  if (!State.library.length) { toast('Add games to your library first', 'warn'); return; }
  const code = currentSyncCode();
  const wrap = $('#syncCodeWrap');
  const out = $('#syncCodeOutput');
  if (out) out.value = syncLink(code);
  if (wrap) wrap.classList.remove('hidden');
  toast('Sync link generated — copy & share it', 'ok');
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove(); return ok;
  } catch { return false; }
}

async function handleCopySync() {
  const out = $('#syncCodeOutput');
  if (!out || !out.value) { handleGenSync(); return; }
  const ok = await copyText(out.value);
  toast(ok ? 'Sync link copied to clipboard 📋' : 'Copy failed — select the link manually', ok ? 'ok' : 'warn');
  out.focus(); out.select();
}

function handleCompareCoop() {
  const ta = $('#coopCodesInput');
  const lines = (ta?.value || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 4);
  if (!lines.length) { toast('Paste at least one friend sync code', 'warn'); return; }
  const friends = [];
  let bad = 0;
  lines.forEach((line, i) => {
    const titles = decodeSync(line);
    if (titles && titles.length) friends.push({ label: `Friend ${i + 1}`, titles });
    else bad++;
  });
  State.coop.friends = friends;
  State.persist();               // keep the comparison across reloads
  renderCoopResults();
  renderCoopGroups();
  if (!friends.length) toast('None of those codes could be read', 'err');
  else toast(`Comparing ${friends.length + 1} libraries${bad ? ` · ${bad} code(s) invalid` : ''}`, bad ? 'warn' : 'ok');
}

/* ---- Saved co-op crews (named, persisted comparison groups) ---- */
function handleSaveCoopGroup() {
  if (!State.coop.friends.length) { toast('Compare at least one friend first, then save the crew', 'warn'); return; }
  const input = $('#coopGroupName');
  const name = (input?.value || '').trim() || `Crew ${(State.coop.groups?.length || 0) + 1}`;
  State.coop.groups = State.coop.groups || [];
  // Snapshot the current friends (deep copy) so the crew is self-contained.
  const members = State.coop.friends.map(f => ({ label: f.label, titles: [...f.titles] }));
  const existing = State.coop.groups.find(g => g.name.toLowerCase() === name.toLowerCase());
  if (existing) { existing.members = members; existing.savedAt = Date.now(); }
  else State.coop.groups.unshift({ id: uid(), name, members, savedAt: Date.now() });
  State.persist();
  if (input) input.value = '';
  renderCoopGroups();
  toast(existing ? `Updated crew “${name}”` : `Saved crew “${name}”`, 'ok');
}

function handleLoadCoopGroup(id) {
  const g = (State.coop.groups || []).find(x => x.id === id);
  if (!g) return;
  State.coop.friends = g.members.map(m => ({ label: m.label, titles: [...m.titles] }));
  State.persist();
  renderCoopResults();
  renderCoopGroups();
  toast(`Loaded crew “${g.name}” (${g.members.length} friend${g.members.length === 1 ? '' : 's'})`, 'ok');
}

function handleDeleteCoopGroup(id) {
  State.coop.groups = (State.coop.groups || []).filter(g => g.id !== id);
  State.persist();
  renderCoopGroups();
  toast('Crew deleted', 'info');
}

// Render the saved-crews list (load / delete each).
function renderCoopGroups() {
  const host = $('#coopGroups');
  if (!host) return;
  const groups = State.coop.groups || [];
  if (!groups.length) {
    host.innerHTML = `<p class="text-xs text-slate-600">No saved crews yet. Compare friends above, then save the crew to reuse it anytime.</p>`;
    return;
  }
  host.innerHTML = groups.map(g => {
    const active = State.coop.friends.length === g.members.length &&
      State.coop.friends.every((f, i) => g.members[i] && g.members[i].titles.length === f.titles.length);
    return `
    <div class="flex items-center gap-2 p-2 rounded-lg bg-nexus-bg border ${active ? 'border-nexus-cyan' : 'border-nexus-border'}">
      <div class="min-w-0">
        <div class="text-sm font-semibold text-slate-200 truncate">${escapeHtml(g.name)}${active ? ' <span class="text-[10px] text-nexus-cyan">· active</span>' : ''}</div>
        <div class="text-[10px] text-slate-500">${g.members.length} friend${g.members.length === 1 ? '' : 's'} · saved ${new Date(g.savedAt).toLocaleDateString()}</div>
      </div>
      <div class="ml-auto flex items-center gap-1.5 shrink-0">
        <button data-coop-load="${g.id}" class="px-2.5 py-1 rounded-lg bg-nexus-cyan/15 border border-nexus-cyan text-nexus-cyan text-xs font-bold hover:bg-nexus-cyan/25 transition">Load</button>
        <button data-coop-del="${g.id}" title="Delete crew" class="w-7 h-7 grid place-items-center rounded-lg border border-nexus-border text-slate-500 hover:text-nexus-red hover:border-nexus-red transition">✕</button>
      </div>
    </div>`;
  }).join('');
}

/* ---- DLC Finder: scan the owned library for available add-ons ------------
 * DLC data comes from Steam's appdetails (`data.dlc` on a base game -> DLC
 * appids -> each DLC's name + price). Works for Steam-resolvable (PC) titles;
 * console games have no keyless DLC source and are skipped. Results and lookups
 * are cached so re-scans are cheap and stay well within Steam's rate limits.
 * ----------------------------------------------------------------------- */
const DLC_SCAN_MAX_GAMES = 60;   // cap games probed per scan
const DLC_SCAN_MAX_DLC   = 120;  // cap total DLC detail lookups per scan

// Fetch appdetails for one appid through the proxy; return the `data` object.
async function steamAppDetails(appid, filters) {
  const f = filters ? `&filters=${filters}` : '';
  const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&l=english&cc=us${f}`;
  const ok = (b) => { try { const d = JSON.parse(b); return !!(d && (d[appid] || d[String(appid)])); } catch { return false; } };
  const body = await fetchViaProxyText(url, ok);
  const entry = JSON.parse(body)[appid] || JSON.parse(body)[String(appid)];
  return (entry && entry.success && entry.data) ? entry.data : null;
}

// Resolve a Steam appID for an owned library game (Steam import carries one).
async function resolveOwnedAppId(game) {
  if (game.appid) return String(game.appid);
  const mapped = STEAM_APPID[baseTitle(game.title)] || STEAM_APPID[_atlasNorm(cleanTitleForSearch(game.title))];
  if (mapped) return String(mapped);
  try { const a = await ImageHarvester.findAppId(game.title); return a ? String(a) : null; }
  catch { return null; }
}

// Walk the library, collect available DLC grouped by base game.
async function scanLibraryDLC(onProgress) {
  const cache = State.dlcCache;
  cache.byGame = cache.byGame || {};   // gameId -> [{appid,name}] for collection hints
  const games = State.library.slice(0, DLC_SCAN_MAX_GAMES);
  const results = [];
  let scanned = 0, skipped = 0, totalDlc = 0;
  for (const game of games) {
    scanned++;
    onProgress && onProgress(scanned, games.length, game.title);
    let appid = null;
    try { appid = await resolveOwnedAppId(game); } catch { /* unresolved */ }
    if (!appid) { skipped++; continue; }

    let dlcIds = cache.bases[appid];
    if (!dlcIds) {
      const data = await steamAppDetails(appid).catch(() => null);
      dlcIds = (data && Array.isArray(data.dlc)) ? data.dlc : [];
      cache.bases[appid] = dlcIds;
    }
    if (!dlcIds.length) { cache.byGame[game.id] = []; continue; }

    const dlcs = [];
    for (const did of dlcIds) {
      if (totalDlc >= DLC_SCAN_MAX_DLC) break;
      let det = cache.details[did];
      if (det === undefined) {
        const data = await steamAppDetails(did, 'basic,price_overview').catch(() => null);
        if (data && data.name) {
          const po = data.price_overview;
          det = {
            name: data.name,
            isFree: !!data.is_free,
            discount: po ? po.discount_percent : 0,
            priceFinal: po ? po.final / 100 : (data.is_free ? 0 : null),
            priceInitial: po ? po.initial / 100 : null,
            url: `https://store.steampowered.com/app/${did}/`,
          };
        } else det = null;
        cache.details[did] = det;
      }
      if (!det || !det.name) continue;
      totalDlc++;
      dlcs.push({ appid: did, ...det });
    }
    cache.byGame[game.id] = dlcs.map(d => ({ appid: d.appid, name: d.name }));
    if (dlcs.length) results.push({ baseTitle: game.title, baseGameId: game.id, dlcs });
  }
  State.persist(); // keep the freshly filled lookup cache + per-game hints
  return { results, scanned, skipped, totalDlc };
}

async function runScanDlc() {
  const el = $('#dlcResults');
  if (!el) return;
  el.classList.remove('hidden');
  if (!State.library.length) {
    el.innerHTML = dlcCard(`Add some games to your library first, then scan for their DLC.`);
    return;
  }
  const btn = $('#dlcScanBtn');
  if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = '⏳ Scanning…'; }
  el.innerHTML = dlcCard(`<span class="text-nexus-cyan" id="dlcProgress">⏳ Scanning your library for DLC…</span>`);
  try {
    const data = await scanLibraryDLC((i, total, title) => {
      const p = $('#dlcProgress');
      if (p) p.textContent = `⏳ Scanning ${i}/${total}: ${title}`;
    });
    State.dlcScan = data;
    renderDlcResults(data);
    renderLibrary(); // refresh collection so per-game DLC hints appear
  } catch (e) {
    el.innerHTML = dlcCard(`<span class="text-amber-400">DLC scan failed: ${escapeHtml(e.message)}. Steam may be busy — try again shortly.</span>`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = btn.dataset.label || '🧩 Find DLC for my games'; }
  }
}

// Collection-card DLC hint: how many available DLC a game has that you don't own
// yet (from the last scan's cached list). '' when the game wasn't scanned or has
// no DLC; a subtle "complete" pill when you own them all.
function dlcBadge(g) {
  const list = State.dlcCache.byGame && State.dlcCache.byGame[g.id];
  if (!list || !list.length) return '';
  const unowned = list.filter(d => !isDlcOwned(g.id, d.name)).length;
  if (unowned === 0) {
    return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-nexus-cyan/10 text-nexus-cyan border border-nexus-cyan/40">🧩 DLC complete</span>`;
  }
  return `<button data-dlc-game="${g.id}" title="Show available DLC" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-nexus-violet/15 text-nexus-violet border border-nexus-violet/50 hover:bg-nexus-violet/25 transition">🧩 ${unowned} DLC available</button>`;
}

// Show one game's DLC instantly from cache (no network) and scroll to it.
function showDlcForGame(gameId) {
  const g = State.library.find(x => x.id === gameId);
  const list = (State.dlcCache.byGame && State.dlcCache.byGame[gameId]) || [];
  if (!g || !list.length) { runScanDlc(); return; }
  const dlcs = list.map(x => {
    const det = State.dlcCache.details[x.appid] || {};
    return {
      appid: x.appid, name: det.name || x.name,
      isFree: !!det.isFree, discount: det.discount || 0,
      priceFinal: det.priceFinal != null ? det.priceFinal : null,
      priceInitial: det.priceInitial != null ? det.priceInitial : null,
      url: det.url || `https://store.steampowered.com/app/${x.appid}/`,
    };
  });
  State.dlcScan = { results: [{ baseTitle: g.title, baseGameId: g.id, dlcs }], scanned: 1, skipped: 0, totalDlc: dlcs.length };
  renderDlcResults(State.dlcScan);
  document.getElementById('dlcResults')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const dlcCard = (inner) => `<div class="p-4 rounded-2xl bg-nexus-card border border-nexus-border text-sm text-slate-300">${inner}
  <button id="dlcClose" class="ml-2 text-xs text-slate-500 hover:text-white underline">close</button></div>`;

function renderDlcResults(data) {
  const el = $('#dlcResults');
  if (!el) return;
  el.classList.remove('hidden');
  if (!data.results.length) {
    el.innerHTML = dlcCard(`No DLC found for your Steam titles (scanned ${data.scanned}${data.skipped ? `, ${data.skipped} not on Steam` : ''}). Console games can't be scanned for DLC.`);
    return;
  }
  const groups = data.results.map(g => `
    <div class="mb-4 last:mb-0">
      <h4 class="text-sm font-bold text-slate-200 mb-2 flex items-center gap-2">
        <span class="w-1.5 h-1.5 rounded-full bg-nexus-violet"></span>${escapeHtml(g.baseTitle)}
        <span class="text-xs font-normal text-slate-500">· ${g.dlcs.length} DLC</span>
      </h4>
      <div class="space-y-2">${g.dlcs.map(d => dlcRowHTML(g.baseGameId, d)).join('')}</div>
    </div>`).join('');
  el.innerHTML = `
    <div class="p-4 rounded-2xl bg-nexus-card border border-nexus-border">
      <div class="flex items-center justify-between mb-3 gap-2">
        <h3 class="text-base font-extrabold flex items-center gap-2 min-w-0">
          🧩 DLC for your library
          <span class="text-xs font-normal text-slate-500 truncate">${data.totalDlc} found · ${data.scanned} games scanned</span>
        </h3>
        <button id="dlcClose" class="shrink-0 w-8 h-8 grid place-items-center rounded-lg hover:bg-nexus-bg text-slate-400 hover:text-white text-xl leading-none">×</button>
      </div>
      ${groups}
    </div>`;
}

function dlcRowHTML(baseGameId, d) {
  const owned = isDlcOwned(baseGameId, d.name);
  const wished = !!State.favorites['dlc_' + d.appid];
  const price = owned ? '<span class="text-nexus-cyan font-bold">In your library</span>'
    : d.isFree ? '<span class="text-nexus-green font-bold">FREE</span>'
    : d.discount > 0 ? `<span class="text-slate-500 line-through text-xs">${money(d.priceInitial)}</span> <span class="text-nexus-green font-extrabold ml-1">${money(d.priceFinal)}</span> <span class="ml-1 px-1 py-0.5 rounded text-[10px] font-black text-nexus-bg bg-nexus-green">-${d.discount}%</span>`
    : d.priceFinal != null ? `<span class="text-slate-200 font-semibold">${money(d.priceFinal)}</span>`
    : '<span class="text-slate-500">price n/a</span>';
  const onSale = d.discount > 0 || d.isFree;
  const wishBtn = owned ? '' : (wished
    ? `<span title="On your wishlist" class="w-7 h-7 grid place-items-center rounded-lg border border-nexus-violet text-nexus-violet">★</span>`
    : `<button data-dlc-wish="${d.appid}" title="${onSale ? 'Add to wishlist' : 'Wishlist — watch for a price drop'}" class="w-7 h-7 grid place-items-center rounded-lg border border-nexus-border text-slate-400 hover:text-nexus-violet hover:border-nexus-violet transition">☆</button>`);
  const ownBtn = `<button data-dlc-own="${baseGameId}::${encodeURIComponent(d.name)}" title="${owned ? 'Owned' : 'Mark as owned'}"
       class="px-2 h-7 rounded-lg border text-[11px] font-bold transition ${owned ? 'bg-nexus-cyan/15 border-nexus-cyan text-nexus-cyan' : 'border-nexus-border text-slate-400 hover:text-white hover:border-nexus-cyan'}">${owned ? '✓ Own' : '+ Own'}</button>`;
  return `
  <div class="flex items-center gap-2 p-2 rounded-lg bg-nexus-bg border border-nexus-border" data-dlc-appid="${d.appid}">
    <div class="min-w-0 flex-1">
      <div class="text-sm text-slate-200 truncate">${escapeHtml(d.name)}</div>
      <div class="text-xs mt-0.5">${price}</div>
    </div>
    <div class="flex items-center gap-1.5 shrink-0">
      ${wishBtn}${ownBtn}
      <a href="${escapeHtml(d.url)}" target="_blank" rel="noopener noreferrer" class="px-2.5 h-7 grid place-items-center rounded-lg bg-gradient-to-r from-nexus-cyan to-nexus-violet text-nexus-bg text-[11px] font-bold hover:opacity-90 transition">Get ↗</a>
    </div>
  </div>`;
}

function isDlcOwned(baseGameId, name) {
  const g = State.library.find(x => x.id === baseGameId);
  return !!(g && (g.dlc || []).some(d => normTitle(d.name) === normTitle(name) && d.owned));
}

function findScannedDlc(appid) {
  if (!State.dlcScan) return null;
  for (const g of State.dlcScan.results) {
    const hit = g.dlcs.find(d => String(d.appid) === String(appid));
    if (hit) return hit;
  }
  return null;
}

// ★ Wishlist a DLC -> reuse Favorites so it's watched for price drops.
function wishlistDlc(appid) {
  const d = findScannedDlc(appid);
  if (!d) return;
  const id = 'dlc_' + appid;
  if (!State.favorites[id]) {
    State.favorites[id] = {
      id, title: d.name,
      img: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
      url: d.url, system: 'pc',
      retail: d.priceInitial != null ? d.priceInitial : (d.priceFinal != null ? d.priceFinal : 0),
      sale: d.priceFinal != null ? d.priceFinal : 0,
      fullPrice: !(d.discount > 0 || d.isFree),
    };
    State.persist();
    renderFavorites();
    toast(`Added “${d.name}” to wishlist ⭐`, 'ok');
  }
  if (State.dlcScan) renderDlcResults(State.dlcScan);
}

// ✓ Mark a DLC as owned -> add it to the base game's dlc list.
function ownDlc(baseGameId, name) {
  const g = State.library.find(x => x.id === baseGameId);
  if (!g) return;
  g.dlc = g.dlc || [];
  const existing = g.dlc.find(x => normTitle(x.name) === normTitle(name));
  if (existing) existing.owned = true;
  else g.dlc.push({ name, owned: true });
  State.persist();
  renderLibrary();
  if (State.dlcScan) renderDlcResults(State.dlcScan);
  toast(`Marked “${name}” as owned ✓`, 'ok');
}

async function handleSteamImport() {
  const input = $('#steamIdInput');
  const status = $('#steamImportStatus');
  const helper = $('#steam-privacy-helper');
  const val = (input?.value || '').trim();
  if (helper) helper.classList.add('hidden');
  if (!val) { toast('Enter a SteamID or vanity name', 'warn'); return; }
  if (status) status.innerHTML = '<span class="text-nexus-cyan">⏳ Reading public Steam profile…</span>';
  try {
    const { total, added } = await importSteamLibrary(val);
    if (status) status.innerHTML = `<span class="text-nexus-green">✓ Imported ${added} new game${added === 1 ? '' : 's'} from ${total} public titles.</span>`;
    toast(`Steam import: +${added} games`, 'ok');
  } catch (err) {
    if (err.privacy || err.gated) {
      // Both cases resolve the same way for the user: the games list isn't
      // readable. Show ONE coherent helper (no contradictory second message).
      // err.privacy = the profile itself is private; err.gated = profile is
      // public but "Game details" (a separate setting) still isn't.
      if (status) status.innerHTML = '';
      if (helper) helper.classList.remove('hidden');
    } else {
      if (status) status.innerHTML = `<span class="text-amber-400">⚠ ${escapeHtml(err.message)}</span>`;
    }
  }
}

// If the page was opened from a shared sync link, auto-load that friend.
function ingestSyncFromUrl() {
  const m = location.hash.match(/sync=([^&#\s]+)/);
  if (!m) return;
  const titles = decodeSync(m[1]);
  if (titles && titles.length) {
    State.coop.friends = [{ label: 'Shared link', titles }];
    toast(`Loaded a friend's library (${titles.length} games) — open My Library ▸ Co-op Lounge`, 'ok');
  }
}

/* ---- Custom-library autocomplete (local catalogue + Steam name DB) ---- */
const LOCAL_CATALOG = (() => {
  const seen = new Set(); const out = [];
  MOCK_DEALS.forEach(d => {
    const n = normTitle(d.title);
    if (seen.has(n)) return; seen.add(n);
    out.push({ title: d.title, platform: systemToPlatform(d.system), appid: STEAM_APPID[baseTitle(d.title)] });
  });
  return out;
})();

let ownedSuggestTimer;
function onOwnedTitleInput(val) {
  const q = normTitle(val);
  if (q.length < 2) { hideSuggestions(); return; }
  const local = LOCAL_CATALOG.filter(g => normTitle(g.title).includes(q)).slice(0, 8)
    .map(g => ({ title: g.title, platform: g.platform, appid: g.appid, source: 'catalog' }));
  renderSuggestions(local); // instant, from local catalogue
  clearTimeout(ownedSuggestTimer);
  ownedSuggestTimer = setTimeout(async () => {
    try {
      const remote = await NexusDataEngine.searchGames(val.trim());
      const rsug = remote.slice(0, 10).map(d => ({ title: d.title, platform: 'PC', appid: d.steamAppID, gameID: d.gameID, source: 'steam' }));
      const merged = []; const seen = new Set();
      [...local, ...rsug].forEach(s => { const n = normTitle(s.title); if (seen.has(n)) return; seen.add(n); merged.push(s); });
      if (normTitle($('#ownedTitleInput')?.value || '') === q) renderSuggestions(merged);
    } catch { /* remote optional */ }
  }, 300);
}

function renderSuggestions(list) {
  const box = $('#search-suggestions');
  if (!box) return;
  if (!list.length) { hideSuggestions(); return; }
  box.innerHTML = list.map(s => `
    <button type="button" data-suggest-title="${escapeHtml(s.title)}" data-suggest-platform="${escapeHtml(s.platform || 'PC')}"
      data-suggest-appid="${s.appid || ''}" data-suggest-gameid="${s.gameID || ''}"
      class="w-full text-left px-3 py-2 hover:bg-nexus-bg flex items-center gap-2 border-b border-nexus-border/50 last:border-0">
      <span class="text-sm text-slate-200 truncate">${escapeHtml(s.title)}</span>
      <span class="ml-auto text-[10px] shrink-0 ${s.source === 'steam' ? 'text-nexus-cyan' : 'text-slate-500'}">${s.source === 'steam' ? '🟦 Steam DB' : '📚 Catalog'} · ${escapeHtml(s.platform || 'PC')}</span>
    </button>`).join('');
  box.classList.remove('hidden');
}
function hideSuggestions() {
  const b = $('#search-suggestions');
  if (b) { b.classList.add('hidden'); b.innerHTML = ''; }
}
function pickSuggestion(el) {
  const input = $('#ownedTitleInput');
  if (!input) return;
  input.value = el.dataset.suggestTitle;
  input.dataset.appid = el.dataset.suggestAppid || '';
  input.dataset.gameid = el.dataset.suggestGameid || '';   // verified global ID signature
  const plat = el.dataset.suggestPlatform || 'PC';
  const sel = $('#ownedForm select[name="platform"]');
  if (sel && [...sel.options].some(o => o.value === plat)) sel.value = plat;
  hideSuggestions();
  input.focus();
}

/* ---- Back to Main Catalog navigation control ---- */
function anyOverlayOpen() {
  return $$('[data-overlay]').some(o => !o.classList.contains('hidden-init')) ||
    !$('#game-detail-modal').classList.contains('hidden-init');
}
function updateBackToCatalog() {
  const btn = $('#backToCatalog');
  if (!btn) return;
  // The Library is now a full page with its own in-header "Deals" button, so the
  // floating catalog pill would be redundant there — hide it when Library is open.
  const libOpen = !$('[data-overlay="library"]').classList.contains('hidden-init');
  btn.classList.toggle('hidden-init', !anyOverlayOpen() || libOpen);
}

// Push a single pseudo history entry when the first overlay opens, so a mobile
// back-gesture / hardware back pops THAT entry (staying on the page) instead of
// unloading the app — popstate then closes our modal locally.
function ensureModalHistory() {
  if (State.pushed === 0) { history.pushState({ nexusModal: true }, ''); State.pushed = 1; }
}
function closeAllOverlaysDom() {
  closeDetail();
  $$('[data-overlay]').forEach(o => { if (!o.classList.contains('hidden-init')) closePanel(o); });
  hideSuggestions();
  setTimeout(updateBackToCatalog, 320);
}
// UI-initiated close routes through history so the pushed entry stays balanced.
function requestCloseOverlays() {
  if (State.pushed > 0) history.back();   // -> popstate -> closeAllOverlaysDom()
  else closeAllOverlaysDom();
}
function backToCatalog() { requestCloseOverlays(); }

/* --------------------------------------------------------------------------
 * 12. BOOT
 * ------------------------------------------------------------------------ */

function setEngineStatus(state, text) {
  const el = $('#engineStatus');
  const dot = el.querySelector('span:first-child');
  const label = el.querySelector('span:last-child');
  const map = { loading: 'bg-amber-400 animate-pulse', live: 'bg-nexus-green', fallback: 'bg-amber-400' };
  dot.className = `w-2 h-2 rounded-full ${map[state] || map.loading}`;
  label.textContent = text;
}

async function boot(isRefresh = false) {
  State.booted = false;
  setEngineStatus('loading', isRefresh ? 'Refreshing deals…' : 'Booting Nexus Data Engine…');
  State.engine = new NexusDataEngine();
  try {
    State.deals = await State.engine.load();
  } catch (err) {
    console.error('Engine load failed catastrophically:', err);
    State.deals = MOCK_DEALS.map(NexusDataEngine.normalize);
    State.engine.usedFallback = true;
  }

  if (State.engine.usedFallback) setEngineStatus('fallback', 'Offline mode · curated fallback deals');
  else setEngineStatus('live', `Live · ${State.engine.liveCount} PC deals synced`);

  State.booted = true;
  detectPriceDrops();
  renderAll();
  updateLoadMoreUI('idle');
  if (isRefresh) toast('Deals refreshed', 'ok');
}

function init() {
  const stamp = $('#buildStamp'); if (stamp) stamp.textContent = APP_BUILD;
  renderSystemFilters();
  wireEvents();

  // Back-gesture / hardware-back interception: when our pushed modal entry is
  // popped, close overlays locally instead of letting the browser unload the app.
  window.addEventListener('popstate', (event) => {
    if (State.pushed > 0) {
      if (event.preventDefault) event.preventDefault(); // (popstate isn't cancelable; the pushed entry is what absorbs the nav)
      State.pushed = 0;
      closeAllOverlaysDom();
    }
  });

  ingestSyncFromUrl();       // pick up a shared co-op link if present
  renderAll();               // paint immediately with mock/manual data
  setupInfiniteScroll();

  // Favorites watchlist monitor loop — re-scan for live price drops periodically.
  setInterval(() => {
    const before = [...State.priceDrops].sort().join('|');
    detectPriceDrops();
    if ([...State.priceDrops].sort().join('|') !== before) {
      renderAll();
      renderFavorites();
      if (State.priceDrops.size) toast('🔥 A favorite just went on sale!', 'ok');
    }
  }, 30000);
  updateLoadMoreUI('idle');
  boot();                    // hydrate with live paginated data

  // Real app-shell service worker (sw.js) — offline support + instant repeat
  // loads. Registered from a real path so its scope covers the whole app; the
  // catch keeps non-secure contexts (e.g. file://) from throwing.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* non-fatal */ });
    });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
