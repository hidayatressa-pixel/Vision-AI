import { useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, LockKeyhole, ScanLine, ServerCog, ShieldCheck, Sparkles, XCircle } from 'lucide-react';

type Screen = 'welcome' | 'pin' | 'setup';

const DEFAULT_API_URL = import.meta.env.VITE_ANALYZER_API_URL ?? '';

export default function App() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem('vision-ai-analyzer-url') ?? DEFAULT_API_URL);
  const [saved, setSaved] = useState(false);

  function unlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const expectedPin = import.meta.env.VITE_ENGINEERING_PIN ?? '8888';
    if (pin === expectedPin) {
      setPin('');
      setPinError('');
      setScreen('setup');
      return;
    }
    setPin('');
    setPinError('Incorrect PIN. Please try again.');
  }

  function saveSetup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = apiUrl.trim().replace(/\/$/, '');
    if (normalized && !/^https?:\/\//i.test(normalized)) {
      setSaved(false);
      return;
    }
    localStorage.setItem('vision-ai-analyzer-url', normalized);
    setApiUrl(normalized);
    setSaved(true);
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <header className="topbar">
        <div className="brand-mark"><ScanLine size={21} /></div>
        <div>
          <div className="brand-name">VISION STATION</div>
          <div className="brand-subtitle">INTELLIGENT VISUAL INSPECTION · AWS EDITION</div>
        </div>
        <span className="environment-pill"><span /> AWS WORKSPACE</span>
      </header>

      <main className="main-content">
        {screen === 'welcome' && (
          <section className="panel welcome-panel">
            <div className="hero-icon"><ScanLine size={42} strokeWidth={1.5} /></div>
            <div className="eyebrow">INTELLIGENT VISUAL INSPECTION</div>
            <h1>VISION STATION</h1>
            <p className="lead">Precision in every inspection.<br />Quality in every part.</p>
            <div className="rule" />
            <div className="notice">
              <ShieldCheck size={21} />
              <div><strong>First-time setup</strong><p>Complete the initial setup and verify engineering access to continue.</p></div>
            </div>
            <button className="primary-button" onClick={() => setScreen('pin')}>
              <span className="button-label"><Sparkles size={17} /> First Setup &amp; Security PIN</span>
              <span className="button-arrow"><ArrowRight size={19} /></span>
            </button>
            <p className="security-note">ENGINEERING ACCESS · AUTHORIZED PERSONNEL ONLY</p>
          </section>
        )}

        {screen === 'pin' && (
          <section className="panel form-panel">
            <button className="back-link" onClick={() => { setScreen('welcome'); setPinError(''); }}><ArrowLeft size={15} /> Back to welcome</button>
            <div className="form-icon amber"><LockKeyhole size={28} /></div>
            <div className="eyebrow amber-text">AUTHORIZED PERSONNEL</div>
            <h2>Engineering Access</h2>
            <p className="muted">Enter your security PIN to continue to initial setup.</p>
            <form onSubmit={unlock}>
              <label className="sr-only" htmlFor="engineering-pin">Engineering PIN</label>
              <input id="engineering-pin" autoFocus type="password" inputMode="numeric" autoComplete="current-password" maxLength={4} pattern="[0-9]{4}" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Enter 4-digit PIN" aria-describedby={pinError ? 'pin-error' : undefined} required />
              {pinError && <p className="error-message" id="pin-error" role="alert">{pinError}</p>}
              <button className="primary-button amber-button" type="submit"><span className="button-label">Unlock <ArrowRight size={17} /></span></button>
            </form>
          </section>
        )}

        {screen === 'setup' && (
          <section className="panel setup-panel">
            <button className="back-link" onClick={() => { setScreen('welcome'); setSaved(false); }}><ArrowLeft size={15} /> Return to welcome</button>
            <div className="form-icon"><ServerCog size={28} /></div>
            <div className="eyebrow">ENGINEERING WORKSPACE</div>
            <h2>Initial Setup</h2>
            <p className="muted">Configure the API Gateway endpoint for the AWS image analyzer. Leave it blank if the backend has not been deployed yet.</p>
            <form onSubmit={saveSetup}>
              <label htmlFor="api-url">Analyzer API endpoint</label>
              <input id="api-url" type="url" placeholder="https://your-api.execute-api.region.amazonaws.com/Prod/analyze" value={apiUrl} onChange={(event) => { setApiUrl(event.target.value); setSaved(false); }} />
              <p className="field-help">Expected endpoint: API Gateway POST /analyze. The URL is saved in this browser only.</p>
              <button className="primary-button" type="submit"><span className="button-label">Save setup <ArrowRight size={17} /></span></button>
            </form>
            {saved && <div className="status-message success"><CheckCircle2 size={18} /> Setup saved in this browser.</div>}
            {!saved && apiUrl && !/^https?:\/\//i.test(apiUrl.trim()) && <div className="status-message error"><XCircle size={18} /> Enter a valid http or https URL.</div>}
            <div className="backend-card"><span className="backend-dot" /><div><strong>AWS analyzer status</strong><p>Endpoint configured does not mean the AWS stack is deployed or reachable. Test connectivity after deployment.</p></div></div>
          </section>
        )}
      </main>
      <footer>VISION STATION <span>•</span> AWS EVIDENCE ANALYZER</footer>
    </div>
  );
}