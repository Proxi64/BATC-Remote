using System.Diagnostics;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;

namespace BatcRemote.Host;

/// <summary>
/// Icon in the notification area: address to open, QR code, BeyondATC status,
/// Windows auto-start, quit.
/// </summary>
internal sealed class TrayContext : ApplicationContext
{
    private readonly WebServer _server;
    private readonly NotifyIcon _tray;
    private readonly Icon _baseIcon;
    private readonly Icon _iconOk;
    private readonly Icon _iconWaiting;
    private readonly ToolStripMenuItem _batcStatus;
    private readonly ToolStripMenuItem _addressItem;
    private readonly ToolStripMenuItem _autoStart;
    private readonly System.Windows.Forms.Timer _timer;
    private QrForm? _qrForm;
    private SettingsForm? _settingsForm;
    private bool? _batcRunning;
    private bool _checking;

    public TrayContext(WebServer server)
    {
        _server = server;
        _baseIcon = LoadAppIcon();
        _iconOk = WithBadge(_baseIcon, Color.FromArgb(79, 191, 136));
        _iconWaiting = WithBadge(_baseIcon, Color.FromArgb(224, 169, 74));

        var header = new ToolStripMenuItem($"BATC Remote v{server.Version}") { Enabled = false };
        _addressItem = new ToolStripMenuItem("", null, (_, _) => CopyAddress());
        _batcStatus = new ToolStripMenuItem("BeyondATC: checking…") { Enabled = false };
        _autoStart = new ToolStripMenuItem("Launch at Windows startup", null, (_, _) => ToggleAutoStart())
        {
            Checked = AutoStart.IsEnabled(),
        };

        var menu = new ContextMenuStrip();
        menu.Items.AddRange(new ToolStripItem[]
        {
            header,
            new ToolStripMenuItem("Unofficial tool, not supported by BeyondATC") { Enabled = false },
            new ToolStripSeparator(),
            new ToolStripMenuItem("Show QR code…", null, (_, _) => ShowQr()) { Font = new Font(SystemFonts.MenuFont ?? Control.DefaultFont, FontStyle.Bold) },
            _addressItem,
            new ToolStripMenuItem("Open on this PC", null, (_, _) => OpenInBrowser()),
            new ToolStripSeparator(),
            _batcStatus,
            new ToolStripSeparator(),
            new ToolStripMenuItem("Settings…", null, (_, _) => ShowSettings()),
            _autoStart,
            new ToolStripMenuItem("Quit", null, (_, _) => ExitThread()),
        });
        // The IP can change (Wi-Fi reconnection): refresh when the menu opens.
        menu.Opening += (_, _) => RefreshAddress();

        _tray = new NotifyIcon
        {
            Icon = _iconWaiting,
            ContextMenuStrip = menu,
            Visible = true,
        };
        _tray.MouseClick += (_, e) => { if (e.Button == MouseButtons.Left) ShowQr(); };

        RefreshAddress();

        if (!server.HasApp)
        {
            _tray.ShowBalloonTip(8000, "BATC Remote", "The web app is missing from this executable: rebuild it with build.ps1.", ToolTipIcon.Error);
        }
        else
        {
            _tray.ShowBalloonTip(5000, "BATC Remote is ready",
                $"On your phone, open {PrimaryUrl}\nClick the icon to show the QR code.", ToolTipIcon.Info);
        }

        _timer = new System.Windows.Forms.Timer { Interval = 4000 };
        _timer.Tick += async (_, _) => await CheckBatcAsync();
        _timer.Start();
        _ = CheckBatcAsync();
    }

    private string PrimaryUrl => _server.GetUrls()[0];

    private void RefreshAddress()
    {
        _addressItem.Text = $"Copy address: {PrimaryUrl}";
        UpdateTooltip();
    }

    private void UpdateTooltip()
    {
        var status = _batcRunning switch { true => "BeyondATC detected", false => "BeyondATC not detected", _ => "…" };
        var text = $"BATC Remote — {PrimaryUrl}\n{status}";
        // NotifyIcon.Text is limited to 127 characters.
        _tray.Text = text.Length > 127 ? text[..127] : text;
    }

    private async Task CheckBatcAsync()
    {
        if (_checking) return;
        _checking = true;
        try
        {
            var s = Program.Settings;
            var running = await WebServer.IsBatcRunningAsync(s.BatcHostForLocalCheck, s.BatcPort);
            var target = BatcTargetLabel(s);
            _batcStatus.Text = running ? $"BeyondATC: detected ✔{target}" : $"BeyondATC: not detected{target}";
            if (running == _batcRunning) return;
            _batcRunning = running;
            _tray.Icon = running ? _iconOk : _iconWaiting;
            UpdateTooltip();
        }
        finally
        {
            _checking = false;
        }
    }

    /// <summary>" (192.168.1.30:41716)" when the target is not the default one.</summary>
    private static string BatcTargetLabel(AppSettings s)
    {
        if (string.IsNullOrEmpty(s.BatcHost) && s.BatcPort == AppSettings.DefaultBatcPort) return "";
        return $" ({(string.IsNullOrEmpty(s.BatcHost) ? "this PC" : s.BatcHost)}:{s.BatcPort})";
    }

    private void ShowSettings()
    {
        if (_settingsForm is { IsDisposed: false })
        {
            _settingsForm.Activate();
            return;
        }
        using var form = _settingsForm = new SettingsForm(Program.Settings);
        var result = form.ShowDialog();
        _settingsForm = null;
        if (result != DialogResult.OK) return;

        var next = form.Result;
        try
        {
            next.Save();
        }
        catch (Exception ex)
        {
            MessageBox.Show("Unable to save the settings:\n" + ex.Message, "BATC Remote",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        Program.Settings = next;          // BeyondATC address/port: applied immediately (phones re-read /api/config)
        _batcRunning = null;
        _ = CheckBatcAsync();

        if (next.ListenPort != _server.Port)
        {
            var answer = MessageBox.Show(
                $"The web page port changes to {next.ListenPort}.\nBATC Remote must restart. Restart now?",
                "BATC Remote", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
            if (answer == DialogResult.Yes)
            {
                Program.Restart();
                ExitThread();
            }
        }
        else
        {
            _tray.ShowBalloonTip(3000, "Settings saved",
                "Phones will use the new BeyondATC address on their next connection (or when the page is reloaded).", ToolTipIcon.Info);
        }
    }

    private void ShowQr()
    {
        if (_qrForm is { IsDisposed: false })
        {
            _qrForm.Activate();
            return;
        }
        _qrForm = new QrForm(_server.GetUrls(), _baseIcon);
        _qrForm.Show();
        _qrForm.Activate();
    }

    private void CopyAddress()
    {
        try
        {
            Clipboard.SetText(PrimaryUrl);
            _tray.ShowBalloonTip(2000, "Address copied", PrimaryUrl, ToolTipIcon.None);
        }
        catch { /* clipboard busy */ }
    }

    private void OpenInBrowser()
    {
        try { Process.Start(new ProcessStartInfo($"http://localhost:{_server.Port}/") { UseShellExecute = true }); }
        catch { /* no default browser */ }
    }

    private void ToggleAutoStart()
    {
        var enable = !_autoStart.Checked;
        try
        {
            AutoStart.Set(enable);
            _autoStart.Checked = AutoStart.IsEnabled();
        }
        catch (Exception ex)
        {
            MessageBox.Show("Unable to change the Windows startup setting:\n" + ex.Message, "BATC Remote",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    protected override void ExitThreadCore()
    {
        _timer.Stop();
        _tray.Visible = false;
        _qrForm?.Close();
        _settingsForm?.Close();
        base.ExitThreadCore();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _timer.Dispose();
            _tray.Dispose();
            _iconOk.Dispose();
            _iconWaiting.Dispose();
            _baseIcon.Dispose();
        }
        base.Dispose(disposing);
    }

    // ---------- icons ----------

    public static Icon LoadAppIcon()
    {
        using var stream = typeof(TrayContext).Assembly.GetManifestResourceStream("BatcRemote.app.ico");
        return stream != null ? new Icon(stream) : (Icon)SystemIcons.Application.Clone();
    }

    /// <summary>Icon with a status dot in the bottom-right corner (green = BeyondATC detected).</summary>
    private static Icon WithBadge(Icon source, Color color)
    {
        var size = SystemInformation.SmallIconSize.Width <= 16 ? 32 : SystemInformation.SmallIconSize.Width * 2;
        using var sized = new Icon(source, size, size);
        using var bmp = sized.ToBitmap();
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            var d = size * 0.46f;
            var rect = new RectangleF(size - d - 0.5f, size - d - 0.5f, d, d);
            using var outline = new SolidBrush(Color.FromArgb(16, 20, 27));
            g.FillEllipse(outline, RectangleF.Inflate(rect, size * 0.06f, size * 0.06f));
            using var fill = new SolidBrush(color);
            g.FillEllipse(fill, rect);
        }
        var handle = bmp.GetHicon();
        try
        {
            using var tmp = Icon.FromHandle(handle);
            return (Icon)tmp.Clone(); // the copy owns its own resources
        }
        finally
        {
            DestroyIcon(handle);
        }
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool DestroyIcon(IntPtr hIcon);
}
