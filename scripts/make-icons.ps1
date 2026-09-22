$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$code = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class IconCut {
  // Makes the plain light background transparent: a flood from the border
  // through pixels close to the background colour, soft at the edge, with
  // the white fringe taken back out of the colour.
  public static Bitmap Cut(string path, int lo, int hi) {
    Bitmap src0 = new Bitmap(path);
    int W = src0.Width, H = src0.Height;
    Bitmap src = new Bitmap(W, H, PixelFormat.Format32bppArgb);
    using (Graphics g = Graphics.FromImage(src)) g.DrawImage(src0, 0, 0, W, H);
    src0.Dispose();
    BitmapData bd = src.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
    byte[] px = new byte[W * H * 4];
    Marshal.Copy(bd.Scan0, px, 0, px.Length);
    // Background: the average of the four corners.
    double br = 0, bg = 0, bb = 0; int n = 0;
    int[][] corners = { new[]{0,0}, new[]{W-12,0}, new[]{0,H-12}, new[]{W-12,H-12} };
    foreach (var c in corners) for (int y = c[1]; y < c[1] + 12; y++) for (int x = c[0]; x < c[0] + 12; x++) {
      int i = (y * W + x) * 4; bb += px[i]; bg += px[i+1]; br += px[i+2]; n++;
    }
    br /= n; bg /= n; bb /= n;
    float[] d = new float[W * H];
    for (int p = 0; p < W * H; p++) {
      int i = p * 4;
      d[p] = (float)Math.Max(Math.Abs(px[i+2] - br), Math.Max(Math.Abs(px[i+1] - bg), Math.Abs(px[i] - bb)));
    }
    bool[] outside = new bool[W * H];
    var q = new Queue<int>();
    for (int x = 0; x < W; x++) { q.Enqueue(x); q.Enqueue((H-1) * W + x); }
    for (int y = 0; y < H; y++) { q.Enqueue(y * W); q.Enqueue(y * W + W - 1); }
    while (q.Count > 0) {
      int p = q.Dequeue();
      if (outside[p]) continue;
      int ii = p * 4;
      int sat = Math.Max(px[ii], Math.Max(px[ii+1], px[ii+2])) - Math.Min(px[ii], Math.Min(px[ii+1], px[ii+2]));
      // A shadow is grey and may be darker; anything with colour stops sooner.
      if (d[p] >= (sat < 10 ? 70 : hi)) continue;
      outside[p] = true;
      int x = p % W, y = p / W;
      if (x > 0) q.Enqueue(p - 1); if (x < W - 1) q.Enqueue(p + 1);
      if (y > 0) q.Enqueue(p - W); if (y < H - 1) q.Enqueue(p + W);
    }
    // Background seen through the object (inside a frame): a large, plain,
    // near-background patch that the border flood could not reach.
    int[] comp = new int[W * H];
    for (int p = 0; p < W * H; p++) comp[p] = -1;
    Func<int, bool> bgLike = (p) => {
      int ii = p * 4;
      int sat = Math.Max(px[ii], Math.Max(px[ii+1], px[ii+2])) - Math.Min(px[ii], Math.Min(px[ii+1], px[ii+2]));
      return d[p] < (sat < 10 ? 70 : hi);
    };
    int label = 0;
    for (int s0 = 0; s0 < W * H; s0++) {
      if (outside[s0] || comp[s0] >= 0 || !bgLike(s0)) continue;
      var members = new List<int>(); double sum = 0;
      var st = new Stack<int>(); st.Push(s0); comp[s0] = label;
      while (st.Count > 0) {
        int p = st.Pop(); members.Add(p); sum += d[p];
        int x = p % W, y = p / W;
        int[] nb = { x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1 };
        foreach (int q2 in nb) if (q2 >= 0 && !outside[q2] && comp[q2] < 0 && bgLike(q2)) { comp[q2] = label; st.Push(q2); }
      }
      if (members.Count > W * H * 0.004 && sum / members.Count < 12) foreach (int p in members) outside[p] = true;
      label++;
    }
    // Specks: small pieces of the object left standing apart from it.
    int[] obj = new int[W * H];
    for (int p = 0; p < W * H; p++) obj[p] = -1;
    var pieces = new List<List<int>>();
    for (int s0 = 0; s0 < W * H; s0++) {
      if (outside[s0] || obj[s0] >= 0) continue;
      var members = new List<int>();
      var st = new Stack<int>(); st.Push(s0); obj[s0] = pieces.Count;
      while (st.Count > 0) {
        int p = st.Pop(); members.Add(p);
        int x = p % W, y = p / W;
        int[] nb = { x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1 };
        foreach (int q2 in nb) if (q2 >= 0 && !outside[q2] && obj[q2] < 0) { obj[q2] = pieces.Count; st.Push(q2); }
      }
      pieces.Add(members);
    }
    int biggest = 0; foreach (var pc in pieces) biggest = Math.Max(biggest, pc.Count);
    // A small piece goes; so does a middling one that is only background
    // colour (a patch of the backdrop the floods walled off), never a real
    // detail of the object such as the dot of the "!".
    foreach (var pc in pieces) {
      double md = 0; foreach (int p in pc) md += d[p]; md /= pc.Count;
      if (pc.Count < biggest * 0.01 || (pc.Count < biggest * 0.15 && md < 45)) foreach (int p in pc) outside[p] = true;
    }

    for (int p = 0; p < W * H; p++) {
      int i = p * 4;
      if (!outside[p]) { px[i+3] = 255; continue; }
      int sat2 = Math.Max(px[i], Math.Max(px[i+1], px[i+2])) - Math.Min(px[i], Math.Min(px[i+1], px[i+2]));
      if (sat2 < 24) {
        // Grey: a shadow on the white. Kept as a real shadow, dark and faint,
        // so it reads on a dark theme too instead of as a white haze.
        double lum = (px[i] + px[i+1] + px[i+2]) / 3.0, bgl = (br + bg + bb) / 3.0;
        double sa = Math.Max(0, Math.Min(1, (bgl - lum - 4) / 50.0)) * 0.5;
        px[i] = px[i+1] = px[i+2] = 0; px[i+3] = (byte)Math.Round(sa * 255);
        continue;
      }
      double a = d[p] <= lo ? 0 : Math.Min(1.0, (d[p] - lo) / (double)(hi - lo));
      if (a <= 0.004) { px[i] = px[i+1] = px[i+2] = 0; px[i+3] = 0; continue; }
      // Take the background back out: c = a*f + (1-a)*bg.
      px[i]   = (byte)Math.Max(0, Math.Min(255, (px[i]   - (1 - a) * bb) / a));
      px[i+1] = (byte)Math.Max(0, Math.Min(255, (px[i+1] - (1 - a) * bg) / a));
      px[i+2] = (byte)Math.Max(0, Math.Min(255, (px[i+2] - (1 - a) * br) / a));
      px[i+3] = (byte)Math.Round(a * 255);
    }
    Marshal.Copy(px, 0, bd.Scan0, px.Length);
    src.UnlockBits(bd);
    return src;
  }

  // Trim to what is drawn, square it with a little room, and scale.
  public static Bitmap Fit(Bitmap b, int size, double pad) {
    BitmapData bd = b.LockBits(new Rectangle(0, 0, b.Width, b.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
    byte[] px = new byte[b.Width * b.Height * 4];
    Marshal.Copy(bd.Scan0, px, 0, px.Length);
    b.UnlockBits(bd);
    int x0 = b.Width, y0 = b.Height, x1 = 0, y1 = 0;
    for (int y = 0; y < b.Height; y++) for (int x = 0; x < b.Width; x++) {
      if (px[(y * b.Width + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
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

$img = "C:\Users\osama\AppData\Local\Temp\claude\C--Users-osama--claude-sessions\374ab821-e5d3-453a-98f2-840f67adbc79\images"
$out = "C:\Users\osama\Downloads\the-system\assets\icons"
New-Item -ItemType Directory -Force $out | Out-Null
$map = [ordered]@{
  overview = "6.jpg"; quests = "2.jpg"; habits = "3.jpg"; planner = "7.jpg"; stats = "14.jpg";
  leaderboard = "13.jpg"; friends = "17.jpg"; intelligence = "16.jpg"; log = "15.jpg";
  settings = "4.jpg"; admin = "5.jpg"
}
foreach ($k in $map.Keys) {
  $cut = [IconCut]::Cut((Join-Path $img $map[$k]), 10, 34)
  foreach ($size in 96, 256) {
    $b = [IconCut]::Fit($cut, $size, 0.04)
    $b.Save((Join-Path $out ("$k-$size.png")), [System.Drawing.Imaging.ImageFormat]::Png)
    $b.Dispose()
  }
  $cut.Dispose()
  "$k done"
}

# A contact sheet on dark and light, at the sizes the app will use.
$names = @($map.Keys)
$sheet = New-Object System.Drawing.Bitmap (($names.Count * 110 + 20), 330)
$g = [System.Drawing.Graphics]::FromImage($sheet)
$g.InterpolationMode = "HighQualityBicubic"
$g.Clear([System.Drawing.Color]::FromArgb(20, 17, 16))
$g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(244, 237, 226))), 0, 165, $sheet.Width, 165)
for ($i = 0; $i -lt $names.Count; $i++) {
  $big = [System.Drawing.Image]::FromFile((Join-Path $out ($names[$i] + "-256.png")))
  $small = [System.Drawing.Image]::FromFile((Join-Path $out ($names[$i] + "-96.png")))
  $x = 20 + $i * 110
  foreach ($row in 0, 165) {
    $g.DrawImage($big, $x, $row + 12, 88, 88)
    $g.DrawImage($small, $x + 4, $row + 112, 26, 26)
    $g.DrawImage($small, $x + 40, $row + 110, 32, 32)
  }
  $big.Dispose(); $small.Dispose()
}
$g.Dispose()
$sheet.Save("C:\Users\osama\AppData\Local\Temp\claude\C--Users-osama--claude-sessions\374ab821-e5d3-453a-98f2-840f67adbc79\scratchpad\icon-sheet.png", [System.Drawing.Imaging.ImageFormat]::Png)
$sheet.Dispose()
"sheet done"
