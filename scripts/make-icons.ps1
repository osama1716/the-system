$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$code = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class IconCut2 {
  static byte[] Read(Bitmap b, out int W, out int H) {
    W = b.Width; H = b.Height;
    BitmapData bd = b.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
    byte[] px = new byte[W * H * 4];
    Marshal.Copy(bd.Scan0, px, 0, px.Length);
    b.UnlockBits(bd);
    return px;
  }
  static Bitmap Write(byte[] px, int W, int H) {
    Bitmap b = new Bitmap(W, H, PixelFormat.Format32bppArgb);
    BitmapData bd = b.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
    Marshal.Copy(px, 0, bd.Scan0, px.Length);
    b.UnlockBits(bd);
    return b;
  }
  static void Flood(bool[] outside, Func<int, bool> passes, int W, int H) {
    var q = new Queue<int>();
    for (int x = 0; x < W; x++) { q.Enqueue(x); q.Enqueue((H - 1) * W + x); }
    for (int y = 0; y < H; y++) { q.Enqueue(y * W); q.Enqueue(y * W + W - 1); }
    while (q.Count > 0) {
      int p = q.Dequeue();
      if (outside[p] || !passes(p)) continue;
      outside[p] = true;
      int x = p % W, y = p / W;
      if (x > 0) q.Enqueue(p - 1); if (x < W - 1) q.Enqueue(p + 1);
      if (y > 0) q.Enqueue(p - W); if (y < H - 1) q.Enqueue(p + W);
    }
  }

  // A black backdrop, with the icon's own glow spilling onto it. Brightness
  // becomes the alpha, so the glow fades out instead of turning into a ring.
  public static Bitmap FromDark(string path, int lo, int hi) {
    int W, H; Bitmap src = new Bitmap(path); byte[] px = Read(src, out W, out H); src.Dispose();
    Func<int, int> val = (p) => Math.Max(px[p*4], Math.Max(px[p*4+1], px[p*4+2]));
    bool[] outside = new bool[W * H];
    Flood(outside, (p) => val(p) < hi, W, H);
    for (int p = 0; p < W * H; p++) {
      int i = p * 4;
      if (!outside[p]) { px[i+3] = 255; continue; }
      double a = Math.Max(0, Math.Min(1, (val(p) - lo) / (double)(hi - lo)));
      if (a <= 0.01) { px[i] = px[i+1] = px[i+2] = 0; px[i+3] = 0; continue; }
      px[i]   = (byte)Math.Min(255, px[i]   / a);
      px[i+1] = (byte)Math.Min(255, px[i+1] / a);
      px[i+2] = (byte)Math.Min(255, px[i+2] / a);
      px[i+3] = (byte)Math.Round(a * 255);
    }
    return Write(px, W, H);
  }

  // The grey-and-white chequerboard some tools draw instead of real
  // transparency: plain, light, colourless squares reachable from the border.
  public static Bitmap FromChecker(string path) {
    int W, H; Bitmap src = new Bitmap(path); byte[] px = Read(src, out W, out H); src.Dispose();
    Func<int, bool> plain = (p) => {
      int i = p * 4;
      int mx = Math.Max(px[i], Math.Max(px[i+1], px[i+2])), mn = Math.Min(px[i], Math.Min(px[i+1], px[i+2]));
      return mx - mn < 22 && mn > 110;
    };
    bool[] outside = new bool[W * H];
    Flood(outside, plain, W, H);
    for (int p = 0; p < W * H; p++) {
      int i = p * 4;
      px[i+3] = 255;
      if (outside[p]) { px[i] = px[i+1] = px[i+2] = 0; px[i+3] = 0; }
    }
    return Write(px, W, H);
  }


  // The same icon for a light background, in the brand mark's own colour:
  // every tone becomes a shade of the near-black ink the mark is drawn in on
  // light themes, light where the icon was light and near-black where it was
  // dark, so the drawing survives while the ivory stops disappearing.
  public static Bitmap ForLight(Bitmap b) {
    int W, H; byte[] px = Read(b, out W, out H);
    // The palest tone and the deepest, both from the mark.
    double lr = 116, lg = 99, lb = 74, dr = 18, dg = 15, db = 12;
    for (int p = 0; p < W * H; p++) {
      int i = p * 4;
      if (px[i+3] < 8) continue;
      double lum = (0.299 * px[i+2] + 0.587 * px[i+1] + 0.114 * px[i]) / 255.0;
      double t = Math.Max(0, Math.Min(1, 1 - lum));
      px[i]   = (byte)Math.Round(lb + (db - lb) * t);
      px[i+1] = (byte)Math.Round(lg + (dg - lg) * t);
      px[i+2] = (byte)Math.Round(lr + (dr - lr) * t);
    }
    return Write(px, W, H);
  }

  public static Bitmap Load(string path) { return new Bitmap(path); }

  public static Bitmap Fit(Bitmap b, int size, double pad) {
    int W, H; byte[] px = Read(b, out W, out H);
    int x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
      if (px[(y * W + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    int w = x1 - x0 + 1, h = y1 - y0 + 1, side = (int)(Math.Max(w, h) * (1 + pad * 2));
    Bitmap outb = new Bitmap(size, size, PixelFormat.Format32bppArgb);
    using (Graphics g = Graphics.FromImage(outb)) {
      g.InterpolationMode = InterpolationMode.HighQualityBicubic;
      g.PixelOffsetMode = PixelOffsetMode.HighQuality;
      g.CompositingQuality = CompositingQuality.HighQuality;
      g.Clear(Color.Transparent);
      double s = (double)size / side;
      float dw = (float)(w * s), dh = (float)(h * s);
      g.DrawImage(b, new RectangleF((size - dw) / 2f, (size - dh) / 2f, dw, dh), new RectangleF(x0, y0, w, h), GraphicsUnit.Pixel);
    }
    return outb;
  }
}
'@
Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing

$src = "C:\Users\osama\AppData\Local\Temp\claude\C--Users-osama--claude-sessions\374ab821-e5d3-453a-98f2-840f67adbc79\scratchpad\gpt"
$out = "C:\Users\osama\Downloads\the-system\assets\icons"
$map = [ordered]@{
  overview = @("19.png", "alpha"); quests = @("20.png", "alpha"); habits = @("21.png", "alpha");
  planner = @("22.png", "alpha"); stats = @("23.png", "alpha"); log = @("24.png", "checker");
  settings = @("25.png", "alpha"); admin = @("26.png", "dark"); friends = @("27.png", "dark");
  leaderboard = @("28.png", "dark"); intelligence = @("29.png", "dark")
}
foreach ($k in $map.Keys) {
  $file = Join-Path $src $map[$k][0]
  switch ($map[$k][1]) {
    "alpha"   { $cut = [IconCut2]::Load($file) }
    "checker" { $cut = [IconCut2]::FromChecker($file) }
    "dark"    { $cut = [IconCut2]::FromDark($file, 35, 105) }
  }
  $b = [IconCut2]::Fit($cut, 96, 0.03)
  $b.Save((Join-Path $out ("$k-96.png")), [System.Drawing.Imaging.ImageFormat]::Png)
  $b.Dispose()
  $inv = [IconCut2]::ForLight($cut)
  $b = [IconCut2]::Fit($inv, 96, 0.03)
  $b.Save((Join-Path $out ("$k-96-light.png")), [System.Drawing.Imaging.ImageFormat]::Png)
  $b.Dispose(); $inv.Dispose()
  $cut.Dispose()
}

$names = @($map.Keys)
$sheet = New-Object System.Drawing.Bitmap (($names.Count * 110 + 20), 330)
$g = [System.Drawing.Graphics]::FromImage($sheet)
$g.InterpolationMode = "HighQualityBicubic"
$g.Clear([System.Drawing.Color]::FromArgb(20, 17, 16))
$g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(244, 237, 226))), 0, 165, $sheet.Width, 165)
for ($i = 0; $i -lt $names.Count; $i++) {
  $small = [System.Drawing.Image]::FromFile((Join-Path $out ($names[$i] + "-96.png")))
  $lightv = [System.Drawing.Image]::FromFile((Join-Path $out ($names[$i] + "-96-light.png")))
  $x = 20 + $i * 110
  foreach ($row in 0, 165) {
    if ($row -eq 165) { $small = $lightv }
    $g.DrawImage($small, $x, $row + 12, 88, 88)
    $g.DrawImage($small, $x + 4, $row + 112, 26, 26)
    $g.DrawImage($small, $x + 40, $row + 110, 32, 32)
  }
  $small.Dispose()
}
$g.Dispose()
$sheet.Save("C:\Users\osama\AppData\Local\Temp\claude\C--Users-osama--claude-sessions\374ab821-e5d3-453a-98f2-840f67adbc79\scratchpad\gpt-sheet.png", [System.Drawing.Imaging.ImageFormat]::Png)
$sheet.Dispose()
"done"
