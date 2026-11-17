Windows-Helfer – Version 1.1.0

Aufgabe
Automatisches, ausschließlich lesendes Einlesen der aktuellen UNC-PDF für die
Edge-Seitenleiste. Browser, PDF-Viewer und Windows-Dateizuordnungen bleiben
erhalten. Der Helfer startet nur bei einer konkreten Anfrage aus der ausdrücklich
freigegebenen Erweiterung. Es gibt keinen Dienst und keinen lokalen Webserver.

Einrichtung
1. Windows-Helfer-Paket entpacken.
2. Für die bestehende lokale Erweiterung Installieren.cmd ausführen.
3. Für die spätere Store-Version die vom Store vergebene Erweiterungs-ID über
   Installieren-mit-ID.cmd eintragen. Es werden keine Wildcard-IDs erlaubt.
4. In Edge die aktualisierte Erweiterung neu laden. In der Seitenleiste einmal
   Netzwerkzugriff aktivieren. Datei-URL-Zugriff muss ebenfalls erlaubt sein.
5. Eine PDF wie bisher über file://server/freigabe/...pdf öffnen. Die Untersuchung
   erfolgt automatisch beim Öffnen der Seitenleiste bzw. Wechsel des aktiven Tabs.

Der Installer verwendet nur LocalAppData/PDF-Anhaenge-Edge/Netzwerk-Helfer und
HKCU/Software/Microsoft/Edge/NativeMessagingHosts/de.pdfanhaenge.network_reader.
Administratorrechte sind nicht erforderlich. Es wird .NET Framework 4.8 benötigt,
das auf aktuellen Windows-10-/11-Systemen üblicherweise vorhanden ist.

Abgrenzung
Nur absolute file-UNC-Adressen mit Server, Freigabe und .pdf-Dateinamen werden
akzeptiert. Laufwerks-, Geräte-, Pipe-/IPC-, ADS- und reservierte Gerätepfade
werden abgewiesen. Die URL wird genau einmal dekodiert und anschließend der
kanonische Pfad geprüft. Ein PDF-Dateikopf ist ebenfalls erforderlich.
Windows-Dateirechte werden nicht erweitert oder umgangen.

Grenzen und Protokoll
100 MiB pro PDF, ein begrenzter Native-Messaging-Prozess je Lesevorgang und eine
harte Laufzeitgrenze von 25 Sekunden. begin(size), fortlaufende Base64-Blöcke bis
64 KiB Nutzdaten und end(total,chunks); jede Nachricht liegt unter 1 MiB.
Auch die Erweiterung prüft Reihenfolge, Länge, Gesamtgröße und PDF-Dateikopf.
Bei Tabwechsel wird der Port getrennt. Unvollständige Daten ergeben einen Fehler
und niemals einen vermeintlich erfolgreichen Null-Anhangs-Befund.

Datenschutz
Adresse und PDF-Inhalt werden ausschließlich lokal zwischen Edge und dem Helfer
übertragen. Das Lesen von einer Netzwerkfreigabe erfolgt über Windows und kann
eine weitere SMB-Anfrage/Authentifizierung beim betreffenden Server auslösen.
Der Helfer legt keine PDF-Kopie oder Passwörter auf der Festplatte ab. Die
normale Bereitstellung ausgewählter Anhänge im Downloadordner erfolgt weiterhin
durch die Erweiterung auf Nutzerwunsch.

Entfernen
Entfernen.cmd hebt die Registrierung des Helfers für Edge auf. Die eigenen
Installationsdateien bleiben erhalten und können danach bei Bedarf manuell
gelöscht werden. PDFs und bereitgestellte Anhänge werden nicht gelöscht.

Build und Lizenz
npm run build:native nutzt den Windows-.NET-Framework-C#-Compiler. Der eigene
Helfercode steht unter MIT; er enthält keine PDF-Bibliothek. PDF.js verbleibt in
der Erweiterung unter Apache 2.0.
