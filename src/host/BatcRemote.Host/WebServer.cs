using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Reflection;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;

namespace BatcRemote.Host;

/// <summary>Kestrel server that serves the web app (embedded in the exe) on every network interface.</summary>
internal sealed class WebServer : IDisposable
{
    private readonly WebApplication _app;

    public int Port { get; }
    public string Version { get; }
    public bool HasApp { get; }

    private WebServer(WebApplication app, int port, string version, bool hasApp)
    {
        _app = app;
        Port = port;
        Version = version;
        HasApp = hasApp;
    }

    /// <param name="settings">Read on every request: a change of BeyondATC address/port applies without a restart.</param>
    /// <param name="webRootOverride">Folder served instead of the embedded app (development: --webroot).</param>
    public static WebServer Start(int port, Func<AppSettings> settings, string? webRootOverride)
    {
        var baseDir = AppContext.BaseDirectory;
        var version = Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "0.0.0";

        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { ContentRootPath = baseDir });
        builder.Logging.ClearProviders();
        builder.WebHost.ConfigureKestrel(k => k.ListenAnyIP(port));

        // The app is embedded in the exe (wwwroot folder of the project, built by npm run build).
        IFileProvider files = webRootOverride is not null && Directory.Exists(webRootOverride)
            ? new PhysicalFileProvider(Path.GetFullPath(webRootOverride))
            : new ManifestEmbeddedFileProvider(typeof(WebServer).Assembly, "wwwroot");
        builder.Environment.WebRootFileProvider = files;

        var app = builder.Build();

        var contentTypes = new FileExtensionContentTypeProvider();
        contentTypes.Mappings[".webmanifest"] = "application/manifest+json";

        var staticOptions = new StaticFileOptions
        {
            FileProvider = files,
            ContentTypeProvider = contentTypes,
            OnPrepareResponse = ctx =>
            {
                // Files under /assets have a hash in their name: they can be cached forever.
                // Everything else (index.html, manifest) is always re-checked to pick up updates.
                var path = ctx.Context.Request.Path.Value ?? "";
                ctx.Context.Response.Headers.CacheControl = path.StartsWith("/assets/", StringComparison.OrdinalIgnoreCase)
                    ? "public, max-age=31536000, immutable"
                    : "no-cache";
            },
        };
        app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = files });
        app.UseStaticFiles(staticOptions);

        // Configuration read by the app on the phone at startup (where to find BeyondATC).
        app.MapGet("/api/config", (HttpContext http) =>
        {
            http.Response.Headers.CacheControl = "no-store";
            // Readable by the Android app too (its page is not served by this PC). Read-only, non-sensitive data.
            http.Response.Headers.AccessControlAllowOrigin = "*";
            var s = settings();
            return Results.Json(new { batcHost = s.BatcHost, batcPort = s.BatcPort, version });
        });

        // Diagnostics: does BeyondATC respond?
        app.MapGet("/api/status", async () =>
        {
            var s = settings();
            return Results.Json(new
            {
                app = "BATC Remote",
                version,
                batcHost = s.BatcHostForLocalCheck,
                batcPort = s.BatcPort,
                batcReachable = await IsBatcRunningAsync(s.BatcHostForLocalCheck, s.BatcPort),
            });
        });

        // Unknown route → the app (single page).
        app.MapFallbackToFile("index.html", staticOptions);

        // Run on the thread pool: no deadlock possible with the WinForms synchronization context.
        Task.Run(() => app.StartAsync()).GetAwaiter().GetResult();
        return new WebServer(app, port, version, files.GetFileInfo("index.html").Exists);
    }

    /// <summary>Addresses to open on the phone (real LAN first).</summary>
    public IReadOnlyList<string> GetUrls()
    {
        var urls = GetLanAddresses().Select(ip => $"http://{ip}:{Port}/").ToList();
        if (urls.Count == 0) urls.Add($"http://localhost:{Port}/");
        return urls;
    }

    public static async Task<bool> IsBatcRunningAsync(string host, int port)
    {
        try
        {
            using var client = new TcpClient();
            using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(800));
            await client.ConnectAsync(host.Trim('[', ']'), port, cts.Token);
            return true;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>Local IPv4 addresses, the ones with a gateway (real network) first.</summary>
    private static IEnumerable<IPAddress> GetLanAddresses()
    {
        return NetworkInterface.GetAllNetworkInterfaces()
            .Where(n => n.OperationalStatus == OperationalStatus.Up
                        && n.NetworkInterfaceType is not (NetworkInterfaceType.Loopback or NetworkInterfaceType.Tunnel))
            .SelectMany(n =>
            {
                var props = n.GetIPProperties();
                var hasGateway = props.GatewayAddresses.Any(g => g.Address.AddressFamily == AddressFamily.InterNetwork
                                                                 && !g.Address.Equals(IPAddress.Any));
                return props.UnicastAddresses
                    .Where(a => a.Address.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(a.Address)
                                // 169.254.x.x = no DHCP address, unreachable
                                && !a.Address.ToString().StartsWith("169.254.", StringComparison.Ordinal))
                    .Select(a => (a.Address, hasGateway));
            })
            .OrderByDescending(x => x.hasGateway)
            .Select(x => x.Address)
            .Distinct();
    }

    public void Dispose()
    {
        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
            var token = cts.Token;
            Task.Run(() => _app.StopAsync(token)).GetAwaiter().GetResult();
        }
        catch { /* shutting down */ }
        ((IDisposable)_app).Dispose();
    }
}
