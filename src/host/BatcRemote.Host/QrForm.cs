using QRCoder;

namespace BatcRemote.Host;

/// <summary>Small window with the QR code to scan from the phone.</summary>
internal sealed class QrForm : Form
{
    private static readonly Color Bg = Color.FromArgb(16, 20, 27);
    private static readonly Color Fg = Color.FromArgb(233, 238, 245);
    private static readonly Color Muted = Color.FromArgb(149, 163, 184);

    private readonly PictureBox _picture;
    private readonly Label _url;
    private readonly IReadOnlyList<string> _urls;
    private int _index;

    public QrForm(IReadOnlyList<string> urls, Icon icon)
    {
        _urls = urls;
        Text = "BATC Remote";
        Icon = icon;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Bg;
        ForeColor = Fg;
        AutoScaleMode = AutoScaleMode.Dpi;
        ClientSize = new Size(360, urls.Count > 1 ? 484 : 450);
        TopMost = true;

        var title = new Label
        {
            Text = "Scan with your phone",
            Font = new Font("Segoe UI", 13f, FontStyle.Bold),
            AutoSize = false,
            TextAlign = ContentAlignment.MiddleCenter,
            Dock = DockStyle.Top,
            Height = 48,
        };

        _picture = new PictureBox
        {
            SizeMode = PictureBoxSizeMode.Zoom,
            BackColor = Color.White,
            Size = new Size(280, 280),
            Location = new Point(40, 52),
            Padding = new Padding(8),
        };

        _url = new Label
        {
            Font = new Font("Consolas", 12f, FontStyle.Bold),
            ForeColor = Color.FromArgb(159, 195, 245),
            AutoSize = false,
            TextAlign = ContentAlignment.MiddleCenter,
            Location = new Point(0, 340),
            Size = new Size(360, 28),
            Cursor = Cursors.Hand,
        };
        var tip = new ToolTip();
        tip.SetToolTip(_url, "Click to copy the address");
        _url.Click += (_, _) => { try { Clipboard.SetText(_urls[_index]); } catch { /* clipboard busy */ } };

        var hint = new Label
        {
            Text = "Same Wi-Fi as this PC. Then, in the browser:\n\"Add to Home screen\".",
            ForeColor = Muted,
            Font = new Font("Segoe UI", 9f),
            AutoSize = false,
            TextAlign = ContentAlignment.TopCenter,
            Location = new Point(10, 372),
            Size = new Size(340, 40),
        };

        var disclaimer = new Label
        {
            Text = "Unofficial community tool, unsupported.\nNot an official BeyondATC tool.",
            ForeColor = Muted,
            Font = new Font("Segoe UI", 8f, FontStyle.Italic),
            AutoSize = false,
            TextAlign = ContentAlignment.TopCenter,
            Location = new Point(10, urls.Count > 1 ? 450 : 414),
            Size = new Size(340, 30),
        };

        Controls.AddRange(new Control[] { title, _picture, _url, hint, disclaimer });

        // Several network cards (Ethernet + Wi-Fi, VPN…): let the user switch address.
        if (urls.Count > 1)
        {
            var next = new LinkLabel
            {
                Text = "Other network address →",
                LinkColor = Muted,
                ActiveLinkColor = Fg,
                AutoSize = false,
                TextAlign = ContentAlignment.MiddleCenter,
                Location = new Point(0, 420),
                Size = new Size(360, 24),
            };
            next.LinkClicked += (_, _) => { _index = (_index + 1) % _urls.Count; Render(); };
            Controls.Add(next);
        }

        Render();
    }

    private void Render()
    {
        var url = _urls[_index];
        _url.Text = url.TrimEnd('/');
        using var gen = new QRCodeGenerator();
        using var data = gen.CreateQrCode(url, QRCodeGenerator.ECCLevel.M);
        var png = new PngByteQRCode(data).GetGraphic(12);
        var old = _picture.Image;
        // GDI+ requires the stream to stay open as long as the bitmap lives: we make an independent copy.
        using (var ms = new MemoryStream(png))
        using (var decoded = new Bitmap(ms))
            _picture.Image = new Bitmap(decoded);
        old?.Dispose();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) _picture.Image?.Dispose();
        base.Dispose(disposing);
    }
}
