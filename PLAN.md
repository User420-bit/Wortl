# Wortl – Plan

Deutscher Wordle-Klon nach dem Vorbild wordly.org/de, mit einem Unterschied:
die Wortlänge ist wählbar. Leicht 5, Mittel 6, Schwer 7, Experte 8 Buchstaben.

## Spiel

- Sechs Versuche, unabhängig von der Länge. Längere Wörter geben pro Versuch
  mehr Information, darum bleibt die Zahl gleich.
- Zwei Modi: **Wort des Tages** (je Länge ein Wort, für alle gleich, aus dem
  Datum abgeleitet) und **Zufall** (beliebig oft, neues Wort pro Runde).
- Bewertung wie bei Wordle: grün richtig, gelb an anderer Stelle, grau nicht
  enthalten. Doppelte Buchstaben werden nur so oft gelb, wie sie im Lösungswort
  vorkommen.
- Tastatur QWERTZ mit Ä, Ö, Ü. ß gibt es nicht, es wird als SS eingegeben,
  wie bei den meisten deutschen Wordle-Varianten.
- Statistik je Länge im `localStorage`: gespielt, gewonnen, Serie, beste Serie,
  Verteilung über die Versuche. Ergebnis als Kästchen-Text kopierbar.
- Ein angefangenes Tageswort bleibt beim Neuladen erhalten.

## Wörter

`words.js` entsteht aus `scripts/woerter.py`:

- Quelle der Formen: `wortliste.txt` von github.com/davidak/wortliste (GPL-3).
- Häufigkeit: Python-Paket `wordfreq`, deutsche Liste.
- Lösungswörter: häufig (Zipf ≥ 3,4), keine Eigennamen (Heuristik über die
  Häufigkeit in anderen Sprachen plus Sperrliste `scripts/keine-loesung.txt`),
  keine Flexionsformen, wenn der Stamm selbst häufig ist.
- Erlaubte Eingaben: alle Formen der Wortliste, die wordfreq kennt, ohne
  englische Wörter, die im Deutschen seltener sind als im Englischen.

Stand: 515 / 816 / 914 / 1051 Lösungswörter, 4 797 / 7 563 / 9 395 / 12 439
erlaubte Eingaben.

## Technik

- Statisch: `index.html`, `style.css`, `app.js`, `words.js`. Kein Build,
  keine Abhängigkeit, keine Anfrage an fremde Server, keine Schriften von
  aussen.
- Läuft auf GitHub Pages aus dem Branch `main`.
- Ohne JavaScript zeigt die Seite einen Hinweis; ohne Animation
  (`prefers-reduced-motion`) ist alles spielbar.

## Gestaltung

Setzkasten statt App-Store. Eine Papierfläche, Tinte, ein Akzent.

- Farben: Papier `#f3efe6`, Tinte `#1b1a17`, richtig `#2f6b4a`, enthalten
  `#b8862b`, fehlt `#7d776c`. Dunkel: `#15140f` / `#ece7da`, Akzente leicht
  gedämpft. Kein Verlauf, kein Glas, kein Schatten als Deko.
- Schrift: Systemschriften. Titel in Serife, Kacheln und Tastatur in
  Grotesk, Versalien mit Sperrung.
- Kacheln: 2 px Rand, quadratisch, Grösse aus Viewport und Wortlänge, bei
  8 Buchstaben auf 375 px noch 38 px.
- Bewegung: Kachel kippt beim Aufdecken, Reihe wackelt bei ungültiger
  Eingabe. Beides aus unter `prefers-reduced-motion`.
- Keine Emojis in der Oberfläche, Kästchen nur im kopierten Ergebnis.
