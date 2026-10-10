# Sonar-style Quality & Security Audit

**Audit date:** 2026-10-11  
**Scope:** restored React/TypeScript inspection frontend, setup/master persistence, camera readiness, AWS Lambda analyzer, SAM infrastructure, and CI workflows.  
**Method:** source review, GitHub Actions build/type-check, backend unit tests, container OpenCV-version check, and GitHub CodeQL (security-extended) workflow. This is a Sonar-style audit, not a claim that SonarQube/SonarCloud itself ran.

## Executive status

- Frontend TypeScript check and production build: **PASS** on the initial integration commit.
- AWS analyzer tests and OpenCV 5 container check: **PASS** on the initial integration commit.
- Follow-up persistence, validation, payload-safety, IAM/storage hardening, and CodeQL workflow changes are newer than that initial run; CI must complete on the final branch head before merge.
- Production deployment, live AWS endpoint, real camera hardware, PLC gateway, and real production-image accuracy were **not verified** by repository CI.

## Findings

| ID | Severity | Finding | Action/status |
|---|---|---|---|
| Q-01 | Critical | Master configuration was held only in an in-memory Map; a browser refresh could lose setup and uploaded master/reference data. | Fixed: IndexedDB persistence with migration from legacy localStorage and fallback handling. |
| Q-02 | High | Setup validation checked counts but did not fully enforce normalized coordinate bounds, detection-zone bounds, unique ROI IDs, or one-to-one reference-to-ROI mapping. | Fixed: validation now checks these conditions plus confidence/tolerance ranges. |
| Q-03 | High | Client-side engineering PIN is bundled into public JavaScript and can be inspected/bypassed. | **Residual security hotspot:** current PIN is only a workflow gate. Do not use it as authentication for sensitive resources; secure server-side verification is required for real access control. |
| Q-04 | High | Analyzer API is publicly callable and can incur compute/storage costs. | Mitigated: API throttling (5 requests/sec, burst 10), Lambda reserved concurrency (5), and image payload size cap. Authentication and per-user authorization remain a deployment decision. |
| Q-05 | High | Analyzer previously returned raw exception text to API callers. | Fixed: API returns generic internal-error text; request validation and oversized payloads receive separate status codes. |
| Q-06 | Medium | API image payloads had no explicit application-level byte limit. | Fixed: configurable 8 MiB limit; oversized payloads return HTTP 413. S3 event objects are size-checked before full read. |
| Q-07 | Medium | S3 result keys used only the uploaded filename, allowing same-name objects from different folders to overwrite results. | Fixed: output keys preserve the input key path beneath the results prefix. |
| Q-08 | Medium | Evidence bucket infrastructure did not explicitly declare all public-access blocks or a TLS-only bucket policy. | Fixed: public access blocks, bucket-owner-enforced ownership, server-side encryption, and deny-insecure-transport policy added. |
| Q-09 | Medium | CI type-check/build was absent for the restored frontend; the existing pipeline primarily tested AWS analyzer. | Fixed: frontend type-check/build job added. CodeQL security-extended workflow added for JavaScript/TypeScript and Python. |
| Q-10 | Medium | Master configuration remains station-local; cloud history is separate. A browser/device loss can still risk configuration availability if no approved backup/export exists. | Open architecture risk: define a governed master backup/versioning strategy before multi-station production use. |
| Q-11 | Medium | CI does not prove the camera stream, visual ROI alignment, reference-image correctness, PLC interlock, or production judgement quality on real hardware. | Open validation requirement: run a documented acceptance test with golden images, NG/OK samples, physical camera and PLC simulator/gateway. |
| Q-12 | Low | useInspectionPipeline.ts imported runtime identity twice from the same module. | Fixed: consolidated import. |
| Q-13 | High | An active-session marker was held only in React memory; a refresh could reopen setup while the station had been marked active. | Fixed in the app flow: persist a session marker and show a recovery lock after reload until safe state is confirmed and the recovered session is ended. This is a software guard, not a substitute for a physical PLC safety interlock. |

## Required acceptance checks before production

1. Open a fresh browser profile and verify Welcome → PIN → setup sequence.
2. Verify a missing/unconfigured PIN fails closed; verify incorrect PIN does not unlock setup.
3. Verify each missing prerequisite is shown: live camera, master image and dimensions, 8 valid reference images, 4 anchors, 8 ROIs, valid detection zone, and one-to-one reference mapping.
4. Confirm a master survives reload and a browser restart; confirm legacy data migration works.
5. Attempt to start inspection with each prerequisite deliberately invalid; the session must not start.
6. While inspection is active, verify navigation cannot edit setup; only ending the session permits configuration changes. Refresh during a session and verify the recovery lock blocks setup until the operator confirms the station is safe.
7. Test OK, NG, invalid alignment, missing screw, extra object, camera disconnect, PLC timeout, and part-removal latch using approved fixtures.
8. Deploy to a non-production AWS stack and verify bucket policy, API throttling, size-limit behavior, CloudWatch logs, and S3 result-key uniqueness.
9. Review CodeQL alerts and dependency audit output before merging.

## Known limitations

- The browser PIN is not a security boundary.
- IndexedDB is durable browser storage but is not a shared master database or a backup service.
- The OpenCV 5 Lambda analyzer is an evidence/analysis stage; the browser-side master/ROI rule engine remains the final judgement authority in this implementation.
- Passing CI does not establish that AWS resources are deployed or that the full station works end-to-end.
