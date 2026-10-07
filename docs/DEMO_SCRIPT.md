# Vision-AI — 5 Minute Demo Script

## 0:00–0:30 — Problem

Show the assembly station.

Say:

“Manual inspection can discover missing, misplaced, or extra components too late. Vision-AI is designed as a zero-touch industrial vision inspection station that validates an eight-screw assembly before the part moves downstream.”

## 0:30–1:30 — Live inspection

Show the live camera.

Place the part in the station.

Do not press a capture button.

Say:

“The camera is continuously observing the station. Detection starts when the part enters the inspection area. Once the part is stabilized, the system evaluates the configured master, alignment, and eight screw ROIs.”

Show an OK result.

Then remove the part.

Show the system returning to the waiting state.

## 1:30–2:15 — NG cases

Show a missing-screw or position-defect example.

Say:

“The system does not treat every circle as a screw. Hough detection is only a candidate generator. Final recognition is reference-gated and combines visual and geometric evidence.”

Show NG.

Then demonstrate removal and re-arm.

## 2:15–2:45 — INVALID and failure containment

Show an uncertain or invalid condition.

Say:

“When the visual evidence is insufficient, the system returns INVALID rather than inventing an NG decision. Infrastructure failures such as PLC communication faults are classified separately as ERROR and remain contained.”

## 2:45–3:30 — Architecture

Show architecture diagram.

Say:

“The production repository keeps inspection authority local: OpenCV 5, alignment, ROI inspection, rule engine, state machine, and PLC interlock. The separate AWS repository demonstrates the cloud verification stage.”

Point to:

Camera → OpenCV 5 → Rule Engine → PLC

and:

Image → API Gateway/S3 → Lambda/OpenCV 5 → JSON evidence

## 3:30–4:15 — AWS/OpenCV 5

Show Lambda/container evidence.

Say:

“The AWS analyzer runs OpenCV 5 inside a Lambda container. It decodes the image, performs grayscale conversion, Gaussian blur, Canny edge extraction, Hough Circle analysis, and produces structured evidence including the OpenCV version and processing time.”

Show the OpenCV 5 test/CI result.

## 4:15–4:40 — Robustness

Show the adversarial audit list.

Say:

“We also test adversarial feature-level conditions including brightness changes, reflections, washers, blur, partial occlusion, smooth holes, and position shifts. The audit runs automatically in CI.”

## 4:40–5:00 — Closing

Say:

“Our key principle is simple: confirmed defects become NG, uncertainty becomes INVALID, and infrastructure failure becomes ERROR. Vision-AI is designed to make inspection faster while keeping the decision conservative and traceable.”

If live AWS deployment evidence is available, finish with the real API/S3 result. Otherwise do not imply that the cloud endpoint is live.
