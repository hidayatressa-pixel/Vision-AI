import base64
import json
import os
import time
import urllib.parse

import boto3
import cv2
import numpy as np

s3 = boto3.client("s3")
OUTPUT_PREFIX = os.getenv("OUTPUT_PREFIX", "results/")
MAX_IMAGE_BYTES = int(os.getenv("MAX_IMAGE_BYTES", str(8 * 1024 * 1024)))


class PayloadTooLargeError(ValueError):
    pass


def _validate_image_size(raw: bytes) -> None:
    if len(raw) > MAX_IMAGE_BYTES:
        raise PayloadTooLargeError(f"Image exceeds the {MAX_IMAGE_BYTES}-byte limit")


def _decode_image(raw: bytes):
    _validate_image_size(raw)
    if not raw:
        raise ValueError("Image payload is empty")
    array = np.frombuffer(raw, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("OpenCV could not decode the supplied image")
    return image


def analyze_image(raw: bytes) -> dict:
    """Meaningful server-side OpenCV 5 inspection stage.

    This intentionally mirrors the browser pipeline at a coarse level: decode,
    grayscale, denoise, edge extraction and circular candidate detection. The
    browser-side master/ROI rule engine remains the final production authority.
    """
    started = time.perf_counter()
    image = _decode_image(raw)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 1.2)
    edges = cv2.Canny(blurred, 60, 140)

    circles = cv2.HoughCircles(
        blurred,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=18,
        param1=100,
        param2=24,
        minRadius=3,
        maxRadius=max(4, min(image.shape[:2]) // 4),
    )

    edge_density = float(np.count_nonzero(edges)) / float(edges.size or 1)
    candidates = []
    if circles is not None:
        for x, y, radius in np.round(circles[0]).astype(int).tolist():
            candidates.append({"x": int(x), "y": int(y), "radius": int(radius)})

    return {
        "opencv_version": cv2.__version__,
        "width": int(image.shape[1]),
        "height": int(image.shape[0]),
        "edge_density": round(edge_density, 6),
        "circle_candidates": candidates,
        "processing_ms": round((time.perf_counter() - started) * 1000, 3),
    }


def _response(status: int, body: dict):
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json"},
        "body": json.dumps(body),
    }


def _analyze_s3_record(record: dict) -> dict:
    bucket = record["s3"]["bucket"]["name"]
    key = urllib.parse.unquote_plus(record["s3"]["object"]["key"])
    obj = s3.get_object(Bucket=bucket, Key=key)
    declared_size = obj.get("ContentLength")
    if isinstance(declared_size, int) and declared_size > MAX_IMAGE_BYTES:
        raise PayloadTooLargeError(f"S3 object exceeds the {MAX_IMAGE_BYTES}-byte limit")
    raw = obj["Body"].read(MAX_IMAGE_BYTES + 1)
    _validate_image_size(raw)
    result = analyze_image(raw)
    result.update({"source": "s3", "bucket": bucket, "key": key})

    result_key = f"{OUTPUT_PREFIX.rstrip('/')}/{key.rsplit('/', 1)[-1]}.json"
    s3.put_object(
        Bucket=bucket,
        Key=result_key,
        Body=json.dumps(result).encode("utf-8"),
        ContentType="application/json",
    )
    return {**result, "result_key": result_key}



def lambda_handler(event, context):
    # S3 -> Lambda path used by the production/demo evidence flow.
    records = event.get("Records", []) if isinstance(event, dict) else []
    if records and records[0].get("eventSource") == "aws:s3":
        results = [_analyze_s3_record(record) for record in records]
        return {"processed": len(results), "results": results}

    # API Gateway path: accept a Base64 image or JSON containing image_base64.
    try:
        if not isinstance(event, dict):
            raise ValueError("Invalid request event")

        body = event.get("body")
        if not isinstance(body, str) or not body.strip():
            raise ValueError("Missing image data in request body")

        if event.get("isBase64Encoded"):
            raw = base64.b64decode(body, validate=True)
        else:
            try:
                payload = json.loads(body)
            except json.JSONDecodeError:
                payload = None

            if isinstance(payload, dict):
                image_base64 = payload.get("image_base64")
                if not isinstance(image_base64, str) or not image_base64.strip():
                    raise ValueError(
                        "Missing required field: image_base64"
                    )
                raw = base64.b64decode(image_base64, validate=True)
            else:
                raise ValueError(
                    "Expected JSON containing an image_base64 field"
                )

        _validate_image_size(raw)
        result = analyze_image(raw)
        return _response(200, result)

    except PayloadTooLargeError:
        return _response(413, {
            "error": "Image payload exceeds the configured size limit",
            "max_image_bytes": MAX_IMAGE_BYTES,
        })
    except (ValueError, KeyError, json.JSONDecodeError):
        return _response(400, {
            "error": "Invalid image request. Provide a valid encoded image in image_base64.",
            "opencv_version": cv2.__version__,
        })
    except Exception:
        # Do not return exception text, S3 keys, or infrastructure details to callers.
        return _response(500, {
            "error": "Image analysis failed",
            "opencv_version": cv2.__version__,
        })
