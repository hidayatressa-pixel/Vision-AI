# Vision-AI AWS — Demo Script

## Before recording

- Run the automated tests and capture their result.
- Build the Lambda container and capture the OpenCV version output.
- Validate the SAM template.
- If a live AWS stack has not been deployed, describe the AWS path as an infrastructure design and local/container verification. Do not present a sample response as a live AWS response.

## 0:00–0:30 — Problem and scope

Explain that the broader Vision-AI project targets industrial visual inspection. This repository demonstrates the AWS evidence-analysis component and does not replace the separate production inspection application.

## 0:30–1:30 — OpenCV 5 processing

Show the analyzer code and explain:
- image decoding;
- grayscale and Gaussian blur;
- Canny edge extraction;
- Hough Circle candidate generation;
- structured analysis output with dimensions, OpenCV version, edge density, and processing time.

Emphasize that circle candidates are evidence for downstream review, not a final screw classifier.

## 1:30–2:15 — API request path

Show the API Gateway/Lambda path in the SAM template and the automated request-path test. Clearly label local test output as test output, not as a live endpoint response.

## 2:15–3:00 — S3 evidence path

Show the S3 event configuration: source images are read from `incoming/`, and JSON results are written under `results/`. Show the mocked S3 unit test and explain that a real upload test is still required after deployment.

## 3:00–4:00 — Container and reproducibility

Show the successful CI run:
- analyzer tests;
- Docker image build;
- OpenCV version assertion inside the Lambda container.

Explain that this proves the tested container build uses OpenCV 5, but does not prove that the AWS stack is deployed or that live IAM/event integration works.

## 4:00–5:00 — Evidence status and closing

Show the technical report and checklist. Distinguish completed automated verification from outstanding live AWS deployment, end-to-end API/S3 evidence, and the final recording.

Closing message: “This submission demonstrates a reproducible OpenCV 5 image-analysis component packaged for AWS Lambda, with API and S3 processing paths defined and automated tests in CI. Live AWS integration will only be claimed after it has been deployed and verified.”
