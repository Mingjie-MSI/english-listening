"""Draw the app icon (headphones on navy) as PNG with the standard library only."""
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")
BG = (29, 53, 87)
FG = (255, 255, 255)
RED = (230, 57, 70)


def coverage(x, y, n):
    """Return (shape, alpha) for pixel centre (x, y) in a unit square scaled to n."""
    u, v = x / n, y / n
    # headband: ring centred (0.5, 0.56), radius 0.27, thickness 0.06, upper half only
    d = math.hypot(u - 0.5, v - 0.56)
    if v <= 0.56 and abs(d - 0.27) <= 0.032:
        return FG
    # ear cups
    for cx in (0.255, 0.745):
        if abs(u - cx) <= 0.07 and 0.52 <= v <= 0.74:
            r = 0.035
            dx = max(abs(u - cx) - (0.07 - r), 0)
            dy = max(abs(v - 0.63) - (0.11 - r), 0)
            if math.hypot(dx, dy) <= r:
                return FG
    # small red sound bars in the middle
    for i, h in enumerate((0.07, 0.13, 0.09)):
        cx = 0.43 + i * 0.07
        if abs(u - cx) <= 0.018 and abs(v - 0.64) <= h / 2:
            return RED
    return None


def draw(n, ss=3):
    rows = []
    for y in range(n):
        row = bytearray([0])
        for x in range(n):
            acc = [0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    c = coverage(x + (sx + 0.5) / ss, y + (sy + 0.5) / ss, n) or BG
                    for k in range(3):
                        acc[k] += c[k]
            row += bytes(a // (ss * ss) for a in acc)
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", n, n, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for n in (192, 512):
        with open(os.path.join(OUT, f"icon-{n}.png"), "wb") as f:
            f.write(draw(n))
        print("wrote", n)
