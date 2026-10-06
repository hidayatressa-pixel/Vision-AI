import Peer, { MediaConnection } from 'peerjs';

export interface RemoteCameraSession {
  getPeerId: () => string;
  waitForController: (controllerId: string, stream: MediaStream) => Promise<void>;
  startController: (onStream: (stream: MediaStream) => void) => Promise<string>;
  stop: () => void;
}

type DebugPeerConnection = RTCPeerConnection & {
  __visionStatsTimer?: number;
  __visionCleanup?: () => void;
};

function attachWebRtcDiagnostics(call: MediaConnection, role: 'controller' | 'phone') {
  const connection = (call as MediaConnection & {
    peerConnection?: RTCPeerConnection;
  }).peerConnection as DebugPeerConnection | undefined;

  if (!connection) {
    console.warn('[WEBRTC] peerConnection is not exposed by PeerJS', { role });
    return;
  }

  const logConnectionState = (event: string) => {
    console.info('[WEBRTC]', event, {
      role,
      connectionState: connection.connectionState,
      iceConnectionState: connection.iceConnectionState,
      iceGatheringState: connection.iceGatheringState,
      signalingState: connection.signalingState,
    });
  };

  const logReceivers = () => {
    const receivers = connection.getReceivers();
    console.info('[WEBRTC] receivers', {
      role,
      count: receivers.length,
      tracks: receivers.map((receiver) => ({
        kind: receiver.track?.kind,
        id: receiver.track?.id,
        readyState: receiver.track?.readyState,
        enabled: receiver.track?.enabled,
        muted: receiver.track?.muted,
      })),
    });
  };

  const logStats = async () => {
    try {
      const stats = await connection.getStats();
      const inboundVideo: Record<string, unknown>[] = [];
      const candidatePairs: Record<string, unknown>[] = [];

      stats.forEach((report) => {
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          inboundVideo.push({
            id: report.id,
            packetsReceived: report.packetsReceived,
            packetsLost: report.packetsLost,
            bytesReceived: report.bytesReceived,
            framesReceived: report.framesReceived,
            framesDecoded: report.framesDecoded,
            framesDropped: report.framesDropped,
            keyFramesDecoded: report.keyFramesDecoded,
            frameWidth: report.frameWidth,
            frameHeight: report.frameHeight,
            framesPerSecond: report.framesPerSecond,
            jitter: report.jitter,
          });
        }

        if (report.type === 'candidate-pair' && (report.state === 'succeeded' || report.nominated)) {
          candidatePairs.push({
            id: report.id,
            state: report.state,
            nominated: report.nominated,
            currentRoundTripTime: report.currentRoundTripTime,
            availableIncomingBitrate: report.availableIncomingBitrate,
            availableOutgoingBitrate: report.availableOutgoingBitrate,
            bytesReceived: report.bytesReceived,
            bytesSent: report.bytesSent,
            localCandidateId: report.localCandidateId,
            remoteCandidateId: report.remoteCandidateId,
          });
        }
      });

      console.info('[WEBRTC RTP] stats', {
        role,
        connectionState: connection.connectionState,
        iceConnectionState: connection.iceConnectionState,
        inboundVideo,
        candidatePairs,
      });

      logReceivers();
    } catch (error) {
      console.warn('[WEBRTC RTP] stats error', { role, error });
    }
  };

  connection.addEventListener('connectionstatechange', () => logConnectionState('connectionstatechange'));
  connection.addEventListener('iceconnectionstatechange', () => logConnectionState('iceconnectionstatechange'));
  connection.addEventListener('icegatheringstatechange', () => logConnectionState('icegatheringstatechange'));
  connection.addEventListener('signalingstatechange', () => logConnectionState('signalingstatechange'));
  connection.addEventListener('icecandidateerror', (event) => {
    console.warn('[WEBRTC] icecandidateerror', {
      role,
      errorCode: event.errorCode,
      errorText: event.errorText,
      address: event.address,
      port: event.port,
      url: event.url,
    });
  });
  connection.addEventListener('track', (event) => {
    console.info('[WEBRTC] remote track', {
      role,
      kind: event.track.kind,
      id: event.track.id,
      readyState: event.track.readyState,
      enabled: event.track.enabled,
      muted: event.track.muted,
      streams: event.streams.map((stream) => stream.id),
    });
  });

  logConnectionState('attached');
  logReceivers();
  void logStats();

  const timer = window.setInterval(() => {
    void logStats();
  }, 2000);

  connection.__visionStatsTimer = timer;
  connection.__visionCleanup = () => {
    window.clearInterval(timer);
    connection.__visionStatsTimer = undefined;
    connection.__visionCleanup = undefined;
  };
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
      attachWebRtcDiagnostics(call, 'phone');

      call.on('error', (error) => {
        console.error('[WEBRTC] phone call error', error);
      });

      call.on('close', () => {
        console.info('[WEBRTC] phone call closed');
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

        attachWebRtcDiagnostics(incoming, 'controller');

        incoming.on('error', (error) => {
          console.error('[WEBRTC] controller call error', error);
        });

        // Register the stream listener before answering so a fast WebRTC
        // negotiation cannot deliver the remote MediaStream before the handler exists.
        incoming.on('stream', onStream);
        incoming.answer();

        incoming.on('close', () => {
          console.info('[WEBRTC] controller call closed');
          if (call === incoming) call = null;
        });
      });

      return peer.id;
    },

    stop: () => {
      const activeCall = call;
      if (activeCall) {
        const connection = (activeCall as MediaConnection & {
          peerConnection?: RTCPeerConnection;
        }).peerConnection as DebugPeerConnection | undefined;
        connection?.__visionCleanup?.();
        activeCall.close();
      }

      peer?.destroy();
      call = null;
      peer = null;
    },
  };
}
