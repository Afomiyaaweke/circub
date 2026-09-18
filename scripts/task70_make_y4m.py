#!/usr/bin/env python3
"""Generate a static 320x240 @ 25fps y4m (10s) for Chromium's fake camera
(--use-file-for-fake-video-capture). Draws a product-like scene so the
camera pipeline delivers frames in headless E2E runs."""
import numpy as np
from PIL import Image, ImageDraw

W, H, FPS, FRAMES = 320, 240, 25, 250
OUT = "/home/z/my-project/task70_fake_cam.y4m"

img = Image.new("RGB", (W, H), (235, 232, 225))
d = ImageDraw.Draw(img)
# backdrop + table
d.rectangle([0, 0, W, 70], fill=(198, 214, 199))
d.rectangle([0, 70, W, H], fill=(182, 156, 128))
# product box (headphone-ish: dark case + band)
d.ellipse([90, 90, 230, 190], fill=(40, 44, 52), outline=(20, 22, 28), width=4)
d.ellipse([120, 115, 200, 175], fill=(70, 76, 88), outline=(30, 32, 38), width=3)
d.rectangle([95, 130, 105, 170], fill=(25, 27, 32))
d.rectangle([215, 130, 225, 170], fill=(25, 27, 32))
# price tag
d.polygon([(238, 150), (300, 140), (306, 178), (244, 188)], fill=(250, 247, 240), outline=(120, 116, 108))
d.line([(250, 160), (292, 154)], fill=(60, 60, 60), width=3)
d.line([(250, 172), (280, 168)], fill=(60, 60, 60), width=2)

arr = np.asarray(img, dtype=np.float64)


def rgb_to_yuv420(a: np.ndarray) -> bytes:
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    y = 0.299 * r + 0.587 * g + 0.114 * b
    u = -0.168736 * r - 0.331264 * g + 0.5 * b + 128
    v = 0.5 * r - 0.418688 * g - 0.081312 * b + 128
    y = np.clip(y, 0, 255).astype(np.uint8).tobytes()
    u = np.clip(u[::2, ::2], 0, 255).astype(np.uint8).tobytes()
    v = np.clip(v[::2, ::2], 0, 255).astype(np.uint8).tobytes()
    return y + u + v


header = f"YUV4MPEG2 W{W} H{H} F{FPS}:1 Ip A1:1 C420jpeg\n".encode()
with open(OUT, "wb") as f:
    f.write(header)
    frame = b"FRAME\n" + rgb_to_yuv420(arr)
    for _ in range(FRAMES):
        f.write(frame)
print(f"wrote {OUT} ({FRAMES} frames)")
