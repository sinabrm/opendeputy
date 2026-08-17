import json
import csv
import io
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
OMNIPARSER_ROOT = ROOT.parent / "OmniParser"
MODEL_PATH = (
    ROOT
    / "hf-cache"
    / "hub"
    / "models--microsoft--OmniParser-v2.0"
    / "snapshots"
    / "ef77ffa0da68a824fd59a2d11215e2862b07b5e9"
    / "icon_detect_v3"
    / "model.pt"
)
TESSERACT_PATH = Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe")

sys.path.insert(0, str(OMNIPARSER_ROOT))
from util.yolov9 import YOLOv9Detector  # noqa: E402


detector = None
load_seconds = None


def ensure_detector():
    global detector, load_seconds
    if detector is None:
        started = time.perf_counter()
        detector = YOLOv9Detector(model_path=MODEL_PATH, device="cpu")
        load_seconds = time.perf_counter() - started
    return detector


def read_visible_text(image_path):
    if not TESSERACT_PATH.is_file():
        return []
    process = subprocess.run(
        [str(TESSERACT_PATH), str(image_path), "stdout", "--psm", "6", "tsv"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=45,
        check=False,
    )
    if process.returncode != 0:
        return []
    elements = []
    for row in csv.DictReader(io.StringIO(process.stdout), delimiter="\t"):
        text = (row.get("text") or "").strip()
        try:
            confidence = float(row.get("conf") or -1)
            x = int(row.get("left") or 0)
            y = int(row.get("top") or 0)
            width = int(row.get("width") or 0)
            height = int(row.get("height") or 0)
        except ValueError:
            continue
        if not text or confidence < 25 or width < 2 or height < 2:
            continue
        elements.append(
            {
                "id": f"text-{len(elements)}",
                "text": text,
                "box": [x, y, x + width, y + height],
                "center": [round(x + width / 2), round(y + height / 2)],
                "confidence": round(confidence / 100, 4),
            }
        )
    return elements


def detect(request):
    started = time.perf_counter()
    image_path = Path(request["image_path"])
    output_path = Path(request["output_path"])
    confidence = float(request.get("confidence", 0.08))
    image_size = int(request.get("image_size", 640))
    max_regions = int(request.get("max_regions", 80))

    image = Image.open(image_path).convert("RGB")
    text_elements = read_visible_text(image_path)
    model = ensure_detector()
    result = model.predict(
        image,
        conf=confidence,
        imgsz=image_size,
        iou=0.15,
        max_det=max_regions,
    )[0]

    raw_boxes = result.boxes.xyxy.detach().cpu().tolist()
    raw_scores = result.boxes.conf.detach().cpu().tolist()
    candidates = []
    for box, score in zip(raw_boxes, raw_scores):
        x1, y1, x2, y2 = [int(round(value)) for value in box]
        if x2 - x1 < 5 or y2 - y1 < 5:
            continue
        candidates.append((x1, y1, x2, y2, float(score)))

    candidates.sort(key=lambda item: (item[1], item[0], -item[4]))
    regions = []
    for index, (x1, y1, x2, y2, score) in enumerate(candidates):
        regions.append(
            {
                "id": index,
                "box": [x1, y1, x2, y2],
                "center": [round((x1 + x2) / 2), round((y1 + y2) / 2)],
                "confidence": round(score, 4),
            }
        )

    annotated = image.copy()
    draw = ImageDraw.Draw(annotated)
    font = ImageFont.load_default()
    for region in regions:
        x1, y1, x2, y2 = region["box"]
        label = str(region["id"])
        draw.rectangle((x1, y1, x2, y2), outline=(255, 48, 48), width=3)
        text_box = draw.textbbox((x1, y1), label, font=font, stroke_width=1)
        padding = 3
        draw.rectangle(
            (
                text_box[0] - padding,
                text_box[1] - padding,
                text_box[2] + padding,
                text_box[3] + padding,
            ),
            fill=(255, 48, 48),
        )
        draw.text((x1, y1), label, fill=(255, 255, 255), font=font, stroke_width=1)

    for element in text_elements:
        x1, y1, x2, y2 = element["box"]
        draw.rectangle((x1, y1, x2, y2), outline=(0, 180, 80), width=2)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    annotated.save(output_path, format="PNG")
    return {
        "ok": True,
        "image": {"width": image.width, "height": image.height},
        "regions": regions,
        "text_elements": text_elements,
        "annotated_path": str(output_path),
        "load_seconds": round(load_seconds or 0, 3),
        "detect_seconds": round(time.perf_counter() - started, 3),
    }


def handle(request):
    operation = request.get("operation", "detect")
    if operation == "status":
        return {
            "ok": True,
            "model_path": str(MODEL_PATH),
            "model_exists": MODEL_PATH.is_file(),
            "loaded": detector is not None,
            "load_seconds": round(load_seconds or 0, 3),
        }
    if operation == "detect":
        return detect(request)
    raise ValueError(f"Unsupported operation: {operation}")


for line in sys.stdin:
    try:
        payload = json.loads(line)
        response = handle(payload)
    except Exception as error:
        response = {"ok": False, "error": f"{type(error).__name__}: {error}"}
    print(json.dumps(response, ensure_ascii=False), flush=True)
