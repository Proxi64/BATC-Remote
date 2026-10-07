namespace BatcRemote.Host;

/// <summary>Settings window: BeyondATC address and port, web page port.</summary>
internal sealed class SettingsForm : Form
{
    private static readonly Color Bg = Color.FromArgb(22, 27, 36);
    private static readonly Color Field = Color.FromArgb(16, 20, 27);
    private static readonly Color Fg = Color.FromArgb(233, 238, 245);
    private static readonly Color Muted = Color.FromArgb(149, 163, 184);
    private static readonly Color Ok = Color.FromArgb(79, 191, 136);
    private static readonly Color Bad = Color.FromArgb(216, 98, 98);
    private static readonly Color Accent = Color.FromArgb(94, 143, 208);

    private readonly TextBox _host;
    private readonly NumericUpDown _batcPort;
    private readonly NumericUpDown _listenPort;
    private readonly Label _testResult;
    private readonly Label _error;
    private readonly Button _test;

    public AppSettings Result { get; private set; }

    public SettingsForm(AppSettings current, bool portError = false)
    {
        Result = current.Clone();
        Text = "BATC Remote — Settings";
        Icon = TrayContext.LoadAppIcon();
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        ShowInTaskbar = true;
        BackColor = Bg;
        ForeColor = Fg;
        Font = new Font("Segoe UI", 10f);
        AutoScaleMode = AutoScaleMode.Dpi;
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        Padding = new Padding(20, 16, 20, 16);

        var root = new TableLayoutPanel
        {
            ColumnCount = 1,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Dock = DockStyle.Fill,
        };

        // ---- BeyondATC ----
        root.Controls.Add(SectionTitle("BeyondATC"));
        root.Controls.Add(FieldLabel("IP address of the PC running BeyondATC"));
        _host = new TextBox
        {
            Text = current.BatcHost,
            PlaceholderText = "Automatic (this PC)",
            Width = 380,
            BackColor = Field,
            ForeColor = Fg,
            BorderStyle = BorderStyle.FixedSingle,
            Font = new Font("Consolas", 11f),
            Margin = new Padding(0, 2, 0, 2),
        };
        root.Controls.Add(_host);
        root.Controls.Add(Hint("Leave empty if BeyondATC runs on this PC (usual case)."));

        root.Controls.Add(FieldLabel("BeyondATC port"));
        var portRow = new FlowLayoutPanel { AutoSize = true, WrapContents = false, Margin = new Padding(0) };
        _batcPort = PortBox(current.BatcPort);
        _test = new Button { Text = "Test", AutoSize = true, FlatStyle = FlatStyle.Flat, BackColor = Field, ForeColor = Fg, Margin = new Padding(10, 0, 0, 0) };
        _test.FlatAppearance.BorderColor = Color.FromArgb(46, 55, 70);
        _test.Click += async (_, _) => await TestAsync();
        _testResult = new Label { AutoSize = true, ForeColor = Muted, Margin = new Padding(10, 6, 0, 0) };
        portRow.Controls.AddRange(new Control[] { _batcPort, _test, _testResult });
        root.Controls.Add(portRow);
        root.Controls.Add(Hint($"Default: {AppSettings.DefaultBatcPort}."));

        // ---- BATC Remote ----
        root.Controls.Add(SectionTitle("BATC Remote"));
        root.Controls.Add(FieldLabel("Web page port (opened on the phone)"));
        _listenPort = PortBox(current.ListenPort);
        root.Controls.Add(_listenPort);
        root.Controls.Add(Hint($"Default: {AppSettings.DefaultListenPort}. Changing it restarts BATC Remote,\nand phones must use the new address (QR code)."));

        _error = new Label { AutoSize = true, ForeColor = Bad, Margin = new Padding(0, 8, 0, 0), Visible = false };
        root.Controls.Add(_error);
        if (portError) ShowError($"Port {current.ListenPort} is already in use: choose another one.");

        // ---- buttons ----
        var buttons = new FlowLayoutPanel
        {
            AutoSize = true,
            FlowDirection = FlowDirection.RightToLeft,
            Dock = DockStyle.Fill,
            Margin = new Padding(0, 18, 0, 0),
        };
        var save = new Button { Text = "Save", AutoSize = true, FlatStyle = FlatStyle.Flat, BackColor = Accent, ForeColor = Color.White, Padding = new Padding(10, 2, 10, 2) };
        save.FlatAppearance.BorderSize = 0;
        save.Click += (_, _) => SaveAndClose();
        var cancel = new Button { Text = "Cancel", AutoSize = true, FlatStyle = FlatStyle.Flat, BackColor = Field, ForeColor = Fg, DialogResult = DialogResult.Cancel, Padding = new Padding(10, 2, 10, 2) };
        cancel.FlatAppearance.BorderColor = Color.FromArgb(46, 55, 70);
        var defaults = new Button { Text = "Restore defaults", AutoSize = true, FlatStyle = FlatStyle.Flat, BackColor = Bg, ForeColor = Muted, Margin = new Padding(0, 3, 40, 3) };
        defaults.FlatAppearance.BorderSize = 0;
        defaults.Click += (_, _) =>
        {
            _host.Text = "";
            _batcPort.Value = AppSettings.DefaultBatcPort;
            _listenPort.Value = AppSettings.DefaultListenPort;
            _error.Visible = false;
            _testResult.Text = "";
        };
        buttons.Controls.AddRange(new Control[] { save, cancel, defaults });
        root.Controls.Add(buttons);

        Controls.Add(root);
        AcceptButton = save;
        CancelButton = cancel;
    }

    private void SaveAndClose()
    {
        var host = _host.Text.Trim();
        if (!AppSettings.IsValidHost(host))
        {
            ShowError("Invalid address. Example: 192.168.1.20 (no http:// and no port).");
            _host.Focus();
            return;
        }
        Result = new AppSettings
        {
            BatcHost = host,
            BatcPort = (int)_batcPort.Value,
            ListenPort = (int)_listenPort.Value,
        }.Normalized();
        DialogResult = DialogResult.OK;
        Close();
    }

    private async Task TestAsync()
    {
        var host = _host.Text.Trim();
        if (!AppSettings.IsValidHost(host)) { ShowError("Invalid address."); return; }
        _error.Visible = false;
        _test.Enabled = false;
        _testResult.ForeColor = Muted;
        _testResult.Text = "Testing…";
        var target = string.IsNullOrEmpty(host) ? "127.0.0.1" : host;
        var ok = await WebServer.IsBatcRunningAsync(target, (int)_batcPort.Value);
        _testResult.ForeColor = ok ? Ok : Bad;
        _testResult.Text = ok ? "✔ BeyondATC responds" : "✖ No response";
        _test.Enabled = true;
    }

    private void ShowError(string text)
    {
        _error.Text = text;
        _error.Visible = true;
    }

    private static NumericUpDown PortBox(int value) => new()
    {
        Minimum = 1,
        Maximum = 65535,
        Value = Math.Clamp(value, 1, 65535),
        Width = 110,
        BackColor = Field,
        ForeColor = Fg,
        BorderStyle = BorderStyle.FixedSingle,
        Font = new Font("Consolas", 11f),
        Margin = new Padding(0, 2, 0, 2),
    };

    private static Label SectionTitle(string text) => new()
    {
        Text = text.ToUpperInvariant(),
        AutoSize = true,
        ForeColor = Muted,
        Font = new Font("Segoe UI", 9f, FontStyle.Bold),
        Margin = new Padding(0, 12, 0, 6),
    };

    private static Label FieldLabel(string text) => new()
    {
        Text = text,
        AutoSize = true,
        ForeColor = Fg,
        Margin = new Padding(0, 6, 0, 2),
    };

    private static Label Hint(string text) => new()
    {
        Text = text,
        AutoSize = true,
        ForeColor = Muted,
        Font = new Font("Segoe UI", 8.5f),
        Margin = new Padding(0, 0, 0, 4),
    };
}
