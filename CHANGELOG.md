# Versionshinweise

## 1.1.1 – 17. November 2026

- Die Seitenleiste startet nach der optionalen Netzwerkfreigabe automatisch neu, damit Edge die Windows-Schnittstelle bereitstellt.
- Eine noch nicht gebundene Schnittstelle erhält einen verständlichen Hinweis zur Wiederherstellung.
- Automatische Untersuchung einer Netzwerk-PDF im normalen Edge-Profil vom Anwender bestätigt.
- 20 automatisierte Prüfungen bestanden; Wiederherstellung nach fehlender Schnittstelle zusätzlich im getrennten Edge-Testprofil geprüft. Der erstmalige Berechtigungsdialog ist in diesem automatisierten Test nicht abgedeckt.

## 1.1.0

- Optionaler Windows-Helfer zum automatischen Lesen von PDFs auf Netzwerkfreigaben.
- Ausschließlich lesender Zugriff, auf freigegebene Erweiterungs-IDs und UNC-PDF-Dateien begrenzt.

## 1.0.0

- Seitenleiste mit Namen, Größe und Beschreibung eingebetteter PDF-Dateien.
- Bereitstellen im Downloadordner und anschließendes Öffnen über die Windows-Dateizuordnung.
- Eigenen Code unter MIT veröffentlicht; PDF.js bleibt unter Apache 2.0 lizenziert.
