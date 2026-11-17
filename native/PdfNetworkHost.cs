// MIT License – eigener Code von PDF-Anhänge für Edge.
// Der Host liest ausschließlich PDF-Dateien über kanonische UNC-Pfade. Er bietet
// keine Befehlsausführung, Schreiboperationen oder allgemeine Dateischnittstelle.
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using Microsoft.Win32;

internal static class PdfNetworkHost
{
    private const string HostName = "de.pdfanhaenge.network_reader";
    private const string ManifestName = HostName + ".json";
    private const string RegistryPath = @"Software\Microsoft\Edge\NativeMessagingHosts\" + HostName;
    private const int MaximumBytes = 100 * 1024 * 1024;
    private const int ChunkBytes = 65536;
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 1024 * 1024, RecursionLimit = 16 };
    private static readonly UTF8Encoding Utf8 = new UTF8Encoding(false, true);

    private static int Main(string[] args)
    {
        // Installationsbefehle sind ausschließlich explizite CLI-Aufrufe. Eine
        // Native-Messaging-Anfrage kann diese Argumente nicht setzen.
        if (args.Length > 0 && args[0] == "--install") return Install(args);
        if (args.Length > 0 && args[0] == "--uninstall") return Uninstall();
        if (args.Length == 0 || !Regex.IsMatch(args[0], @"\Achrome-extension://[a-p]{32}/\z"))
        {
            Console.Error.WriteLine("Aufruf über Edge oder mit --install EXTENSION-ID bzw. --uninstall.");
            return 2;
        }
        try
        {
            VerifyOrigin(args[0]);
            // SMB-Öffnen kann unter .NET Framework nicht zuverlässig über ein
            // CancellationToken beendet werden. Der Prozess hat daher eine harte
            // Laufzeitgrenze; die Erweiterung trennt zusätzlich ihren Port.
            using (var deadline = new Timer(delegate { Environment.Exit(12); }, null, 25000, Timeout.Infinite))
            using (var input = Console.OpenStandardInput())
            using (var output = Console.OpenStandardOutput())
            {
                try
                {
                    var request = ReadRequest(input);
                    if (request == null) return 0;
                    if (request.Count != 2 || !request.ContainsKey("command") || !request.ContainsKey("url") ||
                        !(request["command"] is string) || (string)request["command"] != "readPdf" || !(request["url"] is string))
                        throw new InvalidDataException("Der Windows-Helfer akzeptiert ausschließlich readPdf-Anfragen.");
                    ReadPdf(ValidateNetworkPath((string)request["url"]), output);
                    return 0;
                }
                catch (Exception error)
                {
                    var message = SafeMessage(error);
                    WriteMessage(output, new { type = "error", message = message });
                    return 1;
                }
            }
        }
        catch (Exception error)
        {
            // Auf stdout dürfen ausschließlich Native-Messaging-Rahmen stehen.
            Console.Error.WriteLine(SafeMessage(error));
            return 2;
        }
    }

    private static void VerifyOrigin(string origin)
    {
        var manifestPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, ManifestName);
        var manifest = Json.DeserializeObject(File.ReadAllText(manifestPath, Utf8)) as Dictionary<string, object>;
        if (manifest == null || !manifest.ContainsKey("name") || (string)manifest["name"] != HostName || !manifest.ContainsKey("allowed_origins"))
            throw new UnauthorizedAccessException("Die Installation des Windows-Helfers ist unvollständig.");
        var allowed = manifest["allowed_origins"] as object[];
        if (allowed == null) throw new UnauthorizedAccessException("Keine Erweiterungs-ID freigegeben.");
        foreach (var item in allowed)
            if (item is string && String.Equals((string)item, origin, StringComparison.Ordinal)) return;
        throw new UnauthorizedAccessException("Diese Erweiterungs-ID ist für den Windows-Helfer nicht freigegeben.");
    }

    private static Dictionary<string, object> ReadRequest(Stream input)
    {
        var header = new byte[4];
        var first = input.Read(header, 0, 4);
        if (first == 0) return null;
        ReadRemaining(input, header, first, 4 - first);
        var length = BitConverter.ToInt32(header, 0);
        if (length < 2 || length > 32768) throw new InvalidDataException("Ungültige Anfragelänge.");
        var bytes = new byte[length];
        ReadRemaining(input, bytes, 0, length);
        var request = Json.DeserializeObject(Utf8.GetString(bytes)) as Dictionary<string, object>;
        if (request == null) throw new InvalidDataException("Ungültige Anfrage.");
        return request;
    }

    private static void ReadRemaining(Stream stream, byte[] buffer, int offset, int count)
    {
        while (count > 0)
        {
            var read = stream.Read(buffer, offset, count);
            if (read == 0) throw new EndOfStreamException("Die Anfrage wurde nicht vollständig übertragen.");
            offset += read;
            count -= read;
        }
    }

    private static string ValidateNetworkPath(string value)
    {
        if (String.IsNullOrEmpty(value) || value.Length > 16384) throw new InvalidDataException("Ungültige PDF-Adresse.");
        Uri uri;
        if (!Uri.TryCreate(value, UriKind.Absolute, out uri) || !uri.IsFile || !uri.IsUnc ||
            !String.IsNullOrEmpty(uri.Query) || !String.IsNullOrEmpty(uri.Fragment) || !String.IsNullOrEmpty(uri.UserInfo))
            throw new InvalidDataException("Der Windows-Helfer liest nur PDF-Dateien auf Netzwerkfreigaben.");
        // LocalPath dekodiert die URL einmal. Niemals anschließend erneut
        // UnescapeDataString anwenden oder einen ungeprüften Roh-URL-Präfix öffnen.
        var local = uri.LocalPath.Replace('/', '\\');
        if (!local.StartsWith(@"\\", StringComparison.Ordinal) || local.StartsWith(@"\\?\", StringComparison.Ordinal) || local.StartsWith(@"\\.\", StringComparison.Ordinal))
            throw new InvalidDataException("Gerätepfade sind nicht erlaubt.");
        var canonical = Path.GetFullPath(local);
        if (!canonical.StartsWith(@"\\", StringComparison.Ordinal) || canonical.StartsWith(@"\\?\", StringComparison.Ordinal) || canonical.StartsWith(@"\\.\", StringComparison.Ordinal))
            throw new InvalidDataException("Ungültiger Netzwerkpfad.");
        var parts = canonical.Substring(2).Split('\\');
        if (parts.Length < 3 || !Regex.IsMatch(parts[0], @"\A[a-zA-Z0-9][a-zA-Z0-9._-]*\z") || parts[0].EndsWith(".", StringComparison.Ordinal))
            throw new InvalidDataException("Netzwerkserver, Freigabe und PDF-Dateiname sind erforderlich.");
        if (parts[1].Equals("PIPE", StringComparison.OrdinalIgnoreCase) || parts[1].Equals("IPC$", StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("IPC- und Pipe-Freigaben sind nicht erlaubt.");
        for (var i = 0; i < parts.Length; i++)
        {
            var part = parts[i];
            if (part.Length == 0 || part == "." || part == ".." || part.EndsWith(".", StringComparison.Ordinal) || part.EndsWith(" ", StringComparison.Ordinal) ||
                part.IndexOfAny(new[] { ':', '<', '>', '"', '|', '?', '*', '\0' }) >= 0 ||
                Regex.IsMatch(part, @"[\x00-\x1f\x7f]") || Regex.IsMatch(part, @"\A(CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|COM[0-9¹²³]|LPT[0-9¹²³]) *(\.|\z)", RegexOptions.IgnoreCase))
                throw new InvalidDataException("Ungültiger Bestandteil im Netzwerkpfad.");
        }
        if (!String.Equals(Path.GetExtension(canonical), ".pdf", StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("Der Windows-Helfer liest ausschließlich Dateien mit der Endung .pdf.");
        return canonical;
    }

    private static void ReadPdf(string path, Stream output)
    {
        // Nur lesend, mit den Rechten des angemeldeten Windows-Benutzers. Keine
        // temporäre Kopie, keine Suche in Freigaben und keine Schreiboperationen.
        using (var file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete, ChunkBytes, FileOptions.SequentialScan))
        {
            var size = file.Length;
            if (size < 5 || size > MaximumBytes) throw new InvalidDataException("Die Netzwerk-PDF ist leer oder größer als 100 MB.");
            var probe = new byte[(int)Math.Min(1024, size)];
            ReadRemaining(file, probe, 0, probe.Length);
            if (Encoding.ASCII.GetString(probe).IndexOf("%PDF-", StringComparison.Ordinal) < 0)
                throw new InvalidDataException("Die Netzwerkdatei enthält keinen PDF-Dateikopf.");
            file.Position = 0;
            WriteMessage(output, new { type = "begin", size = size });
            var buffer = new byte[ChunkBytes];
            long total = 0;
            var sequence = 0;
            for (;;)
            {
                var read = file.Read(buffer, 0, buffer.Length);
                if (read == 0) break;
                total += read;
                if (total > MaximumBytes || total > size) throw new InvalidDataException("Die Netzwerk-PDF wurde während des Lesens verändert oder ist zu groß.");
                WriteMessage(output, new { type = "chunk", sequence = sequence++, data = Convert.ToBase64String(buffer, 0, read) });
            }
            if (total != size || file.Length != size) throw new InvalidDataException("Die Netzwerk-PDF wurde während des Lesens verändert.");
            WriteMessage(output, new { type = "end", bytes = total, chunks = sequence });
        }
    }

    private static void WriteMessage(Stream output, object message)
    {
        var bytes = Utf8.GetBytes(Json.Serialize(message));
        if (bytes.Length > 1024 * 1024) throw new InvalidDataException("Die Antwort überschreitet die zulässige Größe.");
        var header = BitConverter.GetBytes(bytes.Length);
        output.Write(header, 0, header.Length);
        output.Write(bytes, 0, bytes.Length);
        output.Flush();
    }

    private static string SafeMessage(Exception error)
    {
        if (error is InvalidDataException) return error.Message;
        if (error is FileNotFoundException || error is DirectoryNotFoundException) return "Die Netzwerk-PDF wurde nicht gefunden. Bitte die Freigabe und die Adresse prüfen.";
        if (error is UnauthorizedAccessException) return "Der Zugriff auf die Netzwerk-PDF oder diese Helferinstallation wurde nicht erlaubt.";
        if (error is PathTooLongException) return "Der Netzwerkpfad ist für dieses Windows-System zu lang.";
        if (error is IOException) return "Die Netzwerk-PDF konnte nicht vollständig gelesen werden. Bitte die Verbindung zur Freigabe prüfen.";
        return "Der Windows-Helfer konnte die Anfrage nicht bearbeiten.";
    }

    private static int Install(string[] args)
    {
        try
        {
            if (args.Length == 1)
            {
                Console.Write("Erweiterungs-ID aus edge://extensions eingeben: ");
                args = new[] { "--install", Console.ReadLine() ?? "" };
            }
            var origins = new List<string>();
            var directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PDF-Anhaenge-Edge", "Netzwerk-Helfer");
            for (var i = 1; i < args.Length; i++)
            {
                if (!Regex.IsMatch(args[i], @"\A[a-p]{32}\z")) throw new ArgumentException("Ungültige Erweiterungs-ID.");
                origins.Add("chrome-extension://" + args[i] + "/");
            }
            if (origins.Count == 0) throw new ArgumentException("Bitte mindestens eine genaue Erweiterungs-ID angeben.");
            Directory.CreateDirectory(directory);
            var manifestPath = Path.Combine(directory, ManifestName);
            if (File.Exists(manifestPath))
            {
                var previous = Json.DeserializeObject(File.ReadAllText(manifestPath, Utf8)) as Dictionary<string, object>;
                var previousOrigins = previous != null && previous.ContainsKey("allowed_origins") ? previous["allowed_origins"] as object[] : null;
                if (previousOrigins != null) foreach (var item in previousOrigins)
                    if (item is string && Regex.IsMatch((string)item, @"\Achrome-extension://[a-p]{32}/\z") && !origins.Contains((string)item)) origins.Add((string)item);
            }
            var executable = Assembly.GetExecutingAssembly().Location;
            var destination = Path.Combine(directory, "PdfNetworkHost.exe");
            if (!String.Equals(Path.GetFullPath(executable), destination, StringComparison.OrdinalIgnoreCase)) File.Copy(executable, destination, true);
            var config = executable + ".config";
            if (File.Exists(config) && !String.Equals(config, destination + ".config", StringComparison.OrdinalIgnoreCase)) File.Copy(config, destination + ".config", true);
            var manifest = new { name = HostName, description = "Liest Netzwerk-PDFs fuer die Edge-Seitenleiste ausschliesslich lesend.", path = destination, type = "stdio", allowed_origins = origins.ToArray() };
            File.WriteAllText(manifestPath, Json.Serialize(manifest), Utf8);
            using (var key = Registry.CurrentUser.CreateSubKey(RegistryPath)) key.SetValue("", manifestPath, RegistryValueKind.String);
            Console.WriteLine("Der Netzwerk-Helfer wurde nur fuer den aktuellen Windows-Benutzer eingerichtet.");
            Console.WriteLine("Freigegebene Erweiterungs-IDs:");
            foreach (var origin in origins) Console.WriteLine(origin);
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine("Installation fehlgeschlagen: " + error.Message); return 1; }
    }

    private static int Uninstall()
    {
        try
        {
            // Nur die Registrierung dieser Integration entfernen. Keine PDFs,
            // Downloadkopien oder sonstigen Dateien des Nutzers löschen.
            Registry.CurrentUser.DeleteSubKey(RegistryPath, false);
            Console.WriteLine("Die Edge-Integration des Netzwerk-Helfers wurde entfernt. Installationsdateien bleiben erhalten.");
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine("Entfernen fehlgeschlagen: " + error.Message); return 1; }
    }
}
