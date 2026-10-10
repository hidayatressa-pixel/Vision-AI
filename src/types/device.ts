/**
 * Camera/device source model.
 *
 * The inspection pipeline should consume frames, not care where the frames
 * originate. This keeps the Vision/OpenCV engine reusable across phone,
 * laptop/USB, and future industrial cameras.
 */
export type CameraSourceMode =
  | 'PHONE_FULL'
  | 'PHONE_REMOTE'
  | 'LOCAL_CAMERA'
  | 'VIRTUAL';

export interface CameraSourceDescriptor {
  mode: CameraSourceMode;
  label: string;
  description: string;
  isRemote: boolean;
}

export const CAMERA_SOURCE_OPTIONS: CameraSourceDescriptor[] = [
  {
    mode: 'PHONE_FULL',
    label: 'HP Full',
    description: 'HP menjadi kamera sekaligus menjalankan Vision Station.',
    isRemote: false,
  },
  {
    mode: 'PHONE_REMOTE',
    label: 'HP → Laptop',
    description: 'HP sebagai kamera; laptop menangani monitoring, Master Setting, dan OpenCV.',
    isRemote: true,
  },
  {
    mode: 'LOCAL_CAMERA',
    label: 'Laptop / USB Camera',
    description: 'Kamera yang terhubung langsung ke laptop.',
    isRemote: false,
  },
  {
    mode: 'VIRTUAL',
    label: 'Virtual Simulator',
    description: 'Generator frame untuk testing tanpa kamera.',
    isRemote: false,
  },
];
