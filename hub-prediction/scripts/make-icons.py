#!/usr/bin/env python3
"""Write iPhone home-screen icons: black field, neon H mark."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "public"


def png(w: int, h: int, rgba_rows: list[bytes]) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    raw = b"".join(b"\x00" + row for row in rgba_rows)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def pixel(size: int) -> bytes:
    bg = (10, 10, 10, 255)
    neon = (0, 229, 122, 255)
    rows: list[bytes] = []
    m = size / 180
    for y in range(size):
        row = bytearray()
        for x in range(size):
            px, py = x / m, y / m
            on = False
            # left stem
            if 48 <= px <= 68 and 40 <= py <= 140:
                on = True
            # right stem
            if 112 <= px <= 132 and 40 <= py <= 140:
                on = True
            # bar
            if 48 <= px <= 132 and 80 <= py <= 100:
                on = True
            row.extend(neon if on else bg)
        rows.append(bytes(row))
    return png(size, size, rows)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for name, size in (("apple-touch-icon.png", 180), ("icon-192.png", 192), ("icon-512.png", 512)):
        (OUT / name).write_bytes(pixel(size))
        print("wrote", name)


if __name__ == "__main__":
    main()
