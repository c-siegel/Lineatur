# Beispiel: Randleiste

Ein Seitendesign zum Abschauen und Abwandeln. Es zeigt alles, was ein Design kann:

- **Einstellungen** (`fields`): Reihe, Titel, Fußzeilentext und Farbe erscheinen im Editor unter
  Dokument → Seite → Seitendesign. `{title}` als Platzhalter heißt: leer lassen = Titel des Blatts.
- **Logo** (`logo`): ein Bild für die Fußzeile.
- **Typst-Datei** (`beispiel.typ`): `setup` importiert sie, `page` ruft `bsp-page(..)` auf und liefert
  damit Kopfzeile, Fußzeile und Hintergrund für `#set page(..)`. Die Seitenränder setzt Lineatur.
- **Broschüre:** Titel- und Rückseite bleiben ohne Kopfzeile, Fußzeile und Leiste; die Seitenzahl
  zählt ab der ersten Innenseite.
- **Doppelseitig:** Die Leiste wechselt mit der Seite nach außen (`t.mirrored`).

## Eigenes Design daraus machen

1. Den Ordner kopieren, z. B. nach `themes/meindesign/`.
2. In `theme.js` `name` und `label` ändern (`name` muss eindeutig sein, gespeichert wird er im Dokument).
3. Die Typst-Datei umbenennen und den Pfad in `setup` anpassen; dort Kopfzeile, Fußzeile und
   Hintergrund nach Wunsch ändern.
4. Lineatur neu starten oder den Ordner als `.zip` über „Design importieren …“ laden.

Texte aus dem Dokument immer über `t.S(..)` an Typst geben und andere Werte (wie hier die Farbe) in
`theme.js` prüfen, damit keine Eingabe als Typst-Code ausgeführt wird.
