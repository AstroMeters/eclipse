# Zatmění Slunce 12. 8. 2026 — živá vizualizace

Vizualizace průběhu úplného zatmění Slunce z 12. srpna 2026 současně ze dvou
stanovišť: z Prahy, odkud je vidět částečné zatmění nízko nad obzorem, a
z pozorovacího stanoviště v pásu totality v severním Španělsku.

Vznikla pro **Planetum** jako projekce na velkou stěnu, ale je použitelná
i samostatně — v prohlížeči, na tabletu i jako zdroj pro renderované video.

**Živá verze:** https://astrometers.github.io/eclipse/

---
## Co je uvnitř

```
index.html            celá aplikace — jeden soubor, bez závislostí a bez buildu
assets/logo.svg       zdrojové logo (v index.html je vložené inline)
tools/render-video.mjs  render videa ze stejné stránky přes headless Chromium
tools/package.json      závislosti pro render
```

`index.html` je zároveň zdrojový kód. Žádný framework, žádný transpiler, žádný
krok navíc — otevři ho v editoru a máš všechno. Skript je rozdělený do
komentovaných sekcí od Besselových elementů po ovládání.

Funguje i bez připojení k síti. Jediné, co se tahá zvenčí, je webfont IBM Plex;
bez internetu naskočí systémové písmo a nic jiného se nezmění.

---

## Ovládání

Ozubené kolo vpravo dole, nebo klávesy:

| klávesa | funkce |
|---|---|
| `S` | nastavení |
| `M` | přepnutí scény (stanoviště ↔ mapa) |
| `F` | celá obrazovka |
| `+` / `−` | velikost rozhraní |

V nastavení se dá měnit velikost pro projekci, režim zobrazení (stanoviště /
mapa / střídání), barevnost oblohy, souřadnice obou stanovišť a simulovaný čas.

### Simulace

Než zatmění nastane, běží aplikace v náhledovém režimu zastaveném na 16:30 UTC.
Přepnutím na **Simulaci** se dá celý průběh projet ručně posuvníkem nebo
přehrát rychlostí 1× až 600×.

### Konfigurace odkazem

Veškeré nastavení se propisuje do adresy stránky, takže se dá poslat odkazem:

```
index.html#h=Praha,50.0875,14.4213,200,2&f=Oblast%20Le%C3%B3n,42.4072,-4.3698,100,2&k=1.7&v=alt&s=full
```

| klíč | význam |
|---|---|
| `h` | domácí stanoviště — `název,šířka,délka,výška,posun UTC` |
| `f` | stanoviště v terénu — stejný formát |
| `k` | měřítko rozhraní (1 = 100 %) |
| `v` | scéna: `sites`, `map`, `alt` |
| `s` | obloha: `full`, `dim`, `black` |

Západní délky se zadávají záporně.

---

## Jak se to počítá

Okolnosti zatmění počítá prohlížeč z **Besselových elementů** publikovaných
NASA/GSFC (F. Espenak, efemeridy VSOP87 / ELP2000‑85, ΔT = 71,4 s) standardní
metodou podle Meeuse, *Astronomical Algorithms*, kap. 54. Nic není zadrátované
natvrdo — kontaktní časy, zakrytí i geometrie se dopočítávají pro libovolné
souřadnice, které zadáš.

Kontrolní hodnoty proti publikovaným datům:

| veličina | spočteno | publikováno |
|---|---|---|
| Praha, první kontakt | 17:19:19 UTC | 19:19 SELČ |
| Praha, maximum | 18:11:39 UTC | 20:11 SELČ |
| Praha, zakrytí plochy | 86,1 % | 86,2 % |
| gamma | 0,8978 | 0,8978 |
| největší zatmění | 17:45:53,8 UT | 17:45:53,8 UT |
| největší trvání totality | 138,2 s | 2 min 18,2 s |

Stín na mapě je řešený numericky: stopa úplného stínu se hledá ve 48 směrech
od průsečíku osy stínu se zemským povrchem, polostín je mřížka zakrytí
21 × 15 bodů. Pobřeží a státní hranice pocházejí z Natural Earth 1 : 50 m,
zjednodušené Douglasovým–Peuckerovým algoritmem a vložené přímo do souboru.

Jas oblohy je modelový odhad zbylého toku s okrajovým ztemněním (u = 0,6),
tedy **výpočet, ne měření**.

---

## Render videa

Video se nevykresluje samostatným generátorem — renderuje se **z téhle
stránky**. Skript řídí headless Chromium, posouvá stránce čas snímek po snímku
přes rozhraní `window.eclipseExport` a snímky posílá rourou do ffmpegu.
Jeden renderer, žádná druhá implementace, která by se časem rozešla.

```bash
cd tools
npm install          # nainstaluje i Chromium
node render-video.mjs
```

Potřebuje ještě systémový **ffmpeg** (`apt install ffmpeg`).

Výchozí běh pokryje 17:00–19:30 UTC (19:00–21:30 SELČ) v reálném čase,
ve 2080 × 1560, rozdělený do osmi souborů po dvaceti minutách. Na konci vypíše
příkaz na jejich spojení do jednoho celku.

Než pustíš celý render, zkontroluj vzhled osmi snímky rozprostřenými po celém
úseku:

```bash
node render-video.mjs --probe=8
```

Reálný čas znamená při 10 fps devadesát tisíc snímků, tedy noční úlohu.
`--fps=5` to zhruba půlí a na téhle scéně to nepoznáš — kromě diamantového
prstenu se nic rychle nehýbe.

Všechny parametry jsou popsané v hlavičce `tools/render-video.mjs`.

### Exportní rozhraní

Kdyby sis chtěl render řídit po svém:

```js
window.eclipseExport.begin({ view: 'alt', altSec: 120, startMs, k: 1.7, bare: true });
window.eclipseExport.frame(ms);   // vykreslí snímek pro daný okamžik (UTC ms)
window.eclipseExport.end();
```

`begin()` zmrazí živou smyčku, `frame()` je deterministický — stejný vstup dá
vždy stejný obraz.

---

## Nahrávání obrazovky místo renderu

V nastavení je u simulace rychlost **1× (reálný čas)**. Stačí pustit přehrávání
od 17:00 UTC a nahrát obrazovku třeba OBS Studiem. Výsledek je stejný, jen bez
instalace čehokoliv.
