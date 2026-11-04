# Wortl

Deutscher Wordle-Klon: Wörter mit 5 bis 8 Buchstaben je nach gewählter
Schwierigkeit, statische Seite auf GitHub Pages. Plan und Gestaltung in
`PLAN.md`.

## Kontext

- Stand, Ziel und nächster Schritt stehen im Vault, nicht hier: Notizen
  `Projekt - Wortl` und `Repo – Wortl`. Nachsehen mit `bin/kontext "Wortl"`
  im Arbeitsordner `/Volumes/SSD 1/ClaudeProjekte`.
- Remote: github.com/User420-bit/Wortl, öffentlich, GitHub Pages aus `main`.

## Stack und Befehle

- Kein Build. `index.html`, `style.css`, `app.js`, `words.js`. Keine
  Abhängigkeit, keine Anfrage an fremde Server.
- Vorschau: `python3 -m http.server 4871`, dann http://localhost:4871/.
- Wortlisten neu bauen (braucht `wordfreq` in einem venv und die
  `wortliste.txt` von github.com/davidak/wortliste, GPL-3):

  ```bash
  python3 -I scripts/woerter.py <pfad>/wortliste.txt words.js scripts/keine-loesung.txt
  ```

  `scripts/keine-loesung.txt` sperrt Wörter nur als Lösung (Eigennamen,
  Flexionsformen); als Eingabe bleiben sie erlaubt. `words.js` nie von Hand
  ändern.
- Vor dem Fertig-Melden im Browser bei 375 und 1440 Pixeln prüfen: kein
  horizontales Scrollen, keine Konsolenfehler, Tageswort bleibt beim Neuladen.
- Deutsch in Oberfläche und Notizen, Code und Commits englisch (`feat:`,
  `fix:`), Schweizer Schreibweise ohne ß in der Oberfläche, weil ß im Spiel SS
  ist.
