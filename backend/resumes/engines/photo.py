"""The candidate's photo, cut out of the resume PDF (no model call).

A resume that carries a photo puts it on the first page, near the top, as the
largest roughly square image; around it sit the contact icons (tiny), logos and
decorative bars (very wide or very tall) and, on modern templates, a QR code
(square, but two colours). ``candidate_photo`` picks the largest image that
passes those shape checks and has the colour depth of a photograph, then
renders that area of the page rather than decoding the image object, so a
round-cropped or masked photo comes out exactly as it appears, whatever the
PDF's image encoding. A scanned resume is one page-sized image and yields
nothing: there is no face to cut out without detection.
"""

from __future__ import annotations

from pathlib import Path

import pymupdf
from django.conf import settings

# Points: contact icons are 8-20, photos 60-150.
MIN_SIDE_PT = 56
# Of the page area: bigger is a background or a scan.
MAX_AREA_SHARE = 0.35
# The photo sits in the upper half of the first page.
TOP_SHARE = 0.5
ASPECT_RANGE = (0.5, 2.0)
# Distinct colours in the rendered cut: a QR code has two, a flat logo a few dozen,
# a photograph thousands (a black-and-white one still a couple of hundred).
MIN_COLORS = 128
PHOTO_PX = 256


def candidate_photo(path: str | Path) -> bytes | None:
    """The photo as a JPEG at most ``PHOTO_PX`` on a side, or None when the resume has none."""
    with pymupdf.open(path) as document:
        if document.page_count == 0:
            return None
        page = document[0]
        rects = []
        for info in page.get_image_info():
            rect = pymupdf.Rect(info["bbox"]) & page.rect
            if rect.is_empty or min(rect.width, rect.height) < MIN_SIDE_PT:
                continue
            if (
                abs(rect) > MAX_AREA_SHARE * abs(page.rect)
                or rect.y0 > TOP_SHARE * page.rect.height
            ):
                continue
            if not ASPECT_RANGE[0] <= rect.width / rect.height <= ASPECT_RANGE[1]:
                continue
            rects.append(rect)
        for rect in sorted(rects, key=abs, reverse=True):
            zoom = PHOTO_PX / max(rect.width, rect.height)
            pix = page.get_pixmap(clip=rect, matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
            if pix.color_count() >= MIN_COLORS:
                return pix.tobytes("jpeg")
    return None


def photo_path(name: str) -> Path:
    """Where a cut photo lives: ``RESUME_STORAGE_PATH/photos/<candidate id>.jpg``."""
    return Path(settings.RESUME_STORAGE_PATH).expanduser() / "photos" / name
