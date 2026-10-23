// Explanations of every block: shown as the help card in the editor's inspector and,
// by scripts/build-guide.mjs, as the chapter "Alle Bausteine" of the how-to (Anleitung).
// One source, so the two never disagree.
//
// Per block type:
//   label     name as in the blocks panel
//   purpose   what it is for (one or two sentences)
//   syntax    how to write the content, if there is a special notation
//   example   a short example of that notation (shown as code)
//   solution  what changes on the solution sheet
//   sample    fields that "Beispiel einfügen" puts into the block (null: no button)

export const HELP_GROUPS = [['basic', 'Grundlagen'], ['exercise', 'Aufgaben'], ['puzzle', 'Rätsel'], ['mint', 'MINT']];

const SAME = 'Bleibt auf dem Lösungsblatt unverändert.';

export const BLOCK_HELP = {
  // ------------------------------------------------------------ Grundlagen
  heading: {
    group: 'basic', label: 'Überschrift',
    purpose: 'Gliedert das Blatt in Abschnitte und Unterabschnitte. Überschriften erscheinen im Inhaltsverzeichnis und als Lesezeichen im PDF.',
    syntax: 'Ebene „Abschnitt“ oder „Unterabschnitt“ wählen. Die Nummerierung (1. / 1.1) schalten Sie für alle Überschriften unter Dokument → Inhalte → Überschriften ein.',
    solution: SAME,
    sample: { text: 'Der Wasserkreislauf', level: 1 },
  },
  text: {
    group: 'basic', label: 'Text',
    purpose: 'Erklärungen, Einleitungen und Arbeitsanweisungen. Mit „Als Aufgabe“ wird der Text selbst zur nummerierten Aufgabe mit Punkten. Mit Größe „Titel“, mittig und fett wird daraus auch der Titel einer eigenen Titelseite, zusammen mit Bild (Logos), Linien („Name:“) und QR-Code.',
    syntax: 'Ein Zeilenumbruch im Feld ist auch auf dem Blatt ein Zeilenumbruch. Formeln stehen zwischen Dollarzeichen. Einzelne Wörter werden mit **zwei Sternchen** fett und mit *einem Sternchen* kursiv. Größe (klein bis Titel), Ausrichtung, fett und kursiv in den Einstellungen gelten für den ganzen Baustein.',
    example: 'Die Fläche eines **Kreises** ist $A = pi r^2$.\nSetze für *r* den Radius ein.',
    solution: SAME,
    sample: { text: 'Die Fläche eines Kreises ist $A = pi r^2$.\nSetze für r den Radius in Zentimetern ein.' },
  },
  toc: {
    group: 'basic', label: 'Inhaltsverzeichnis',
    purpose: 'Listet alle Überschriften des Blatts mit Seitenzahlen auf, sinnvoll bei Heften und langen Materialien.',
    syntax: 'Kein Inhalt nötig: Es füllt sich aus den Überschriften-Bausteinen. Einzelne Überschriften nehmen Sie in deren Einstellungen aus.',
    solution: SAME,
    sample: null,
  },
  image: {
    group: 'basic', label: 'Bild',
    purpose: 'Fotos, Grafiken und Skizzen. „Freie Bilder suchen“ findet offen lizenzierte Bilder und trägt den Bildnachweis selbst ein.',
    syntax: 'Eigene Bilder hochladen oder suchen. Breite in Prozent der Bausteinbreite; im Raster bestimmt die Breite des Bausteins die Bildgröße.',
    solution: SAME,
    sample: null,
  },
  lines: {
    group: 'basic', label: 'Linien',
    purpose: 'Schreibraum für freie Antworten: liniert, Grundschul-Lineatur mit vier Linien oder gepunktet. Mit „Als Aufgabe“ und einem Arbeitsauftrag wird daraus eine nummerierte Frage mit Antwortlinien und Punkten.',
    syntax: 'Anzahl und Abstand einstellen. Im Raster werden es mehr Linien, wenn Sie den Baustein nach unten größer ziehen.',
    solution: 'Steht eine Musterlösung im Feld, ersetzt sie auf dem Lösungsblatt die Linien.',
    sample: { label: 'Beobachtung:', count: 4, solution: 'Das Wasser verdunstet und schlägt sich am kalten Deckel als Tropfen nieder.' },
  },
  squares: {
    group: 'basic', label: 'Kästchen',
    purpose: 'Rechenkästchen oder Punktraster, etwa für Nebenrechnungen und Skizzen. Mit „Als Aufgabe“ bekommt das Feld einen Arbeitsauftrag, eine Nummer und Punkte.',
    syntax: 'Zeilen und Kästchengröße einstellen. Im Raster werden es mehr Zeilen, wenn Sie den Baustein größer ziehen.',
    solution: SAME,
    sample: null,
  },
  qr: {
    group: 'basic', label: 'QR-Code',
    purpose: 'Verweist auf eine Webseite, ein Video oder einen Text, den die Schülerinnen und Schüler mit dem Handy öffnen.',
    syntax: 'Link oder Text eintragen, dazu eine kurze Beschriftung, damit klar ist, wohin der Code führt.',
    example: 'https://de.wikipedia.org/wiki/Wasserkreislauf',
    solution: SAME,
    sample: { text: 'https://de.wikipedia.org/wiki/Wasserkreislauf', caption: 'Mehr zum Wasserkreislauf' },
  },
  score: {
    group: 'basic', label: 'Punktezähler',
    purpose: 'Ein Feld „Punkte: ___ / Gesamt“ zum Eintragen der erreichten Punkte.',
    syntax: 'Ohne Maximum steht dort die Summe der Punkte aller Aufgaben. Ein eigenes Maximum überschreibt sie.',
    solution: SAME,
    sample: null,
  },
  assessment: {
    group: 'basic', label: 'Bewertung & Notenschlüssel',
    purpose: 'Für Klassenarbeiten: eine Tabelle mit den Punkten je Aufgabe und ein Notenschlüssel aus der Gesamtpunktzahl.',
    syntax: 'Je Note den Mindestanteil der Gesamtpunkte in Prozent eintragen. Darunter zeigt Lineatur, ab wie vielen Punkten welche Note gilt.',
    solution: SAME,
    sample: null,
  },
  pagebreak: {
    group: 'basic', label: 'Seitenumbruch',
    purpose: 'Nur im Fluss-Layout: Alles danach beginnt auf einer neuen Seite.',
    solution: SAME,
    sample: null,
  },
  table: {
    group: 'basic', label: 'Tabelle',
    purpose: 'Tabellen zum Lesen oder Ausfüllen, mit Kopfzeile und Kopfspalte.',
    syntax: 'Eine Zeile im Feld ist eine Tabellenzeile, die Zellen trennt ein senkrechter Strich |. Eine leere Zelle bleibt zum Ausfüllen frei, [[Antwort]] ist eine Lücke mit Lösung. Spaltenbreiten als Verhältnis, z. B. 2;1;1.',
    example: ' | Masse in g | Volumen in cm³\nEisen | 79 | [[10]]\nHolz | [[6]] | 10',
    solution: 'Die Antworten aus [[…]] erscheinen in den Zellen; leere Zellen bleiben leer.',
    sample: { title: 'Dichte verschiedener Stoffe', rows: ' | Masse in g | Volumen in cm³ | Dichte in g/cm³\nEisen | 79 | 10 | [[7,9]]\nHolz | 6 | 10 | [[0,6]]\nWasser | 10 | 10 | [[1]]', header: 'both', widths: '' },
  },
  tchart: {
    group: 'basic', label: 'Gegenüberstellung',
    purpose: 'Zwei bis vier Spalten mit Schreiblinien, etwa „Gemeinsamkeiten | Unterschiede“ oder „Pro | Contra“.',
    syntax: 'Spaltenköpfe mit | trennen. In der Musterlösung steht pro Zeile je ein Eintrag für jede Spalte, ebenfalls mit | getrennt.',
    example: 'Pro | Contra\nmehr Freizeit | weniger Geld',
    solution: 'Die Musterlösung füllt die Spalten Zeile für Zeile.',
    sample: { text: 'Sammle Argumente zur Frage: Sollen Hausaufgaben abgeschafft werden?', columns: 'Pro | Contra', lines: 4, solution: 'mehr Freizeit | weniger Übung\nweniger Streit zu Hause | Lücken fallen später auf' },
  },
  infobox: {
    group: 'basic', label: 'Infokasten',
    purpose: 'Hebt Merksätze, Definitionen und Tipps farbig hervor.',
    syntax: 'Überschrift optional. Im Text gehen Zeilenumbrüche, Formeln zwischen Dollarzeichen sowie **fett** und *kursiv*.',
    example: '**Dichte** = Masse : Volumen, also $rho = m / V$.',
    solution: SAME,
    sample: { title: 'Merke', text: 'Die Dichte gibt an, wie schwer ein Kubikzentimeter eines Stoffes ist:\n$rho = m / V$' },
  },
  // -------------------------------------------------------------- Aufgaben
  choice: {
    group: 'exercise', label: 'Multiple-Choice',
    purpose: 'Eine Frage mit Antworten zum Ankreuzen; mehrere richtige Antworten sind möglich.',
    syntax: 'Jede Antwort steht in einem eigenen Feld; der Haken davor markiert die richtigen.',
    solution: 'Die richtigen Antworten sind angekreuzt und hervorgehoben.',
    sample: {
      text: 'Welche Stoffe schwimmen in Wasser?',
      options: [{ text: 'Holz', correct: true }, { text: 'Eisen', correct: false }, { text: 'Eis', correct: true }, { text: 'Glas', correct: false }],
    },
  },
  cloze: {
    group: 'exercise', label: 'Lückentext',
    purpose: 'Ein Text mit Lücken zum Ausfüllen, auf Wunsch mit gemischtem Wortspeicher darüber.',
    syntax: 'Lücken stehen in doppelten eckigen Klammern. Gelten mehrere Antworten als richtig, trennen Sie sie mit |; in den Wortspeicher kommt die erste.',
    example: 'Wasser [[verdunstet]] und bildet [[Wolken|Wolke]].',
    solution: 'Die Lücken sind mit der Antwort gefüllt; mehrere richtige Antworten stehen durch / getrennt.',
    sample: { text: 'Die Sonne erwärmt das Meer, und das Wasser [[verdunstet]]. In der Höhe kühlt der Wasserdampf ab und [[kondensiert]] zu [[Wolken|Wolke]]. Als [[Niederschlag]] fällt es zurück auf die Erde.' },
  },
  sorting: {
    group: 'exercise', label: 'Sortieraufgabe',
    purpose: 'Schritte oder Ereignisse in die richtige Reihenfolge bringen; auf dem Blatt erscheinen sie gemischt mit Kästchen zum Nummerieren.',
    syntax: 'Die Einträge in der RICHTIGEN Reihenfolge eintragen, einer pro Zeile. Lineatur mischt sie selbst; „Neu mischen“ ergibt eine andere Anordnung.',
    example: 'Wasser erhitzen\nTeebeutel hineinhängen\nfünf Minuten warten',
    solution: 'In den Kästchen steht die richtige Nummer.',
    sample: { text: 'Bringe die Schritte des Versuchs in die richtige Reihenfolge.', items: 'Becherglas mit Wasser füllen\nWasser mit dem Brenner erhitzen\nTemperatur jede Minute ablesen\nMesswerte in die Tabelle eintragen' },
  },
  matching: {
    group: 'exercise', label: 'Wörter zuordnen',
    purpose: 'Begriffe links und rechts durch Linien verbinden, etwa Vokabeln oder Begriff und Erklärung.',
    syntax: 'Ein Paar pro Zeile, links und rechts mit = getrennt. Die rechte Seite erscheint gemischt.',
    example: 'Hund = dog\nKatze = cat',
    solution: 'Die richtigen Verbindungslinien sind eingezeichnet.',
    sample: { text: 'Verbinde jedes Tier mit seiner Gruppe.', pairs: 'Forelle = Fisch\nFrosch = Lurch\nAmsel = Vogel\nEidechse = Reptil' },
  },
  cycle: {
    group: 'exercise', label: 'Kreislauf',
    purpose: 'Kästchen auf einem Kreis, durch Pfeile verbunden, etwa Wasser- oder Stoffkreisläufe.',
    syntax: 'Einträge im Uhrzeigersinn, oben beginnend, einer pro Zeile. [[Eintrag]] lässt das Kästchen zum Ausfüllen leer.',
    example: 'Verdunstung\n[[Kondensation]]\nNiederschlag\n[[Versickerung]]',
    solution: 'Die leeren Kästchen sind ausgefüllt.',
    sample: { text: 'Vervollständige den Wasserkreislauf.', items: 'Verdunstung\n[[Kondensation]]\nNiederschlag\n[[Versickerung]]' },
  },
  chain: {
    group: 'exercise', label: 'Reihenfolge (Pfeile)',
    purpose: 'Kästchen in einer Reihe, durch Pfeile verbunden, etwa Abläufe oder Nahrungsketten.',
    syntax: 'Einträge der Reihe nach, einer pro Zeile. [[Eintrag]] lässt das Kästchen leer; mit „Bausteine“ stehen die gesuchten Einträge gemischt darüber.',
    example: 'Gras\n[[Heuschrecke]]\nFrosch\n[[Storch]]',
    solution: 'Die leeren Kästchen sind ausgefüllt.',
    sample: { text: 'Vervollständige die Nahrungskette.', items: 'Gras\n[[Heuschrecke]]\nFrosch\n[[Storch]]' },
  },
  // ---------------------------------------------------------------- Rätsel
  wordsearch: {
    group: 'puzzle', label: 'Wortsuchrätsel',
    purpose: 'Wörter in einem Buchstabengitter finden.',
    syntax: 'Wörter durch Komma oder Zeilenumbruch trennen. Passen nicht alle hinein, nennt der Baustein sie oben in seinen Einstellungen; dann das Raster vergrößern oder neu mischen.',
    example: 'Sonne, Mond, Stern, Komet',
    solution: 'Die versteckten Wörter sind farbig markiert.',
    sample: { text: 'Finde die sechs Begriffe aus dem Weltall.', words: 'Sonne, Mond, Stern, Komet, Planet, Galaxie', size: 10 },
  },
  crossword: {
    group: 'puzzle', label: 'Kreuzworträtsel',
    purpose: 'Ein Kreuzworträtsel mit Hinweisen waagerecht und senkrecht, aus Ihrer Wortliste erzeugt.',
    syntax: 'Ein Wort pro Zeile, dahinter nach einem Doppelpunkt der Hinweis. Wörter, die sich mit keinem anderen kreuzen, nennt der Baustein in seinen Einstellungen.',
    example: 'MERKUR: Der sonnennächste Planet\nMARS: Der rote Planet',
    solution: 'Alle Felder sind ausgefüllt.',
    sample: { text: 'Löse das Planetenrätsel.', entries: 'MERKUR: Der sonnennächste Planet\nVENUS: Der hellste Planet am Nachthimmel\nERDE: Unser Heimatplanet\nMARS: Der rote Planet\nJUPITER: Der größte Planet\nSATURN: Der Planet mit den auffälligsten Ringen' },
  },
  anagram: {
    group: 'puzzle', label: 'Anagramm',
    purpose: 'Wörter mit vertauschten Buchstaben, die richtig geschrieben werden sollen.',
    syntax: 'Wörter durch Komma oder Zeilenumbruch trennen; Lineatur vertauscht die Buchstaben.',
    example: 'Apfel, Birne, Pflaume',
    solution: 'Die richtigen Wörter stehen in den Lücken.',
    sample: { text: 'Wie heißen die Monate richtig?', words: 'Januar, Februar, Oktober, Dezember' },
  },
  // ------------------------------------------------------------------ MINT
  arithmetic: {
    group: 'mint', label: 'Rechenaufgaben',
    purpose: 'Erzeugt Übungsaufgaben zu den vier Grundrechenarten.',
    syntax: '„Von“ und „Bis“ begrenzen die Zahlen, mit denen gerechnet wird, nicht die Ergebnisse. Divisionen gehen immer auf; dort liegen Teiler und Ergebnis im Bereich. „Neue Aufgaben“ würfelt andere Zahlen.',
    solution: 'Die Ergebnisse stehen in den Lücken.',
    sample: { text: 'Rechne im Kopf.', ops: ['*', '/'], min: 2, max: 10, count: 12, columns: 3 },
  },
  formula: {
    group: 'mint', label: 'Formel',
    purpose: 'Eine abgesetzte Formel in schönem Formelsatz.',
    syntax: 'Typst-Mathematik oder gängiges LaTeX. Brüche als (a)/(b) oder \\frac{a}{b}, Wurzeln als sqrt(x), Hochzahlen mit ^. Eine Formel mit Fehler erscheint als einfacher Text.',
    example: 'x = (-b plus.minus sqrt(b^2 - 4 a c)) / (2 a)',
    solution: SAME,
    sample: { formula: 'x_(1,2) = (-b plus.minus sqrt(b^2 - 4 a c)) / (2 a)' },
  },
  function: {
    group: 'mint', label: 'Funktionsgraph',
    purpose: 'Koordinatensystem mit Funktionsgraphen, Punkten und Figuren, auf Wunsch auf Kästchenpapier.',
    syntax: 'Eine Funktion pro Zeile mit Dezimalkomma, Malpunkt optional. Punkte als A(1|2), einer pro Zeile. x- und y-Bereich legen den Ausschnitt fest.',
    example: 'f(x) = 0,5x^2 - 1\ng(x) = sin(x)',
    solution: 'Mit „Graphen: nur auf dem Lösungsblatt“ sehen die Schülerinnen und Schüler ein leeres Koordinatensystem und zeichnen selbst.',
    sample: { text: 'Zeichne die Graphen in das Koordinatensystem.', fns: 'f(x) = 0,5x^2 - 1\ng(x) = -x + 2', xmin: -4, xmax: 4, ymin: -3, ymax: 6, showGraphs: 'solution' },
  },
  valuetable: {
    group: 'mint', label: 'Wertetabelle',
    purpose: 'Eine Wertetabelle zu einer Funktion, zum Ausfüllen oder vorgegeben.',
    syntax: 'Funktion wie beim Funktionsgraphen, x-Werte durch Semikolon getrennt.',
    example: 'f(x) = 2x + 1\n-2; -1; 0; 1; 2',
    solution: 'Bei „zum Ausfüllen“ stehen die y-Werte auf dem Lösungsblatt.',
    sample: { text: 'Vervollständige die Wertetabelle.', fn: 'f(x) = x^2 - 3', xs: '-3; -2; -1; 0; 1; 2; 3', mode: 'blank' },
  },
  tree: {
    group: 'mint', label: 'Baumdiagramm',
    purpose: 'Baumdiagramme für mehrstufige Zufallsversuche, mit Pfadwahrscheinlichkeiten.',
    syntax: 'Jeder Ast steht in einer eigenen Zeile als „Beschriftung: Wahrscheinlichkeit“. Äste der nächsten Stufe rücken Sie mit Leerzeichen ein. Brüche werden beim Multiplizieren gekürzt.',
    example: 'rot: 2/5\n  rot: 1/4\n  blau: 3/4\nblau: 3/5\n  rot: 2/4\n  blau: 2/4',
    solution: 'Kästchen zum Ausfüllen und Pfadwahrscheinlichkeiten „zum Berechnen“ sind ausgefüllt.',
    sample: { text: 'In einer Urne liegen 2 rote und 3 blaue Kugeln. Es wird zweimal ohne Zurücklegen gezogen.', spec: 'rot: 2/5\n  rot: 1/4\n  blau: 3/4\nblau: 3/5\n  rot: 2/4\n  blau: 2/4', showProbs: 'always', showPaths: 'solution' },
  },
  code: {
    group: 'mint', label: 'Quellcode',
    purpose: 'Programmcode mit Syntaxhervorhebung und Zeilennummern.',
    syntax: 'Sprache wählen und den Code einfügen; Einrückungen bleiben erhalten.',
    solution: SAME,
    sample: { lang: 'python', code: 'zahlen = [3, 1, 4, 1, 5]\nsumme = 0\nfor z in zahlen:\n    summe += z\nprint(summe)' },
  },
};
