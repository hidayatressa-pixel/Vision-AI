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

  const waitForPeerOpen = (nextPeer: Peer) =>
    new Promise<void>((resolve, reject) => {
      nextPeer.once('open', () => resolve());
      nextPeer.once('error', reject);
    });

  return {
    getPeerId: () => peer?.id || '',

    waitForController: async (controllerId, stream) => {
      peer?.destroy();
      peer = new Peer();
      await waitForPeerOpen(peer);
      call = peer.call(controllerId, stream);
      call.on('close', () => {
        call = null;
      });
    },

    startController: async (onStream) => {
      peer?.destroy();
      peer = new Peer();
      await waitForPeerOpen(peer);

      peer.on('call', (incoming) => {
        call?.close();
        call = incoming;
        // Register the stream listener before answering so a fast WebRTC
        // negotiation cannot deliver the remote MediaStream before the handler exists.
        incoming.on('stream', onStream);
        incoming.answer();
        incoming.on('close', () => {
          if (call === incoming) call = null;
        });
      });

      return peer.id;
    },

    stop: () => {
      call?.close();
      peer?.destroy();
      call = null;
      peer = null;
    },
  };
}
