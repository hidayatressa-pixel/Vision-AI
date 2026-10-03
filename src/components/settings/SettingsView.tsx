import React, { useState } from 'react';
import { Boxes, Camera, Cable, Gauge, LockKeyhole, X } from 'lucide-react';
import { ActiveTab } from '../Navbar';

interface SettingsViewProps {
  onNavigate: (tab: ActiveTab) => void;
  onClose: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onNavigate, onClose }) => {
  const [password, setPassword] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState('');

  const unlock = () => {
    if (password === '8888') {
      setUnlocked(true);
      setError('');
      return;
    }
    setError('Password salah');
    setPassword('');
  };

  if (!unlocked) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900/95 p-7 shadow-2xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400">
            <LockKeyhole className="h-7 w-7" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-bold text-white">Settings</h2>
            <p className="mt-1 text-xs text-slate-400">Engineering settings require authorization.</p>
          </div>
          <input
            autoFocus
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={password}
            onChange={(e) => setPassword(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && unlock()}
            placeholder="Enter password"
            className="mt-6 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-center text-lg tracking-[0.5em] text-white outline-none focus:border-amber-400"
          />
          {error && <div className="mt-2 text-center text-xs text-red-400">{error}</div>}
          <button onClick={unlock} className="mt-4 w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400">Unlock Settings</button>
          <button onClick={onClose} className="mt-3 w-full rounded-xl border border-slate-800 px-4 py-2.5 text-xs text-slate-400 hover:text-white">Cancel</button>
        </div>
      </div>
    );
  }

  const items: Array<{ label: string; description: string; icon: React.ReactNode; tab: ActiveTab }> = [
    { label: 'Master & Inspection', description: 'Product master, six references, ROI and tolerances.', icon: <Boxes />, tab: 'MASTERS' },
    { label: 'Camera', description: 'Camera device and calibration.', icon: <Camera />, tab: 'CAMERA_SETUP' },
    { label: 'PLC', description: 'Trigger, handshake and PLC configuration.', icon: <Cable />, tab: 'PLC_SETUP' },
    { label: 'Diagnostics', description: 'Technical runtime metrics and troubleshooting.', icon: <Gauge />, tab: 'DIAGNOSTICS' },
  ];

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/80 px-5 py-4">
        <div>
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-amber-400">Engineering Access</div>
          <h1 className="mt-1 text-xl font-bold text-white">System Settings</h1>
          <p className="text-xs text-slate-400">Protected configuration area.</p>
        </div>
        <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X /></button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {items.map((item) => (
          <button key={item.tab} onClick={() => onNavigate(item.tab)} className="group flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-left transition hover:border-cyan-500/40 hover:bg-slate-900">
            <div className="rounded-xl bg-slate-950 p-3 text-cyan-400 group-hover:text-cyan-300">{React.cloneElement(item.icon as React.ReactElement, { className: 'h-5 w-5' })}</div>
            <div><div className="font-semibold text-white">{item.label}</div><div className="mt-1 text-xs text-slate-500">{item.description}</div></div>
          </button>
        ))}
      </div>
    </section>
  );
};
