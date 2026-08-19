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

export default activityRoutes;
