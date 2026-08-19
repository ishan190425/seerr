import PlexAPI from '@server/api/plexapi';
import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';

const getAdminPlex = async (): Promise<{
  plexClient: PlexAPI;
  plexToken: string;
} | null> => {
  const userRepository = getRepository(User);
  const admin = await userRepository.findOne({
    select: { id: true, plexToken: true },
    where: { id: 1 },
  });

  if (!admin || !admin.plexToken) {
    return null;
  }

  return {
    plexClient: new PlexAPI({ plexToken: admin.plexToken }),
    plexToken: admin.plexToken,
  };
};

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
  title: string;
  subtitle?: string;
  posterUrl?: string;
  progress: number;
  speed: number;
  eta: number;
  size: number;
}

export interface ActivityArrival {
  kind: string;
  title: string;
  subtitle?: string;
  addedAt: number;
  thumb?: string;
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

interface ArrQueueRecord {
  title?: string;
  downloadId?: string;
  size?: number;
  sizeleft?: number;
  status?: string;
  movie?: {
    title?: string;
    year?: number;
    images?: { coverType: string; remoteUrl?: string }[];
  };
  series?: {
    title?: string;
    images?: { coverType: string; remoteUrl?: string }[];
  };
  episode?: { seasonNumber?: number; episodeNumber?: number; title?: string };
}

const fetchArrQueue = async (
  dvr: { hostname: string; port: number; apiKey: string; useSsl: boolean; baseUrl?: string },
  extraParams: string
): Promise<ArrQueueRecord[]> => {
  const base = `${dvr.useSsl ? 'https' : 'http'}://${dvr.hostname}:${dvr.port}${
    dvr.baseUrl ?? ''
  }`;
  const response = await fetch(
    `${base}/api/v3/queue?pageSize=60&${extraParams}`,
    { headers: { 'X-Api-Key': dvr.apiKey } }
  );
  if (!response.ok) {
    return [];
  }
  const data = await response.json();
  return data.records ?? [];
};

const poster = (
  images?: { coverType: string; remoteUrl?: string }[]
): string | undefined =>
  images?.find((image) => image.coverType === 'poster')?.remoteUrl;

activityRoutes.get('/downloads', async (req, res) => {
  try {
    const settings = getSettings();

    // Transmission is the source of truth for speed/ETA, keyed by torrent hash
    const result = await transmissionRpc('torrent-get', {
      fields: [
        'hashString',
        'name',
        'percentDone',
        'rateDownload',
        'eta',
        'status',
        'totalSize',
      ],
    });
    const torrents = new Map(
      (result.arguments.torrents ?? []).map((torrent) => [
        String(torrent.hashString).toLowerCase(),
        torrent,
      ])
    );
    const matchedHashes = new Set<string>();

    const downloads: ActivityDownload[] = [];

    // Radarr/Sonarr queues know which movie/episode each torrent actually is
    for (const radarr of settings.radarr) {
      const records = await fetchArrQueue(radarr, 'includeMovie=true');
      for (const record of records) {
        const hash = (record.downloadId ?? '').toLowerCase();
        const torrent = torrents.get(hash);
        if (hash) {
          matchedHashes.add(hash);
        }
        if (!torrent || torrent.status !== 4) {
          continue;
        }
        downloads.push({
          name: record.title ?? String(torrent.name),
          title: record.movie?.title ?? record.title ?? String(torrent.name),
          subtitle: record.movie?.year ? String(record.movie.year) : undefined,
          posterUrl: poster(record.movie?.images),
          progress: Math.round(Number(torrent.percentDone) * 1000) / 10,
          speed: Number(torrent.rateDownload),
          eta: Number(torrent.eta),
          size: Number(torrent.totalSize),
        });
      }
    }

    for (const sonarr of settings.sonarr) {
      const records = await fetchArrQueue(
        sonarr,
        'includeSeries=true&includeEpisode=true'
      );
      for (const record of records) {
        const hash = (record.downloadId ?? '').toLowerCase();
        const torrent = torrents.get(hash);
        if (hash) {
          matchedHashes.add(hash);
        }
        if (!torrent || torrent.status !== 4) {
          continue;
        }
        const episode = record.episode;
        const episodeTag =
          episode?.seasonNumber != null && episode?.episodeNumber != null
            ? `S${episode.seasonNumber}E${episode.episodeNumber}`
            : undefined;
        downloads.push({
          name: record.title ?? String(torrent.name),
          title: record.series?.title ?? record.title ?? String(torrent.name),
          subtitle: [episodeTag, episode?.title].filter(Boolean).join(' · ') || undefined,
          posterUrl: poster(record.series?.images),
          progress: Math.round(Number(torrent.percentDone) * 1000) / 10,
          speed: Number(torrent.rateDownload),
          eta: Number(torrent.eta),
          size: Number(torrent.totalSize),
        });
      }
    }

    // Anything downloading in Transmission that no *arr claims (bot/cron adds)
    for (const [hash, torrent] of torrents) {
      if (matchedHashes.has(hash) || torrent.status !== 4) {
        continue;
      }
      downloads.push({
        name: String(torrent.name),
        title: String(torrent.name),
        progress: Math.round(Number(torrent.percentDone) * 1000) / 10,
        speed: Number(torrent.rateDownload),
        eta: Number(torrent.eta),
        size: Number(torrent.totalSize),
      });
    }

    downloads.sort((a, b) => b.speed - a.speed);

    return res.status(200).json({ downloads });
  } catch (e) {
    logger.error('Failed to fetch downloads for activity page', {
      label: 'Activity',
      errorMessage: e.message,
    });
    return res.status(500).json({ downloads: [], error: e.message });
  }
});

activityRoutes.get('/arrivals', async (req, res) => {
  try {
    const plex = await getAdminPlex();
    if (!plex) {
      return res.status(200).json({ arrivals: [] });
    }

    const settings = getSettings();
    const libraries = settings.plex.libraries.filter((l) => l.enabled);
    const since = Date.now() - 1000 * 60 * 60 * 24 * 30;

    const items = [];
    for (const library of libraries) {
      try {
        items.push(
          ...(await plex.plexClient.getRecentlyAdded(
            library.id,
            { addedAt: since },
            library.type
          ))
        );
      } catch (e) {
        logger.debug('Failed to fetch recently added for library', {
          label: 'Activity',
          library: library.name,
          errorMessage: e.message,
        });
      }
    }

    const arrivals: ActivityArrival[] = items
      .sort((a, b) => b.addedAt - a.addedAt)
      .slice(0, 24)
      .map((item) => ({
        kind: item.type,
        title:
          item.type === 'episode'
            ? item.grandparentTitle ?? item.title
            : item.title,
        subtitle:
          item.type === 'episode'
            ? `S${item.parentIndex ?? '?'}E${item.index ?? '?'} · ${item.title}`
            : item.year
              ? String(item.year)
              : undefined,
        addedAt: item.addedAt,
        thumb: item.grandparentThumb ?? item.parentThumb ?? item.thumb,
      }));

    return res.status(200).json({ arrivals });
  } catch (e) {
    logger.error('Failed to fetch arrivals for activity page', {
      label: 'Activity',
      errorMessage: e.message,
    });
    return res.status(500).json({ arrivals: [], error: e.message });
  }
});

activityRoutes.get('/image', async (req, res) => {
  try {
    const imagePath = req.query.path as string;
    if (
      !imagePath ||
      !imagePath.startsWith('/library/') ||
      imagePath.includes('..')
    ) {
      return res.status(400).send('invalid path');
    }

    const plex = await getAdminPlex();
    if (!plex) {
      return res.status(404).send('plex not configured');
    }

    const settings = getSettings();
    const protocol = settings.plex.useSsl ? 'https' : 'http';
    const response = await fetch(
      `${protocol}://${settings.plex.ip}:${settings.plex.port}${imagePath}`,
      { headers: { 'X-Plex-Token': plex.plexToken } }
    );

    if (!response.ok) {
      return res.status(404).send('not found');
    }

    res.set('Content-Type', response.headers.get('content-type') ?? 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=86400');
    return res.send(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    return res.status(500).send('error');
  }
});

export interface AiringEpisode {
  seriesTitle: string;
  episodeTitle?: string;
  season?: number;
  episode?: number;
  airDateUtc?: string;
  posterUrl?: string;
  network?: string;
  hasFile: boolean;
}

// Registered separately with plain isAuthenticated() — the homepage
// "Airing Tonight" row is for every signed-in user, not just admins.
export const airingRoutes = Router();

airingRoutes.get('/', async (req, res) => {
  try {
    const settings = getSettings();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 86400000);

    const episodes: AiringEpisode[] = [];
    for (const sonarr of settings.sonarr) {
      const base = `${sonarr.useSsl ? 'https' : 'http'}://${sonarr.hostname}:${
        sonarr.port
      }${sonarr.baseUrl ?? ''}`;
      const response = await fetch(
        `${base}/api/v3/calendar?start=${start.toISOString()}&end=${end.toISOString()}&includeSeries=true`,
        { headers: { 'X-Api-Key': sonarr.apiKey } }
      );
      if (!response.ok) {
        continue;
      }
      const records = await response.json();
      for (const record of records) {
        if (!record.monitored) {
          continue;
        }
        episodes.push({
          seriesTitle: record.series?.title ?? 'Unknown',
          episodeTitle: record.title,
          season: record.seasonNumber,
          episode: record.episodeNumber,
          airDateUtc: record.airDateUtc,
          posterUrl: poster(record.series?.images),
          network: record.series?.network,
          hasFile: !!record.hasFile,
        });
      }
    }

    episodes.sort((a, b) =>
      (a.airDateUtc ?? '').localeCompare(b.airDateUtc ?? '')
    );

    return res.status(200).json({ episodes });
  } catch (e) {
    logger.error('Failed to fetch airing episodes', {
      label: 'Activity',
      errorMessage: e.message,
    });
    return res.status(500).json({ episodes: [], error: e.message });
  }
});

export default activityRoutes;
