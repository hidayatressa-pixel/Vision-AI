# Vision-AI AWS — Technical Report

## 1. Scope and problem

Industrial assembly inspection can discover missing, misplaced, or extra components too late, creating rework and lost production time. The broader Vision-AI project addresses this problem through a local inspection station. This repository has a deliberately narrower scope: it verifies an AWS-based image-analysis and evidence-processing stage using OpenCV 5.

The production application is maintained separately in [Vision-Ai-Prod](https://github.com/hidayatressa-pixel/Vision-Ai-Prod). Its frontend and production inspection source are not duplicated here.

## 2. AWS analyzer purpose

The analyzer demonstrates substantive image processing inside an AWS Lambda container. It is an evidence/verification component, not the production inspection authority, and its circle candidates must not be treated as a validated product-defect decision.

## 3. Architecture

API request path:

```text
HTTP POST /analyze
  -> API Gateway
  -> Lambda container
  -> OpenCV 5 image analysis
  -> JSON HTTP response
```

S3 event path:

```text
S3 incoming/<image>
  -> S3 ObjectCreated event
  -> Lambda container
  -> OpenCV 5 image analysis
  -> S3 results/<image>.json
```

The event notification is restricted to `incoming/`, while output is written to `results/`, avoiding recursive processing of generated result files.

## 4. OpenCV 5 implementation

The dependency is pinned to `opencv-python-headless==5.0.0.93`. The analyzer:
1. Decodes image bytes with `cv2.imdecode`.
2. Converts the image to grayscale.
3. Applies Gaussian blur.
4. Extracts edges with Canny.
5. Generates circle candidates with Hough Circles.
6. Calculates edge density.
7. Returns image dimensions, OpenCV version, candidates, and processing time.

Hough circles are candidate generation only. This pipeline is not, by itself, proof that a circle is a valid screw or that an assembly is OK/NG.

## 5. AWS infrastructure

The SAM template defines:
- AWS Lambda using a container image;
- Amazon S3 evidence storage;
- API Gateway `POST /analyze`;
- S3-triggered processing for `incoming/`;
- IAM S3 read/write policies;
- output JSON stored under `results/`.

The infrastructure definition can be validated and packaged locally. A live deployment is a separate step and may incur AWS charges.

## 6. Automated verification

The GitHub Actions workflow:
- installs Python 3.12 dependencies;
- runs API analyzer tests;
- tests S3 event processing with a mocked S3 client;
- builds the Lambda container;
- imports OpenCV inside that container and asserts the major version is 5.

These tests provide automated implementation and container-build evidence. The S3 test is mocked and does not prove real AWS event delivery or permissions. CI does not deploy the stack.

## 7. Limitations and responsible claims

- Circle candidates are not a final industrial part classifier.
- Synthetic fixtures and unit tests do not replace a held-out real camera dataset.
- Actual AWS IAM, API Gateway, S3 event delivery, and result persistence require end-to-end validation after deployment.
- Production qualification requires physical camera and process validation.
- Public API exposure should be protected with appropriate authentication, rate limiting, and access controls before real-world use.
- No live AWS endpoint should be advertised until deployment and execution evidence exist.

## 8. Reproducibility

Install dependencies and run tests:

```bash
python -m pip install -r aws/vision-analyzer/requirements.txt
python -m pip install pytest
pytest -q aws/vision-analyzer/test_app.py tests/test_s3_path.py
```

Validate SAM and build the container:

```bash
sam validate --lint --template-file aws/vision-analyzer/template.yaml
sam build --template-file aws/vision-analyzer/template.yaml
docker build -t vision-ai-aws-opencv5 aws/vision-analyzer
docker run --rm --entrypoint python vision-ai-aws-opencv5 -c "import cv2; print(cv2.__version__); assert cv2.__version__.startswith('5.')"
```

Deploy only when explicitly ready to create AWS resources:

```bash
sam deploy --guided
```

## 9. Submission evidence checklist

- [x] OpenCV 5 dependency and runtime verification in CI
- [x] Meaningful OpenCV image analysis
- [x] AWS Lambda container definition
- [x] API Gateway request-path tests
- [x] Mocked S3 event processing test
- [x] Lambda container build in CI
- [ ] Live AWS deployment evidence
- [ ] End-to-end API request against deployed endpoint
- [ ] End-to-end S3 upload and persisted result evidence
- [ ] Final demonstration recording
- [ ] Final submission form
