# Wortl

Deutsches Wortratespiel nach dem Wordle-Prinzip. Sechs Versuche, ein Wort,
und die Wortlänge ist wählbar: 5 (Leicht), 6 (Mittel), 7 (Schwer) oder
8 Buchstaben (Experte). Wort des Tages je Länge oder beliebig viele
Zufallswörter.

Läuft als statische Seite ohne Build und ohne Server: `index.html` öffnen
oder einen beliebigen Dateiserver im Ordner starten.

## Wörter

`words.js` entsteht aus `scripts/woerter.py`. Formen aus der
[Wortliste von davidak](https://github.com/davidak/wortliste) (GPL-3),
Häufigkeiten aus [wordfreq](https://github.com/rspeer/wordfreq). Lösungen
sind häufige Wörter ohne Eigennamen und Flexionsformen; erlaubte Eingaben
sind alle bekannten Formen. ß wird als SS geschrieben.

## Lizenz

Die abgeleiteten Wortlisten stehen wegen der Quelle unter GPL-3, siehe
`LICENSE`.
