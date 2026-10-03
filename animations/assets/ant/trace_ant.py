"""Trace the 'ant' wordmark from docs/refs/ant-inspo.png into a smooth SVG path.
Source is only ~490px wide, so edges are smoothed (8x bicubic + gaussian) before tracing.
Better: replace the source with a higher-res export of the logo and re-run.
Needs: pillow numpy potracer.  Run from repo root: python animations/assets/ant/trace_ant.py
"""
import numpy as np, potrace, os
from PIL import Image, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '../../../docs/refs/ant-inspo.png')
K = 8
a = np.array(Image.open(SRC).convert('RGB')).astype(int)
c = a[420:640, 700:1220]                       # wordmark box; the ants around it are coloured, text is near-white
lum = c.min(axis=2).astype(float)
soft = np.clip((lum - 170) / 80, 0, 1)
ys, xs = np.where(soft > 0.5)
# keep only the main text block: drop columns/rows that belong to stray white bits (eyes of other ants)
x0, x1, y0, y1 = 18, 500, ys.min(), 219
soft = soft[y0:y1, x0:x1]
im = Image.fromarray((soft * 255).astype('uint8')).resize((soft.shape[1] * K, soft.shape[0] * K), Image.BICUBIC)
im = im.filter(ImageFilter.GaussianBlur(K * 0.55))
big = np.array(im) > 127
pl = potrace.Bitmap(~big).trace(turdsize=4000, alphamax=1.15, opttolerance=0.6)
parts = []
for curve in pl:
    s = curve.start_point; d = [f'M{s.x/K:.2f},{s.y/K:.2f}']
    for seg in curve.segments:
        e = seg.end_point
        if seg.is_corner: d.append(f'L{seg.c.x/K:.2f},{seg.c.y/K:.2f}L{e.x/K:.2f},{e.y/K:.2f}')
        else: d.append(f'C{seg.c1.x/K:.2f},{seg.c1.y/K:.2f} {seg.c2.x/K:.2f},{seg.c2.y/K:.2f} {e.x/K:.2f},{e.y/K:.2f}')
    d.append('Z'); parts.append(''.join(d))
h, w = soft.shape
open(os.path.join(HERE, 'ant-wordmark-traced.svg'), 'w').write(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><path fill="#faf9f5" fill-rule="evenodd" d="{" ".join(parts)}"/></svg>')
print(len(parts), 'subpaths', w, h)
