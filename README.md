# PDF attachments Edge

PDF-Anhänge für Microsoft Edge: eingebettete Dateien neben dem bisherigen PDF-Viewer anzeigen und über ihre Windows-Zuordnung öffnen.

[Installationspaket herunterladen](https://github.com/mkozlowski75/PDF-attachments-Edge/releases/latest) · [MIT-Lizenz für eigenen Code](LICENSE)

Version 1.2.0 · Windows · geprüft mit Microsoft Edge 157

Nach „Netzwerkzugriff aktivieren“ startet die Seitenleiste automatisch neu und untersucht die aktuelle Netzwerk-PDF. Der Windows-Helfer aus Version 1.1.0 kann weiterverwendet werden.

Die Erweiterung ergänzt eine Seitenleiste neben dem eingebauten Edge-PDF-Viewer. Sie listet eingebettete Dateien mit ihrem Dateinamen, ihrer Größe und einer gegebenenfalls vorhandenen Beschreibung auf. Eine Vorschau wird nicht erzeugt. Das Hauptdokument, die Windows-PDF-Zuordnung und die Einstellungen des PDF-Viewers bleiben unverändert.

## Sprachen

Die Erweiterung unterstützt Deutsch, Englisch und Polnisch. Die Oberfläche, Hilfetexte, Passwortdialoge, Statusmeldungen und Erweiterungsbeschreibung richten sich automatisch nach der Anzeigesprache von Edge. Regionale Varianten wie en-US und pl-PL verwenden die jeweilige Übersetzung; für nicht unterstützte Sprachen wird Deutsch verwendet. Dateinamen und Beschreibungen aus der PDF werden unverändert angezeigt. Der optionale Windows-Helfer und seine Installation bleiben verwendbar.

Zum Prüfen aller drei Oberflächensprachen in getrennten temporären Edge-Profilen: `npm run test:locales:edge`. Das normale Edge-Profil wird nicht verändert.

## Installation

1. Das ZIP-Paket vollständig an einen dauerhaften Ort entpacken. Den Ordner anschließend nicht verschieben oder löschen, solange die Erweiterung verwendet wird.
2. In Edge `edge://extensions` öffnen.
3. **Entwicklermodus** einschalten und **Entpackte Erweiterung laden** wählen.
4. Den Unterordner **Erweiterung** auswählen. Beim direkten Klonen dieses Repositorys heißt er **extension**. Darin liegt `manifest.json`.
5. Bei **PDF-Anhänge für Edge** die **Details** öffnen und **Zugriff auf Datei-URLs zulassen** aktivieren. Das ist für die automatische Erkennung lokaler PDFs nötig. Ohne diese Freigabe funktioniert die ausdrückliche Auswahl über **PDF auswählen**.
6. Im Erweiterungsmenü die Erweiterung bei Bedarf an die Symbolleiste anheften.

Die Erweiterung ist ein lokal installierbares Entwicklungspaket und noch nicht im Microsoft-Store veröffentlicht. In verwalteten Firmenprofilen kann die Installation durch eine Richtlinie gesperrt sein. Lokale/Web-PDFs funktionieren ohne zusätzliches Windows-Programm. Für die automatische Untersuchung von UNC-Netzwerk-PDFs ist einmalig der optionale Windows-Helfer einzurichten; dafür sind keine Administratorrechte erforderlich.

## Netzwerkfreigaben automatisch untersuchen

1. Den Windows-Netzwerk-Helfer entpacken und für die lokale Fassung **Installieren.cmd** starten. Für die spätere Store-Fassung **Installieren-mit-ID.cmd** verwenden und die genaue Store-Erweiterungs-ID eintragen.
2. Die aktualisierte Erweiterung in Edge neu laden. Der Zugriff auf Datei-URLs muss erlaubt sein.
3. Eine PDF auf einer Netzwerkfreigabe öffnen und in der Seitenleiste einmal **Netzwerkzugriff aktivieren** wählen. Die optionale Windows-Anbindung wird nur nach dieser ausdrücklichen Freigabe verwendet.
4. Anschließend wird die aktuelle UNC-PDF automatisch gelesen und untersucht, ohne sie bei jedem Dokument erneut auszuwählen.

Der Helfer liest ausschließlich UNC-PDF-Dateien mit den Windows-Rechten des angemeldeten Benutzers. Er speichert keine PDF-Kopie, verändert keine Dateien und stellt keine allgemeine Befehls- oder Dateischnittstelle bereit. Details stehen in **native/README.txt** im Quellpaket. Ohne Helfer kann weiterhin jede PDF ausdrücklich ausgewählt werden.

## Verwendung

1. Eine PDF wie bisher im Edge-Viewer öffnen.
2. Auf das Erweiterungssymbol klicken oder **Alt+Umschalt+A** drücken. Die Seitenleiste zeigt die zum aktuellen Dokument gehörenden Anhänge.
3. Beim gewünschten Anhang **Bereitstellen** wählen. Edge speichert eine Kopie unter `Downloads/PDF-Anhaenge/<Dokumentkennung>/`.
4. Sobald **Öffnen** erscheint, darauf klicken. Edge übergibt die Datei zum Öffnen. Eine Rückfrage von Edge gegebenenfalls selbst bestätigen. Für eine fehlende Dateizuordnung kann Windows die Auswahl einer Anwendung anbieten.

Die zwei Schritte sind absichtlich getrennt: Edge erlaubt das Öffnen nur unmittelbar als Benutzeraktion und erst nach Abschluss des Downloads. Die Erweiterung öffnet keine Anhänge automatisch. Die Windows-Zuordnung des jeweiligen Dateityps entscheidet über das Zielprogramm; ein eingebetteter PDF-Anhang kann deshalb wieder in Edge landen. **Im Ordner anzeigen** öffnet den Speicherort. Die gespeicherten Kopien bleiben erhalten und können später dort gelöscht werden.

Bei **?** ist die Untersuchung fehlgeschlagen oder unvollständig. Das bedeutet ausdrücklich nicht, dass keine Anhänge vorhanden sind. **0** erscheint erst nach einer erfolgreichen Untersuchung ohne gefundene eingebettete Dateien.

## Dokumentzugriff und Grenzen

- Lokale PDF-Adressen und gewöhnliche HTTP-/HTTPS-Adressen werden automatisch erkannt. Bei Webadressen ohne `.pdf` hilft **Aktuellen Tab prüfen**; neue PDF-Antworten werden zusätzlich anhand ihres Inhaltstyps erkannt.
- Bei Portalen mit Einmal-Links, POST-Antworten, temporären `blob:`-Adressen oder PDFs innerhalb einer Webseite die PDF herunterladen und **PDF auswählen** verwenden. Auch das Ablegen einer PDF in der Seitenleiste ist möglich. Die angezeigte Dokumentquelle ist maßgeblich.
- Eine manuell ausgewählte PDF wird nur diesem Tab zugeordnet. Ein Wechsel zu einem anderen Tab entfernt die bisherige Liste. Beim Neuladen wird die PDF erneut untersucht.
- Für verschlüsselte PDFs kann die Seitenleiste das Dokumentpasswort anfordern. Es wird nicht gespeichert. DRM-/Purview-geschützte Dokumente werden nicht umgangen.
- Maximal 100 MB pro Haupt-PDF und pro Anhang, 200 MB für alle extrahierten Anhänge zusammen. Auch sehr komplexe oder beschädigte PDFs können mit einer Fehlermeldung abgelehnt werden.
- Es werden eingebettete Dateispezifikationen im erreichbaren PDF-Objektbaum berücksichtigt, einschließlich Namensbaum, Seitenanmerkungen und Associated Files (AF). Verweise auf externe Dateien werden nicht geöffnet oder als eingebettete Inhalte ausgegeben.
- Nicht unter Windows oder mit allen historischen Edge-Versionen geprüft; empfohlen ist die aktuelle Edge-Version.

## Daten und Berechtigungen

Die PDF-Verarbeitung findet lokal mit einer mitgelieferten Kopie von Mozillas PDF.js statt. Es gibt keine Anmeldung, Telemetrie oder Übertragung an einen Analysedienst. Für eine Web-PDF ruft die Erweiterung die Dokumentadresse mit der vorhandenen Browsersitzung separat ab. Dies kann eine weitere Anfrage an das jeweilige Portal auslösen.

- **Seitenleiste:** Anzeige neben dem vorhandenen Viewer.
- **Tabs:** Zuordnung der Liste zum aktiven Dokument.
- **Datei-/Webzugriff und webRequest:** Lesen der ausgewählten PDF sowie Erkennen des PDF-Inhaltstyps. Es werden keine Skripte in Webseiten eingebunden und keine PDF-Antworten umgeleitet.
- **storage:** Die erkannte PDF-Adresse wird vorübergehend für den betreffenden Tab in der Browsersitzung gehalten; keine dauerhafte Ablage der PDF oder ihrer Passwörter.
- **downloads / downloads.open:** Bereitstellen und ausdrücklich angefordertes Öffnen. Die Erweiterung hebt keine Edge-Prüfungen für Downloads auf.
- **nativeMessaging (optional):** Nach ausdrücklicher Freigabe die aktuelle UNC-PDF über den einmalig installierten Windows-Helfer einlesen. Die Daten werden über lokale Prozess-Pipes übertragen; beim Lesen der Freigabe kann ein weiterer SMB-Zugriff mit der üblichen Windows-Authentifizierung erfolgen. PDF-Passwörter werden nicht an den Helfer übertragen.

Ungeeignete Windows-Dateinamen werden ausschließlich für die gespeicherte Kopie angepasst. Der ursprüngliche Name bleibt in der Liste sichtbar. Bereits vorhandene Dateien werden nicht überschrieben.

## Deinstallation

Unter `edge://extensions` die Erweiterung entfernen. Anschließend kann der entpackte Programmordner gelöscht werden. Bereits bereitgestellte Kopien im Downloadordner werden nicht automatisch gelöscht. Der bisherige Edge-PDF-Viewer bleibt weiter verfügbar.

Falls der Windows-Helfer eingerichtet wurde: Mit **Entfernen.cmd** seine Edge-Registrierung aufheben. Die eigenen Helferdateien bleiben erhalten und können anschließend gesondert gelöscht werden. Es werden keine PDFs oder Downloadkopien durch dieses Programm gelöscht.

## Quellcode und Prüfung

Im Quellpaket:

```text
npm ci --ignore-scripts
npm run build
npm run fixtures
npm test
npm run test:edge
```

Der gebündelte PDF.js-Code ist im Repository enthalten. Für eine Installation direkt aus dem Repository genügt der Ordner **extension**. Den optionalen Windows-Helfer aus dem Release herunterladen oder mit `npm run build:native` selbst erstellen. Die Installationsprogramme liegen nach dem Build in **native/bin**; die genau passende Erweiterungs-ID wird beim Installieren freigegeben.

Für ein Store-Paket nach den Builds `npm run build:native` und `npm run build:store` ausführen. Die Ausgaben liegen unter **dist**. Die noch fehlenden öffentlichen Herausgeber-, Kontakt-, Datenschutz- und Helfer-Downloadangaben in **store/publisher.json** vor einer Store-Einreichung vervollständigen. Dieses Repository ist keine Store-Veröffentlichung.

Node.js 24 und Edge unter Windows werden für den vollständigen Test benötigt. `test:edge` startet ein eigenes temporäres Entwicklerprofil, lädt nur synthetische Test-PDFs und führt einen ausdrücklich gekennzeichneten Öffnungstest für einen harmlosen Textanhang aus. Der tatsächliche Start der Windows-Anwendung nach einer etwaigen Edge-Rückfrage muss zusätzlich sichtbar bestätigt werden. Das normale Edge-Profil wird nicht verwendet.

Die PDF.js-Version ist fest gebunden. `scripts/build.mjs` ergänzt ausschließlich lesend die Erkennung von Dateispezifikationen außerhalb des Namensbaums und begrenzt die dekodierte Anhangsgröße. Die Anpassung wird nur angewendet, wenn die erwartete Bibliotheksstelle exakt übereinstimmt; bei einem Versionswechsel bricht der Build zur Überprüfung ab. Die Apache-2.0-Lizenz und die ursprünglichen Bibliothekskommentare bleiben enthalten.

## Quellen

- [Microsoft: Erweiterungen für die Edge-Seitenleiste](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/sidebar)
- [Chromium: Downloads-Schnittstelle](https://developer.chrome.com/docs/extensions/reference/api/downloads)
- [Mozilla PDF.js](https://github.com/mozilla/pdf.js)
