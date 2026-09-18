#!/usr/bin/env python3
"""Probe the PROD /api/scan directly: small real JPEG + Addis location.
Classifies: 200+item / 429 quota / 503 unreachable / slow."""
import base64
import io
import json
import time
import urllib.request

from PIL import Image, ImageDraw

# small product-ish JPEG (~hundreds of bytes after resize)
img = Image.new("RGB", (288, 216), (235, 232, 225))
d = ImageDraw.Draw(img)
d.rectangle([0, 0, 288, 64], fill=(198, 214, 199))
d.rectangle([0, 64, 288, 216], fill=(182, 156, 128))
d.ellipse([80, 80, 208, 172], fill=(40, 44, 52), outline=(20, 22, 28), width=3)
buf = io.BytesIO()
img.save(buf, "JPEG", quality=55)
data_url = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()

payload = json.dumps({
    "image": data_url,
    "location": {"city": "Addis Ababa", "country": "Ethiopia", "countryCode": "ET"},
}).encode()

req = urllib.request.Request(
    "https://circub.vercel.app/api/scan",
    data=payload, headers={"Content-Type": "application/json"}, method="POST",
)
t0 = time.time()
try:
    with urllib.request.urlopen(req, timeout=150) as r:
        body = json.loads(r.read().decode())
        dt = time.time() - t0
        item = body.get("item", {}).get("name")
        price = body.get("price", {})
        print(f"PROBE 200 in {dt:.1f}s - item={item!r} price={price.get('estimatedLow')}-{price.get('estimatedHigh')} {price.get('currency')} locals={len(body.get('localPrices') or [])}")
except urllib.error.HTTPError as e:
    dt = time.time() - t0
    print(f"PROBE {e.code} in {dt:.1f}s - {e.read().decode()[:200]}")
except Exception as e:
    print(f"PROBE EXC in {time.time()-t0:.1f}s - {type(e).__name__}: {e}")
