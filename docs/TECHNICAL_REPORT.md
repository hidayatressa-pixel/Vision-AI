# Vision-AI — Technical Report

## 1. Problem

Industrial assembly inspection can fail when missing, misplaced, or extra components are discovered only after downstream assembly. The result is rework, lost production time, and inconsistent manual verification.

Vision-AI addresses this with a fixed-camera, zero-touch inspection station for an eight-screw Reflector Assy HL GJRA configuration.

## 2. Users and Impact

Primary users are production operators, line leaders, quality engineers, and manufacturing engineers.

The intended impact is:
- detect assembly abnormalities before downstream processing;
- reduce dependence on manual visual checking;
- prevent repeated inspection while a part remains in the station;
- distinguish confirmed NG from uncertain visual conditions;
- preserve evidence for analysis and continuous improvement.

## 3. System Architecture

The project is intentionally separated into two repositories:

- **Vision-Ai-Prod** — production-oriented local/on-premise inspection authority.
- **Vision-AI-AWS** — AWS/OpenCV 5 verification and cloud evidence implementation.

Production flow:

Camera → OpenCV 5 → Detection/Alignment → ROI inspection → Rule Engine → State Machine → PLC/Interlock → History

AWS evidence flow:

Image → API Gateway / S3 → Lambda container → OpenCV 5 → Analysis JSON → S3 results/

The production decision does not depend on AWS availability. AWS provides a meaningful cloud verification/evidence stage and demonstrates deployable OpenCV 5 processing.

## 4. OpenCV 5 Implementation

OpenCV 5 is used substantively rather than only as a dependency.

### Production/browser pipeline
- RGBA frame conversion
- grayscale conversion
- Gaussian blur
- histogram equalization
- Canny edge extraction
- Hough Circle candidate generation
- ROI-level visual signature analysis
- reference-gated screw classification

Hough circles are treated as candidate generation, not as the final screw classifier.

### AWS/Lambda pipeline
The Lambda analyzer performs:
1. image decoding with `cv2.imdecode`;
2. grayscale conversion;
3. Gaussian blur;
4. Canny edge extraction;
5. Hough Circle candidate detection;
6. edge-density calculation;
7. JSON evidence generation including OpenCV version and processing time.

The AWS dependency is pinned to `opencv-python-headless==5.0.0.93`.

## 5. Inspection Decision Model

The production rule engine uses explicit outcomes:

- **OK** — evidence supports a valid assembly.
- **NG** — a concrete defect is supported by sufficient evidence.
- **INVALID** — visual evidence is uncertain or master configuration is invalid.
- **ERROR** — system/infrastructure failure prevents a trustworthy inspection.

Concrete NG conditions include:
- MISSING_PART
- POSITION_OUT_OF_TOLERANCE
- EXTRA_OBJECT_DETECTED
- INCORRECT_COUNT

This separation prevents weak visual evidence from being incorrectly converted into an NG decision.

## 6. Reference-Gated Recognition

Eight screw inspection positions are configured.

Each required ROI must have an approved visual reference before the master configuration can be used for inspection. Recognition combines geometry and visual evidence including edge density, circularity, brightness, color/saturation characteristics, and center texture.

For reference-gated presence detection, visual similarity, center-texture difference, and confidence thresholds must all pass.

This design intentionally avoids treating a generic circular object as automatically equivalent to a valid screw.

## 7. State Machine and Zero-Touch Operation

The inspection lifecycle is:

EMPTY → DETECTING → JUDGED → WAIT_REMOVE → EMPTY

After judgement:
- the result is latched;
- reinspection is blocked while the part remains present;
- the result remains visible;
- the station waits for physical removal;
- only then can the next inspection start.

This supports the intended live-camera workflow without requiring an operator capture button for each inspection.

## 8. Failure Handling and Containment

The system follows:

Failure → Detect → Classify → Contain → Record → Analyze → Improve

Examples:
- uncertain visual evidence → INVALID;
- missing required part with strong evidence → NG;
- alignment failure → INVALID;
- PLC communication failure → ERROR and interlock held;
- incomplete master configuration → INVALID;
- removal confirmation is required before re-arm.

PLC handshake and reset confirmation are treated as part of the safety/containment path.

## 9. Adversarial Testing

The recognizer includes a synthetic feature-level adversarial audit covering:
- normal
- position shift
- rotation
- bright
- dark
- faded
- minor defect
- smooth hole
- reflection
- washer
- blur
- partial occlusion

The CI pipeline runs this audit automatically.

This is a feature-level robustness test and is not presented as a substitute for a real held-out production camera dataset.

## 10. Automated Verification

CI verifies:
- TypeScript/type correctness;
- production build;
- adversarial recognizer audit;
- AWS OpenCV 5 analyzer tests;
- Lambda container build;
- OpenCV major version 5 inside the Lambda container;
- GitHub Pages build/deployment for the demonstration frontend.

## 11. AWS Deployment

AWS infrastructure is defined with AWS SAM.

Components:
- AWS Lambda
- Lambda container image
- Amazon S3
- API Gateway
- IAM policies
- S3 event-triggered Lambda processing

S3 images are read from the `incoming/` prefix and analysis JSON is written under `results/`, avoiding recursive processing of result objects.

**Submission evidence status:** the infrastructure definition and automated container verification are complete. A live deployed AWS endpoint and end-to-end S3 execution must be captured before final submission and should not be claimed until verified.

## 12. Limitations

Current limitations include:
- physical camera validation is still required for production qualification;
- synthetic adversarial tests do not replace a held-out real image dataset;
- lighting, reflections, camera mounting, and part variation require commissioning;
- AWS evidence analyzer is a verification component and is not the production inspection authority;
- public demo/API exposure should use appropriate authentication and access controls for real deployments.

## 13. Responsible Operation

The system is designed to fail conservatively:
- uncertainty is not silently converted to NG;
- infrastructure faults are separated from product defects;
- inspection remains latched until physical removal;
- production authority remains local so an AWS outage does not automatically corrupt the production decision.

## 14. Reproducibility

See:
- `aws/vision-analyzer/template.yaml`
- `aws/vision-analyzer/Dockerfile`
- `aws/vision-analyzer/requirements.txt`
- `aws/vision-analyzer/test_app.py`

Local AWS verification:

```bash
python -m pip install -r aws/vision-analyzer/requirements.txt
python -m pip install pytest
pytest -q aws/vision-analyzer/test_app.py
docker build -t vision-ai-aws-opencv5 aws/vision-analyzer
docker run --rm --entrypoint python vision-ai-aws-opencv5 -c "import cv2; print(cv2.__version__); assert cv2.__version__.startswith('5.')"
```

AWS deployment:

```bash
sam build --template-file aws/vision-analyzer/template.yaml
sam deploy --guided
```

## 15. Final Evidence Checklist

- [x] OpenCV 5 dependency/runtime proof
- [x] Meaningful OpenCV 5 image analysis
- [x] AWS Lambda component
- [x] S3 event-driven processing
- [x] API Gateway path
- [x] Automated AWS OpenCV 5 tests
- [x] Lambda container build
- [x] Adversarial recognizer audit
- [x] Production build
- [x] Public frontend deployment
- [ ] Live AWS deployment evidence
- [ ] End-to-end AWS request/S3 result evidence
- [ ] Final demonstration video
- [ ] Final Devpost submission form
