"""The candidate's photo, cut out of the first page of the resume (no model call).

The upper part of the page is rendered and a face detector (OpenCV's YuNet, the
small ONNX model beside this file) run over it; the largest face found is cut out
with some headroom, so the result is the headshot as it appears on the page
whatever the PDF did with it: an embedded image, a round mask, a vector frame or
a scan. Logos, badges and QR codes have no face, and most resumes have no photo
at all and yield nothing.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy
import pymupdf
from django.conf import settings

MODEL = Path(__file__).with_name("yunet.onnx")
RENDER_DPI = 110
# The photo sits in the upper part of the first page.
TOP_SHARE = 0.6
MIN_SCORE = 0.8
# The cut is square, this many face widths across, so hair and shoulders come along.
HEADROOM = 1.9
PHOTO_PX = 256


def candidate_photo(path: str | Path) -> bytes | None:
    """The photo as a JPEG at most ``PHOTO_PX`` on a side, or None when the resume has none."""
    with pymupdf.open(path) as document:
        if document.page_count == 0:
            return None
        page = document[0]
        clip = pymupdf.Rect(0, 0, page.rect.width, page.rect.height * TOP_SHARE)
        pix = page.get_pixmap(dpi=RENDER_DPI, clip=clip, alpha=False, colorspace=pymupdf.csRGB)
    image = cv2.cvtColor(
        numpy.frombuffer(pix.samples, dtype=numpy.uint8).reshape(pix.height, pix.width, 3),
        cv2.COLOR_RGB2BGR,
    )
    detector = cv2.FaceDetectorYN.create(
        str(MODEL), "", (pix.width, pix.height), score_threshold=MIN_SCORE
    )
    _, faces = detector.detect(image)
    if faces is None:
        return None
    x, y, w, h = (int(v) for v in max(faces, key=lambda face: face[2] * face[3])[:4])
    side = int(max(w, h) * HEADROOM)
    # Centred on the face, lifted a little so the cut takes more hair than chin.
    x0 = max(0, x + w // 2 - side // 2)
    y0 = max(0, y + h // 2 - h // 6 - side // 2)
    cut = image[y0 : y0 + side, x0 : x0 + side]
    scale = PHOTO_PX / max(cut.shape[:2])
    if scale < 1:
        cut = cv2.resize(cut, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    ok, encoded = cv2.imencode(".jpg", cut, [cv2.IMWRITE_JPEG_QUALITY, 88])
    return encoded.tobytes() if ok else None


def photo_path(name: str) -> Path:
    """Where a cut photo lives: ``RESUME_STORAGE_PATH/photos/<candidate id>.jpg``."""
    return Path(settings.RESUME_STORAGE_PATH).expanduser() / "photos" / name
