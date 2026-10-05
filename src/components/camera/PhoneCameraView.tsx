import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, CircleAlert } from 'lucide-react';
import { createRemoteCameraSession } from '../../services/remoteCamera';

export const PhoneCameraView: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef(createRemoteCameraSession());
  const [status, setStatus] = useState<'starting' | 'connected' | 'error'>('starting');
  const [message, setMessage] = useState('Requesting camera access...');

  useEffect(() => {
    let cancelled = false;
    const controllerId = new URLSearchParams(window.location.search).get('session');

    if (!controllerId) {
      setStatus('error');
      setMessage('Missing laptop pairing session.');
      return;
    }

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera API is not available in this browser.');
        }

        // Start with the least restrictive camera request. Some Android browsers
        // can leave a high-resolution/framerate constraint request pending instead
        // of rejecting it. We can still use the native camera resolution for Vision.
        const streamPromise = navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
          window.setTimeout(
            () => reject(new Error('Camera request timed out. Check browser camera permission and try again.')),
            15000
          );
        });

        const stream = await Promise.race([streamPromise, timeoutPromise]);

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }

        await sessionRef.current.waitForController(controllerId, stream);
        if (!cancelled) {
          setStatus('connected');
          setMessage('Camera is streaming to Vision AI laptop.');
        }
      } catch (error) {
        console.error('Phone camera connection error:', error);
        if (!cancelled) {
          setStatus('error');
          const errorName = error instanceof DOMException ? error.name : '';
          if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
            setMessage('Camera permission is blocked. Allow camera access for this site, then reload this page.');
          } else if (errorName === 'NotFoundError') {
            setMessage('No camera was found on this phone.');
          } else if (errorName === 'NotReadableError' || errorName === 'AbortError') {
            setMessage('The camera is busy or unavailable. Close other camera apps and reload.');
          } else {
            setMessage(error instanceof Error ? error.message : 'Unable to start phone camera.');
          }
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      sessionRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="p-5 border-b border-slate-800 flex items-center gap-3">
        <Camera className="w-6 h-6 text-cyan-400" />
        <div>
          <div className="font-bold tracking-wide">VISION AI CAMERA</div>
          <div className="text-[10px] text-slate-500 font-mono">PHONE CAMERA DEVICE</div>
        </div>
      </header>

      <main className="flex-1 p-4 flex flex-col gap-4">
        <div className="aspect-video bg-black rounded-2xl overflow-hidden border border-slate-800">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        </div>

        <div className={`rounded-2xl border p-4 flex items-center gap-3 ${status === 'connected' ? 'border-emerald-500/40 bg-emerald-500/5' : status === 'error' ? 'border-red-500/40 bg-red-500/5' : 'border-cyan-500/30 bg-cyan-500/5'}`}>
          {status === 'connected' ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : status === 'error' ? <CircleAlert className="w-5 h-5 text-red-400" /> : <Camera className="w-5 h-5 text-cyan-400 animate-pulse" />}
          <div>
            <div className="font-bold text-sm">{status === 'connected' ? 'CONNECTED' : status === 'error' ? 'CONNECTION ERROR' : 'CONNECTING...'}</div>
            <div className="text-xs text-slate-400 mt-1">{message}</div>
          </div>
        </div>

        <div className="text-center text-[10px] text-slate-600 font-mono">
          Keep this page open while Vision AI performs the inspection on the laptop.
        </div>
      </main>
    </div>
  );
};
