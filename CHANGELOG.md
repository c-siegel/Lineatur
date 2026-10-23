# Changelog

Die Version wird nur in `package.json` gesetzt. Dashboard, Server, HTML-Export und die portable App (`Lineatur-<version>-portable.exe`) lesen sie von dort.

## 1.0.0 – erste Veröffentlichung

Lineatur als Editor für Arbeitsblätter ohne Programmierkenntnisse für Lehrkräfte: Blockeditor im Browser, Typst für den Satz, Export als PDF und interaktives HTML.

- **Dashboard**: Dokumente, Sammlungen, Suche mit Filtern nach Fach und Klassenstufe, Auswahl über den Kreis auf jeder Karte, eigene Vorlagen (Import als JSON oder „Als Vorlage speichern“), die Anleitung und die Versionsnummer in der Seitenleiste.
- **Editor**: Rasterlayout als Standard, Stapelreihenfolge im Ebenen-Panel, Seitenpanels, die die Seiten nie verschieben, Umbenennen im Header, Hilfekarte je Baustein mit „Beispiel einfügen“, Info-Hinweise per Klick, Warnungen bei Überlappungen und bei Rätseln, die nicht passen.
- **Textbausteine** mit Größe (bis Titel), Ausrichtung, fett und kursiv; Titelseiten entstehen aus gewöhnlichen Bausteinen (der eigene Titelseiten-Baustein entfällt). Einzelne Wörter werden in allen Textfeldern mit `**…**` **fett** und mit `*…*` *kursiv* gesetzt.
- **Aufgaben**: „Als Aufgabe“ macht Text, Linien, Karopapier, Tabellen, Bilder und die übrigen Inhaltsbausteine zu nummerierten Aufgaben mit Punkten und Arbeitsanweisung. Das ersetzt den eigenen Aufgabenbaustein; alte Dokumente werden beim Öffnen umgewandelt. Nummer und Punkte stehen auf der Grundlinie der ersten Zeile.
- **Seite**: Fußzeile und Kopfzeile mit linker, mittlerer und rechter Zone, die auf doppelseitigen Seiten gespiegelt werden; eigenes Seitendesign (Farben, Form, Logo); weitere Designs als Add-ons in `themes/`; Standardschrift 12 pt.
- **Lösungsblatt** in Korrekturrot, in der Vorschau und im PDF.
- **Vorschau**: Seiten werden nur bei Änderungen neu gesendet und gerendert, Bilder werden einmal übertragen; ein Dokument mit 40 Seiten rendert in etwa 0,3 s.
- **Vorlagen**: eine gemeinsame Liste; die Anleitung wird beim ersten Start hinzugefügt und lässt sich löschen.
- **Extras**: das Design „Projektheft“ und die Vorlage des Schülerlabors der Universität Leipzig liegen jetzt in `extras/uni-leipzig/` und werden nur dort installiert, wo sie gebraucht werden.
- **HTML-Export** ist als *Beta* gekennzeichnet: noch nicht jeder Baustein ist interaktiv.
