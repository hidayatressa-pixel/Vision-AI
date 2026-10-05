import Peer, { MediaConnection } from 'peerjs';

export interface RemoteCameraSession {
  getPeerId: () => string;
  waitForController: (controllerId: string, stream: MediaStream) => Promise<void>;
  startController: (onStream: (stream: MediaStream) => void) => Promise<string>;
  stop: () => void;
}

export function createRemoteCameraSession(): RemoteCameraSession {
  let peer: Peer | null = null;
  let call: MediaConnection | null = null;
  return {
    getPeerId: () => peer?.id || '',
    waitForController: async (controllerId, stream) => {
      peer = new Peer();
      await new Promise<void>((resolve, reject) => {
        peer!.on('open', () => resolve());
        peer!.on('error', reject);
      });
      call = peer.call(controllerId, stream);
    },
    startController: async (onStream) => {
      const id = 'vision-' + crypto.randomUUID().slice(0, 8);
      peer = new Peer(id);
      await new Promise<void>((resolve, reject) => {
        peer!.on('open', () => resolve());
        peer!.on('error', reject);
      });
      peer.on('call', incoming => {
        call = incoming;
        incoming.answer();
        incoming.on('stream', onStream);
      });
      return peer.id;
    },
    stop: () => { call?.close(); peer?.destroy(); call = null; peer = null; },
  };
}