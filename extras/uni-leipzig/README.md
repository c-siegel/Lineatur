# Erweiterung: Universität Leipzig – Schülerlabor

Material, das nur für das Team des Schülerlabors (Institut für Didaktik der Physik, Universität
Leipzig) gedacht ist. Es gehört nicht zur allgemeinen Lineatur-Ausgabe und wird separat im Team
weitergegeben.

| Inhalt | Was es ist |
|---|---|
| `themes/projektheft/` | Seitendesign „Projektheft“: Dreiecke an der Falz, Kopf- und Fußzeile im Design der XtremLab-Hefte |
| `vorlagen/projektheft.json` | Vorlage: A5-Heft mit Titelseite und eingebauter Anleitung, nutzt das Seitendesign |

## Installieren

1. **Seitendesign:** den Ordner `themes/projektheft/` in den Ordner `themes/` von Lineatur kopieren
   (also nach `themes/projektheft/`) und Lineatur neu starten. Danach steht unter
   Dokument → Seite → Seitendesign „Projektheft (Schülerlabor)“ zur Auswahl.
   **Portable .exe:** neben die `.exe` einen Ordner `themes` legen und den Ordner `projektheft`
   dort hineinkopieren (`Lineatur-….exe`, `themes/projektheft/theme.js`, …), dann die App neu
   starten. Alternativ vor `npm run dist` nach `themes/` kopieren, dann ist das Design in der .exe enthalten.
2. **Vorlage:** in Lineatur unter Für den Einstieg → Vorlagen → „Vorlage importieren…“ die Datei
   `vorlagen/projektheft.json` wählen.

Ohne installiertes Seitendesign öffnet sich die Vorlage ohne Dreiecke, Kopf- und Fußzeile des Hefts;
alle Inhalte bleiben erhalten.
