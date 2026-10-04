# Vision Station

Industrial vision inspection station for **Reflector Assy HL GJRA**.

The application is designed for a fixed camera station where each workpiece is located, aligned against a configured master, inspected at eight screw positions, and classified deterministically as **OK**, **NG**, or **ERROR**.

## Core workflow

1. **Master Setup** — Engineering uploads one approved master image, configures four alignment anchors, eight screw inspection ROIs, tolerances, and exactly six close-up reference images.
2. **Part Detection** — The camera monitors the configured detection zone and waits for the workpiece to settle.
3. **Alignment** — Fiducial anchors determine translation, rotation, scale, and residual error before inspection.
4. **Inspection** — Each of the eight required screw locations is checked for presence, confidence, and position tolerance. Unexpected screw-like objects are also screened.
5. **Rule Engine** — The configured master remains authoritative. Alignment failures are reported as system errors; part defects produce NG.
6. **Re-arm** — After a judgement, the station waits for removal or a meaningful replacement/repositioning change before allowing another inspection.
7. **History** — Inspection results are stored locally in IndexedDB with an optional synchronization queue.

## Engineering configuration

Settings are protected by a local engineering password. The engineering area provides:

- Master and revision management
- Master image and reference-image upload
- Four-point fiducial alignment
- Eight required screw ROIs
- Position, confidence, rotation, and stabilization tolerances
- Camera selection and background calibration
- PLC protocol and interlock configuration
- Runtime diagnostics

The operator view is intentionally focused on the live camera inspection and final judgement.

## Hardware and integration

The station supports browser camera input and an engineering simulator for deterministic dry-runs. PLC communication is isolated behind an adapter so a real industrial gateway can be integrated without changing the inspection rule layer.

The browser is not a safety controller. Machine safety, guarding, and safety interlocks must remain implemented in the appropriate industrial control and safety hardware.

## Local development

Requirements: Node.js and npm.

```bash
npm install
npm run dev
```

For a production build:

```bash
npm run build
npm run preview
```

## Commissioning checklist

Before line use:

- Upload the approved master image.
- Upload all six approved close-up reference images.
- Verify all four alignment anchors against the fixture.
- Verify all eight screw ROIs and their tolerances.
- Calibrate the empty background under production lighting.
- Validate OK, missing-screw, position-error, extra-object, alignment-error, and replacement-part scenarios using representative images.
- Validate camera mounting, lighting, PLC handshake, and machine safety with the responsible engineering team.

## Project structure

- `src/vision` — alignment, presence, ROI inspection, OpenCV-assisted detection, and rule evaluation
- `src/hooks` — camera and inspection pipeline orchestration
- `src/components` — operator, engineering, settings, history, and integration interfaces
- `src/services` — local persistence, audio, runtime identity, and PLC adapters
- `public/master-images` — reserved for approved master assets supplied during commissioning

This repository intentionally contains no bundled production reference imagery. Master data is configured at the station through Master Setup.
