# Changelog

Die Version wird nur in `package.json` gesetzt. Dashboard, Server, HTML-Export und die portable App (`Lineatur-<version>-portable.exe`) lesen sie von dort.

## Unveröffentlicht

- **Gruppen beim Ausrichten und Verteilen**: Eine Gruppe zählt als ein Element. Ihre Bausteine behalten ihre Abstände zueinander; ist ein Baustein der Gruppe gesperrt, bleibt die ganze Gruppe stehen.
- **In die Gruppe hineinklicken**: Ist eine Gruppe ausgewählt, wählt ein weiterer Klick nur den angeklickten Baustein. Er lässt sich dann verschieben und bearbeiten, ohne die Gruppe aufzulösen; ein gestrichelter Rahmen zeigt die Gruppe, `Esc` wählt wieder die ganze Gruppe. Rahmen und Hintergrund der Gruppe bleiben über die Schnellleiste des Bausteins erreichbar.
- **Einfügen auf der aktuellen Seite**: Ein Klick in der Bausteinpalette und Einfügen aus der Zwischenablage setzen den Baustein auf die Seite der Auswahl bzw. auf die sichtbare Seite (ist sie voll: auf die nächste Seite oder eine neue Seite direkt dahinter); im Fluss-Layout nach der Auswahl bzw. nach dem letzten Baustein der sichtbaren Seite. „+ Seite“ fügt die neue Seite nach der aktuellen ein, „− Seite“ entfernt die aktuelle Seite, wenn sie leer ist. Hinter der Rückseite einer Broschüre wird nie eingefügt. Die aktuelle Seite ist dezent markiert, Neues wird in den sichtbaren Bereich gescrollt.
- **Ebenen nach Seiten**: Der Ebenen-Tab gliedert die Bausteine nach Seiten (einklappbar, ein Klick auf die Kopfzeile zeigt die Seite). Gruppen erscheinen als ein Eintrag, der sich zu seinen Bausteinen aufklappen lässt; ein Klick auf einen Baustein darin wählt nur diesen. Im Raster-Layout verschiebt Ziehen auf eine andere Seite den Baustein (mit seiner Gruppe) dorthin. Welche Seiten und Gruppen aufgeklappt sind, merkt sich der Browser je Dokument.
- **Aufgabennummer im Text**: Neue Einstellung unter Dokument → Aufgabennummerierung „Nummer und Text: eingerückt | im Text“, für einzelne Aufgaben in ihren Eigenschaften umstellbar. „Im Text“ setzt die Nummer an den Anfang der ersten Zeile; die Punkte bleiben rechts oben, die erste Zeile endet vor ihnen, ab der zweiten Zeile nutzt der Text die volle Breite. Beginnt eine Aufgabe nicht mit Text (z. B. mit Wortspeicher), bleibt sie eingerückt. Gilt auch im HTML-Export.
- **Seitendesign importieren**: Unter Dokument → Seite → Seitendesign nimmt „Design importieren …“ ein Design als `.zip` an und lädt es sofort, ohne Neustart; fehlt einem Dokument sein Design, steht die Schaltfläche gleich dort. Selbst installierte Designs lassen sich wieder entfernen. Weil ein Design Programmcode enthält, warnt ein Dialog, und der Import ist nur aktiv, solange der Server allein auf diesem Rechner erreichbar ist (oder mit `LINEATUR_THEME_IMPORT=1`).
- **Formatierung in weiteren Feldern**: `**fett**`, `*kursiv*` und `$Formel$` wirken jetzt auch in den Lösungen und im Wortspeicher des Lückentexts, in Hervorhebungen über eine Lücke hinweg (`*Die [[Sonne]] scheint*`), in Titeln von Infobox und Tabelle, in der Beschriftung der Schreiblinien, in Tabellen-Lösungen, in Kreislauf und Kette, in Baumdiagrammen und im freien Text von Kopf- und Fußzeile. Eine Lücke in einer Formel (`$x = [[2]]$`) wird nicht unterstützt; der Inspektor zeigt dazu einen Hinweis. Beim Prüfen im HTML-Export zählen die Formatierungszeichen nicht.

## 1.1.0 – Seitendesigns für die portable App

- **Seitendesigns in der portablen App**: Die `.exe` lädt zusätzlich den Ordner `themes` neben sich (bei Start aus dem Quellcode: Umgebungsvariable `LINEATUR_THEMES`). So lässt sich z. B. das Design „Projektheft“ aus `extras/uni-leipzig/` ohne eigenen Build installieren. Gelesen wird beim Start der App; nach Änderungen die App neu starten.

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
