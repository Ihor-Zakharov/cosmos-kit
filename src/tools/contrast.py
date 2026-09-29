#!/usr/bin/env python3
"""Контраст пар цветов: APCA (Lc, APCA-W3 0.0.98G) и WCAG 2 (отношение). Правила — UX.md §9.

  python3 kit/tools/contrast.py '#e9e3d8,#d5d0c6' '#000000,#0b0b0e'   — каждый цвет текста на каждом фоне
Цели кита: абзацы Lc ≥ 75 (лучше ~90), подписи Lc ≥ 60, не выше Lc 90 для крупного жирного; WCAG ≥ 4.5."""
import sys


def _rgb(h):
    h = h.strip().lstrip("#")
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]


def _y_apca(h):
    r, g, b = _rgb(h)
    return 0.2126729 * r ** 2.4 + 0.7151522 * g ** 2.4 + 0.0721750 * b ** 2.4


def apca(text, bg):
    """Lc: положительный — тёмный текст на светлом, отрицательный — светлый на тёмном."""
    t, b = _y_apca(text), _y_apca(bg)
    t, b = (y if y > 0.022 else y + (0.022 - y) ** 1.414 for y in (t, b))
    if abs(b - t) < 0.0005:
        return 0.0
    if b > t:
        s = (b ** 0.56 - t ** 0.57) * 1.14
        return 0.0 if s < 0.1 else (s - 0.027) * 100
    s = (b ** 0.65 - t ** 0.62) * 1.14
    return 0.0 if s > -0.1 else (s + 0.027) * 100


def wcag(a, b):
    def lum(h):
        c = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in _rgb(h)]
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    hi, lo = sorted((lum(a), lum(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    for bg in sys.argv[2].split(","):
        for tx in sys.argv[1].split(","):
            lc = abs(apca(tx, bg))
            note = "ярче потолка — слепит на крупном" if lc > 92 else "абзацы" if lc >= 75 else "подписи" if lc >= 60 else "крупное" if lc >= 45 else "мало"
            print(f"{tx} на {bg}: Lc {lc:5.1f}  WCAG {wcag(tx, bg):5.2f}  → {note}")
