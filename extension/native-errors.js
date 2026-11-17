import { t } from "./i18n.js";

// Auch der bereits installierte Helfer aus Version 1.1.0 bleibt verwendbar.
// Seine bekannten Meldungen werden hier ohne Änderung des Protokolls übersetzt.
const nativeMessages = new Map([
  [
    "Ungültige PDF-Adresse.",
    "errorNetworkPath"
  ],
  [
    "Der Windows-Helfer liest nur PDF-Dateien auf Netzwerkfreigaben.",
    "errorNetworkPath"
  ],
  [
    "Gerätepfade sind nicht erlaubt.",
    "errorNetworkPath"
  ],
  [
    "Ungültiger Netzwerkpfad.",
    "errorNetworkPath"
  ],
  [
    "Netzwerkserver, Freigabe und PDF-Dateiname sind erforderlich.",
    "errorNetworkPath"
  ],
  [
    "IPC- und Pipe-Freigaben sind nicht erlaubt.",
    "errorNetworkPath"
  ],
  [
    "Ungültiger Bestandteil im Netzwerkpfad.",
    "errorNetworkPath"
  ],
  [
    "Der Windows-Helfer liest ausschließlich Dateien mit der Endung .pdf.",
    "errorNetworkPath"
  ],
  [
    "Die Netzwerk-PDF ist leer oder größer als 100 MB.",
    "errorNetworkSize"
  ],
  [
    "Die Netzwerkdatei enthält keinen PDF-Dateikopf.",
    "errorNetworkHeader"
  ],
  [
    "Die Netzwerk-PDF wurde während des Lesens verändert oder ist zu groß.",
    "errorNetworkChanged"
  ],
  [
    "Die Netzwerk-PDF wurde während des Lesens verändert.",
    "errorNetworkChanged"
  ],
  [
    "Die Netzwerk-PDF wurde nicht gefunden. Bitte die Freigabe und die Adresse prüfen.",
    "errorNetworkNotFound"
  ],
  [
    "Der Zugriff auf die Netzwerk-PDF oder diese Helferinstallation wurde nicht erlaubt.",
    "errorNetworkDenied"
  ],
  [
    "Der Netzwerkpfad ist für dieses Windows-System zu lang.",
    "errorNetworkPathLong"
  ],
  [
    "Die Netzwerk-PDF konnte nicht vollständig gelesen werden. Bitte die Verbindung zur Freigabe prüfen.",
    "errorNetworkIo"
  ]
]);

export function localizeNativeError(message) {
  return t(nativeMessages.get(message) || "errorNetworkRead");
}
