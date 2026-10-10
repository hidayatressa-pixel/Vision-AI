import io
import json
import sys
from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[1] / "aws" / "vision-analyzer"
sys.path.insert(0, str(APP_DIR))

import app


class FakeS3:
    def __init__(self, image_bytes):
        self.image_bytes = image_bytes
        self.put_calls = []

    def get_object(self, Bucket, Key):
        assert Bucket == "test-bucket"
        assert Key == "incoming/photo sample.png"
        return {"Body": io.BytesIO(self.image_bytes)}

    def put_object(self, **kwargs):
        self.put_calls.append(kwargs)


def test_s3_event_analyzes_and_saves_result(monkeypatch):
    fixture = (
        Path(__file__).parent / "fixtures" / "valid-image.png"
    ).read_bytes()

    fake_s3 = FakeS3(fixture)
    monkeypatch.setattr(app, "s3", fake_s3)

    event = {
        "Records": [
            {
                "eventSource": "aws:s3",
                "s3": {
                    "bucket": {"name": "test-bucket"},
                    "object": {"key": "incoming/photo+sample.png"},
                },
            }
        ]
    }

    response = app.lambda_handler(event, None)

    assert response["processed"] == 1
    assert len(response["results"]) == 1
    assert response["results"][0]["source"] == "s3"
    assert response["results"][0]["key"] == "incoming/photo sample.png"
    assert response["results"][0]["result_key"] == (
        "results/incoming/photo sample.png.json"
    )

    assert len(fake_s3.put_calls) == 1
    saved = fake_s3.put_calls[0]
    assert saved["Bucket"] == "test-bucket"
    assert saved["Key"] == "results/incoming/photo sample.png.json"
    assert saved["ContentType"] == "application/json"

    saved_json = json.loads(saved["Body"].decode("utf-8"))
    assert saved_json["opencv_version"].split(".")[0] == "5"
    assert saved_json["width"] == 320
    assert saved_json["height"] == 240
