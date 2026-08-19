import PlexAPI from '@server/api/plexapi';
import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import logger from '@server/logger';
import { Router } from 'express';

export interface ActivitySession {
  title: string;
  subtitle?: string;
  mediaType: string;
  user: string;
  player: string;
  state: string;
  duration: number;
  viewOffset: number;
}

const activityRoutes = Router();

activityRoutes.get('/sessions', async (req, res) => {
  try {
    const userRepository = getRepository(User);
    const admin = await userRepository.findOne({
      select: { id: true, plexToken: true },
      where: { id: 1 },
    });

    if (!admin) {
      return res.status(200).json({ sessions: [] });
    }

    const plexClient = new PlexAPI({ plexToken: admin.plexToken });
    const rawSessions = await plexClient.getSessions();

    const sessions: ActivitySession[] = rawSessions.map((session) => ({
      title:
        session.type === 'episode'
          ? session.grandparentTitle ?? session.title
          : session.title,
      subtitle:
        session.type === 'episode'
          ? `S${session.parentIndex ?? '?'}E${session.index ?? '?'} · ${
              session.title
            }`
          : session.year
            ? `${session.year}`
            : undefined,
      mediaType: session.type,
      user: session.User?.title ?? 'Unknown',
      player:
        session.Player?.product ??
        session.Player?.title ??
        session.Player?.device ??
        'Unknown device',
      state: session.Player?.state ?? 'playing',
      duration: session.duration ?? 0,
      viewOffset: session.viewOffset ?? 0,
    }));

    return res.status(200).json({ sessions });
  } catch (e) {
    logger.error('Failed to fetch Plex sessions for activity page', {
      label: 'Activity',
      errorMessage: e.message,
    });
    return res.status(500).json({ sessions: [], error: e.message });
  }
});

export interface ActivityDownload {
  name: string;
  progress: number;
  speed: number;
  eta: number;
  size: number;
}

// Transmission runs on the same host (TransmissionVPN container, RPC bound to
// localhost:9080, no auth). The RPC requires a session-id handshake via 409.
const TRANSMISSION_RPC_URL = 'http://localhost:9080/transmission/rpc';
let transmissionSessionId = '';

const transmissionRpc = async (
  method: string,
  args: Record<string, unknown>
): Promise<{ arguments: { torrents: Record<string, number | string>[] } }> => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(TRANSMISSION_RPC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Transmission-Session-Id': transmissionSessionId,
      },
      body: JSON.stringify({ method, arguments: args }),
    });

    if (response.status === 409) {
      transmissionSessionId =
        response.headers.get('X-Transmission-Session-Id') ?? '';
      continue;
    }

    return await response.json();
  }
  throw new Error('Transmission session handshake failed');
};

activityRoutes.get('/downloads', async (req, res) => {
  try {
    const result = await transmissionRpc('torrent-get', {
      fields: ['name', 'percentDone', 'rateDownload', 'eta', 'status', 'totalSize'],
    });

    // status 4 = actively downloading
    const downloads: ActivityDownload[] = (result.arguments.torrents ?? [])
      .filter((torrent) => torrent.status === 4)
      .map((torrent) => ({
        name: String(torrent.name),
        progress: Math.round(Number(torrent.percentDone) * 1000) / 10,
        speed: Number(torrent.rateDownload),
        eta: Number(torrent.eta),
        size: Number(torrent.totalSize),
      }));

    return res.status(200).json({ downloads });
  } catch (e) {
    logger.error('Failed to fetch Transmission downloads for activity page', {
      label: 'Activity',
      errorMessage: e.message,
    });
    return res.status(500).json({ downloads: [], error: e.message });
  }
});

export default activityRoutes;
