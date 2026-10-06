# Vision-AI AWS Hackathon

AWS/OpenCV 5 verification implementation for the Vision-AI project.

This repository contains the **hackathon AWS implementation**. It is intentionally separate from the production repository `Vision-Ai-Prod`, which is maintained independently.

## Purpose

The AWS version demonstrates that Vision-AI can execute a meaningful image-analysis stage inside AWS using **OpenCV 5**.

The AWS component is an evidence/verification analyzer, not a replacement for the full production inspection station.

## Demonstrated architecture

```text
Image
  |
  +--> API Gateway /analyze
  |          |
  |          v
  |       Lambda
  |          |
  |          v
  |       OpenCV 5
  |          |
  |          v
  |       Analysis JSON
  |
  +--> S3 incoming/
             |
             v
          Lambda
             |
             v
          OpenCV 5
             |
             v
        S3 results/*.json
```

### Processing performed by OpenCV 5

The Lambda analyzer performs substantive server-side image processing:

1. Decode the image with `cv2.imdecode`
2. Convert BGR to grayscale
3. Apply Gaussian blur
4. Extract edges with Canny
5. Detect circular candidates with Hough Circles
6. Calculate edge density
7. Return dimensions, OpenCV version, candidates, and processing time

The dependency is pinned to:

```text
opencv-python-headless==5.0.0.93
```

The CI pipeline builds the Lambda container and explicitly verifies that the container imports OpenCV 5.

## AWS components

The SAM template provisions:

- **AWS Lambda** — containerized analyzer.
- **Amazon S3** — evidence images under `incoming/` and JSON results under `results/`.
- **API Gateway** — `POST /analyze` demonstration endpoint.
- **IAM policies** — S3 read/write permissions required by the analyzer.
- **Lambda container** — AWS Lambda Python 3.12 base image.

The S3 event is filtered to `incoming/`, while results are written to `results/`. This keeps generated result objects outside the trigger prefix and avoids recursive invocation.

## Repository separation

This repository is the **AWS/hackathon side**.

The production application is maintained separately in **Vision-Ai-Prod**.

The two repositories may share core inspection concepts and vision algorithms, but deployment responsibilities are intentionally separated. This AWS repository is the place for Lambda, S3, API Gateway, SAM, Docker, and AWS-specific verification.

## Local verification

Requirements:

- Python 3.12
- Docker
- AWS SAM CLI for deployment

Install dependencies:

```bash
python -m pip install -r aws/vision-analyzer/requirements.txt
python -m pip install pytest
```

Run tests:

```bash
pytest -q aws/vision-analyzer/test_app.py
```

Build the Lambda container:

```bash
docker build -t vision-ai-aws-opencv5 aws/vision-analyzer
```

Verify OpenCV 5 inside the container:

```bash
docker run --rm --entrypoint python vision-ai-aws-opencv5 -c "import cv2; print(cv2.__version__); assert cv2.__version__.startswith('5.')"
```

## AWS deployment

Infrastructure is defined in:

```text
aws/vision-analyzer/template.yaml
```

After configuring AWS credentials for the target account:

```bash
sam build --template-file aws/vision-analyzer/template.yaml
sam deploy --guided
```

The deployment creates an S3 evidence bucket, Lambda container function, and API endpoint.

**Cost note:** running the repository locally does not deploy AWS resources. AWS charges can only come from AWS resources/services actually deployed or used in the account. Review the account billing/free-tier status before deploying.

## CI verification

The `aws-opencv5` GitHub Actions job:

1. Installs the AWS analyzer dependencies.
2. Runs `test_app.py`.
3. Builds the Lambda Docker image.
4. Imports OpenCV inside the built Lambda image.
5. Fails unless the OpenCV major version is 5.

The normal build job also runs frontend lint, the adversarial recognizer audit, and the production build.

CI proves the implementation and container build; it does **not** by itself prove a live AWS deployment.

## Hackathon evidence status

- [x] OpenCV 5 dependency and runtime proof
- [x] Meaningful OpenCV image processing
- [x] AWS Lambda component
- [x] S3 event-driven processing path
- [x] API Gateway demonstration path
- [x] Automated OpenCV 5 tests
- [x] Lambda container build in CI
- [x] Adversarial recognizer audit in CI
- [ ] Live AWS deployment and end-to-end execution evidence
- [ ] Final screenshot/log/API evidence for the submitted demo

The last two items remain intentionally unchecked until the actual AWS deployment is executed and verified.

## Project structure

```text
aws/vision-analyzer/
├── app.py
├── Dockerfile
├── requirements.txt
├── template.yaml
└── test_app.py

.github/workflows/ci.yml
README.md
```

Keep AWS-specific implementation, deployment configuration, and evidence tooling on the AWS side.