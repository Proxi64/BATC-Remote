using System.Diagnostics;
using System.Net.Sockets;

namespace BatcRemote.Host;

/// <summary>
/// BATC Remote — local web host with an icon in the notification area.
///
/// Serves the web app (embedded in the exe) to phones and tablets on the local network.
/// The phone then connects DIRECTLY to BeyondATC (ws://&lt;address&gt;:&lt;port&gt;, 41716 by default):
/// this host does not relay the ATC traffic.
///
/// Options:
///   --port 8741         listening port (takes priority over the settings)
///   --webroot &lt;dir&gt;     serves this folder instead of the embedded app (development)
/// </summary>
internal static class Program
{
    public const string MutexName = @"Local\BatcRemote.Host";

    /// <summary>Current settings (replaced as a whole when saved: reading is thread-safe).</summary>
    public static volatile AppSettings Settings = new();

    [STAThread]
    private static int Main(string[] args)
    {
        // A single instance at a time. After a restart requested from the settings,
        // the new instance waits for the old one to finish.
        using var mutex = new Mutex(initiallyOwned: false, MutexName);
        if (!TryAcquire(mutex, TimeSpan.FromSeconds(args.Contains("--restart") ? 8 : 0)))
        {
            MessageBox.Show("BATC Remote is already running.\nIts icon is in the notification area (near the clock).",
                "BATC Remote", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 0;
        }

        try
        {
            ApplicationConfiguration.Initialize();
            Settings = AppSettings.Load();

            var port = ReadIntArg(args, "--port") ?? Settings.ListenPort;
            WebServer server;
            try
            {
                server = WebServer.Start(port, () => Settings, ReadArg(args, "--webroot"));
            }
            catch (Exception ex) when (IsAddressInUse(ex))
            {
                MessageBox.Show($"Port {port} is already used by another application.\n\n"
                                + "Choose another port in the BATC Remote settings,\nor run: BatcRemote.exe --port 8742",
                    "BATC Remote", MessageBoxButtons.OK, MessageBoxIcon.Error);
                // Let the user fix the port without editing any file.
                using var form = new SettingsForm(Settings.Clone(), portError: true);
                if (form.ShowDialog() == DialogResult.OK)
                {
                    form.Result.Save();
                    Restart();
                }
                return 1;
            }
            catch (Exception ex)
            {
                MessageBox.Show("Unable to start the server:\n\n" + ex.Message,
                    "BATC Remote", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }

            using (server)
            using (var tray = new TrayContext(server))
            {
                Application.Run(tray);
            }
            return 0;
        }
        finally
        {
            mutex.ReleaseMutex();
        }
    }

    /// <summary>Starts a new instance (it waits for this one to exit) — the caller must then quit.</summary>
    public static void Restart()
    {
        try
        {
            Process.Start(new ProcessStartInfo(Environment.ProcessPath!, "--restart") { UseShellExecute = false });
        }
        catch (Exception ex)
        {
            MessageBox.Show("Unable to restart BATC Remote: " + ex.Message + "\nPlease start it again manually.",
                "BATC Remote", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private static bool TryAcquire(Mutex mutex, TimeSpan timeout)
    {
        try { return mutex.WaitOne(timeout); }
        catch (AbandonedMutexException) { return true; } // previous instance killed: the mutex is ours
    }

    private static string? ReadArg(string[] args, string name)
    {
        var i = Array.IndexOf(args, name);
        return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
    }

    private static int? ReadIntArg(string[] args, string name)
        => int.TryParse(ReadArg(args, name), out var p) && p is > 0 and < 65536 ? p : null;

    private static bool IsAddressInUse(Exception ex)
    {
        for (var e = ex; e != null; e = e.InnerException)
        {
            if (e is SocketException { SocketErrorCode: SocketError.AddressAlreadyInUse }) return true;
            if (e is IOException && e.Message.Contains("address already in use", StringComparison.OrdinalIgnoreCase)) return true;
        }
        return false;
    }
}
