# Realtime Vision Inspection System

A zero-touch manufacturing vision-inspection prototype for a smartphone-mounted camera.

## Dummy master image

The bundled dummy master is a real project asset, not an inline generated data URL:

- `public/master-images/product-a-rev01-master.svg` — Product A / REV-01 / 6 screws
- `public/master-images/product-a-rev02-master.svg` — Product A / REV-02 / 8 screws

The application seeds `REV-01` as the active dummy master. Open **Engineer → Masters** to see the master image and **Edit / Calibrate** to edit anchors and screw ROIs.

## Dummy inspection flow

The stand simulator provides deterministic scenarios:

- Master Pass — all six screws present
- Shifted & Rotated — validates alignment compensation
- Missing Screw #4
- Missing Screw #2
- Screw #2 out of tolerance
- Extra screw
- Alignment failure
- Empty stand

Normal operator inspection is zero-touch. Engineering controls such as simulator selection, background calibration, master setup, and PLC configuration are restricted to the Engineer role.

## Physical camera

The inspection page uses the smartphone/browser camera when available. Mount the phone on a fixed stand and keep the inspection lighting and background consistent.

## PLC

PLC communication is abstracted behind an adapter and includes simulation, handshake, heartbeat, ACK, result timeout, stale-result protection, and interlock states. Critical machine safety functions must remain implemented in the PLC/safety hardware rather than in the browser.

## Local development

```bash
npm install
npm run dev
```

The project is built with React + Vite and stores the demo master/inspection history locally using IndexedDB.

## Golden reference images

Each inspection point can have a close-up reference image stored under:

`public/master-images/references/<revision>/`

The master revision stores these in `referenceImages`, each linked to its `roiId`. Engineer → Masters → Edit / Calibrate shows the reference set side-by-side, and the live ROI validation cards can show the linked golden reference for quick NG verification.

For real projects, replace the bundled dummy PNGs with the actual close-up reference images for each inspection point and keep the ROI mapping stable.

## UI Direction

The interface has been refined into a cleaner industrial control-room style:
- graphite/charcoal surfaces instead of high-saturation neon panels
- teal used as the primary system accent; green/red reserved for inspection states
- compact, consistent navigation with dedicated industrial Lucide icons
- softer borders and reduced corner radius for a technical, professional appearance
- high-contrast operator result states remain intentionally large for stand-mounted viewing
- engineering/diagnostic screens share the same visual language

The core inspection, alignment, rule-engine, reference-image, database, and PLC logic remains intact.
