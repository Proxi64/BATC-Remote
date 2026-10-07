using System.Text.Json;

namespace BatcRemote.Host;

/// <summary>
/// BATC Remote settings, stored in %AppData%\BATC Remote\settings.json.
/// </summary>
internal sealed class AppSettings
{
    public const int DefaultBatcPort = 41716;
    public const int DefaultListenPort = 8741;

    /// <summary>Address of the PC running BeyondATC. Empty = this PC (automatic).</summary>
    public string BatcHost { get; set; } = "";

    /// <summary>BeyondATC WebSocket port.</summary>
    public int BatcPort { get; set; } = DefaultBatcPort;

    /// <summary>Port on which BATC Remote serves the app to the phones.</summary>
    public int ListenPort { get; set; } = DefaultListenPort;

    public static string FilePath { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "BATC Remote", "settings.json");

    private static readonly JsonSerializerOptions Json = new() { WriteIndented = true };

    public static AppSettings Load()
    {
        try
        {
            if (File.Exists(FilePath))
            {
                var s = JsonSerializer.Deserialize<AppSettings>(File.ReadAllText(FilePath)) ?? new AppSettings();
                return s.Normalized();
            }
        }
        catch
        {
            // Corrupted file: defaults are used.
        }
        return new AppSettings();
    }

    public void Save()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
        File.WriteAllText(FilePath, JsonSerializer.Serialize(Normalized(), Json));
    }

    public AppSettings Normalized()
    {
        BatcHost = (BatcHost ?? "").Trim();
        if (BatcPort is < 1 or > 65535) BatcPort = DefaultBatcPort;
        if (ListenPort is < 1 or > 65535) ListenPort = DefaultListenPort;
        return this;
    }

    public AppSettings Clone() => new() { BatcHost = BatcHost, BatcPort = BatcPort, ListenPort = ListenPort };

    /// <summary>Address used by this PC to check whether BeyondATC responds.</summary>
    public string BatcHostForLocalCheck => string.IsNullOrWhiteSpace(BatcHost) ? "127.0.0.1" : BatcHost;

    /// <summary>Accepts an IPv4/IPv6 address or a machine name; empty = automatic.</summary>
    public static bool IsValidHost(string host)
    {
        host = host.Trim();
        if (host.Length == 0) return true;
        if (host.Contains("://") || host.Contains('/') || host.Contains(' ')) return false;
        return Uri.CheckHostName(host.Trim('[', ']')) != UriHostNameType.Unknown;
    }
}
