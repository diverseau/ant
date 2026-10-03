"""Rank open-licence fonts against the 'ant' wordmark in docs/refs/ant-inspo.png.

Usage: python match.py   (needs pillow, numpy; downloads woff files from the fontsource CDN into ./cache)
Output: ranking.json, sheet.png (top candidates over the reference mask)
"""
import io, json, os, urllib.request, itertools
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REF = os.path.join(HERE, '../../docs/refs/ant-inspo.png')
CACHE = os.path.join(HERE, 'cache'); os.makedirs(CACHE, exist_ok=True)
CDN = 'https://cdn.jsdelivr.net/fontsource/fonts/{id}@latest/latin-{w}-normal.woff'

FAMILIES = ['merriweather','source-serif-4','roboto-serif','noto-serif','bitter','playfair-display','fraunces','newsreader',
  'lora','pt-serif','libre-baskerville','domine','literata','gelasio','vollkorn','zilla-slab','arvo','aleo','abril-fatface',
  'dm-serif-display','young-serif','gloock','chonburi','ibm-plex-serif','besley','bree-serif','faustina','spectral','noto-serif-display',
  'crimson-pro','petrona','brygada-1918','rokkitt','roboto-slab','alike','cambo','trirong','ultra','bevan','rozha-one','playfair-display-sc','inknut-antiqua','sorts-mill-goudy','libre-caslon-text','libre-caslon-display','castoro','instrument-serif','eczar','prata','yeseva-one']
WEIGHTS = [900, 800, 700]

def ref_mask():
    a = np.array(Image.open(REF).convert('RGB')).astype(int)
    c = a[420:640, 700:1220]            # wordmark box; rows below ~218 are the orange ant's bag
    m = (c.min(axis=2) > 235)
    ys, xs = np.where(m); return m[ys.min():ys.max()+1, xs.min():xs.max()+1]

def get_font(fid, w):
    p = os.path.join(CACHE, f'{fid}-{w}.woff')
    if not os.path.exists(p):
        try: open(p, 'wb').write(urllib.request.urlopen(CDN.format(id=fid, w=w), timeout=20).read())
        except Exception: return None
    return p

def render(path, tracking, size=400):
    f = ImageFont.truetype(path, size)
    img = Image.new('L', (size*4, size*2), 0); d = ImageDraw.Draw(img); x = 40
    for ch in 'ant':
        d.text((x, 40), ch, font=f, fill=255); x += f.getlength(ch) + tracking*size
    a = np.array(img) > 128
    ys, xs = np.where(a)
    return a[ys.min():ys.max()+1, xs.min():xs.max()+1] if len(ys) else None

def score(ref, cand):
    h, w = ref.shape
    c = np.array(Image.fromarray((cand*255).astype('uint8')).resize((w, h), Image.BILINEAR)) > 128
    inter = (c & ref).sum(); union = (c | ref).sum()
    return inter / union

if __name__ == '__main__':
    ref = ref_mask(); print('ref mask', ref.shape)
    out = []
    for fid, w in itertools.product(FAMILIES, WEIGHTS):
        p = get_font(fid, w)
        if not p: continue
        best = None
        for tr in np.arange(-0.14, 0.03, 0.02):
            try: cand = render(p, tr)
            except Exception: break
            if cand is None: continue
            s = score(ref, cand)
            if not best or s > best[0]: best = (s, round(float(tr), 2))
        if best: out.append({'font': fid, 'weight': w, 'iou': round(best[0], 4), 'tracking_em': best[1]})
    out.sort(key=lambda r: -r['iou'])
    json.dump(out, open(os.path.join(HERE, 'ranking.json'), 'w'), indent=1)
    for r in out[:15]: print(r)
    # contact sheet: reference + top 11
    top = out[:11]; W = 520; H = ref.shape[0] * W // ref.shape[1]
    sheet = Image.new('RGB', (W*3+40, (H+30)*4+10), (20,20,20)); d = ImageDraw.Draw(sheet)
    tiles = [('REFERENCE', Image.fromarray((ref*255).astype('uint8')))]
    for r in top:
        cand = render(get_font(r['font'], r['weight']), r['tracking_em'])
        tiles.append((f"{r['font']} {r['weight']}  IoU {r['iou']}", Image.fromarray((cand*255).astype('uint8'))))
    for i, (t, im) in enumerate(tiles):
        x, y = 10 + (i % 3) * (W + 10), 10 + (i // 3) * (H + 30)
        d.text((x, y), t, fill=(255,255,255)); sheet.paste(im.resize((W, H)).convert('RGB'), (x, y + 16))
    sheet.save(os.path.join(HERE, 'sheet.png'))
