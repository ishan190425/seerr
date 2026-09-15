import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';
import { getAdminPlex, plexImageHandler } from './activity';

const feedRoutes = Router();

export interface FeedEvent {
  kind: 'watched' | 'added';
  mediaType: string;
  title: string;
  subtitle?: string;
  user?: string;
  at: number;
  thumb?: string;
}

// The merged feed is rebuilt at most once a minute and paginated from
// memory — deep enough for a long scroll without hammering Plex
let cachedFeed: FeedEvent[] = [];
let cachedFeedAt = 0;
let building: Promise<void> | null = null;
const FEED_CACHE_TTL = 60_000;
const HISTORY_DEPTH = 1000;
const ARRIVALS_DAYS = 120;

const buildFeed = async (): Promise<void> => {
  const plex = await getAdminPlex();
  if (!plex) {
    cachedFeed = [];
    cachedFeedAt = Date.now();
    return;
  }

  const settings = getSettings();
  const libraries = settings.plex.libraries.filter((l) => l.enabled);
  const since = Date.now() - 1000 * 60 * 60 * 24 * ARRIVALS_DAYS;

  const [history, accounts, ...libraryItems] = await Promise.all([
    plex.plexClient.getWatchHistory(HISTORY_DEPTH),
    plex.plexClient.getServerAccounts().catch(() => new Map<number, string>()),
    ...libraries.map((library) =>
      plex.plexClient
        .getRecentlyAdded(library.id, { addedAt: since }, library.type)
        .catch(() => [])
    ),
  ]);

  const events: FeedEvent[] = [];

  for (const item of history) {
    events.push({
      kind: 'watched',
      mediaType: item.type,
      title:
        item.type === 'episode'
          ? item.grandparentTitle ?? item.title
          : item.title,
      subtitle:
        item.type === 'episode'
          ? `S${item.parentIndex ?? '?'}E${item.index ?? '?'} · ${item.title}`
          : undefined,
      user:
        (item.accountID != null ? accounts.get(item.accountID) : undefined) ??
        'Someone',
      at: item.viewedAt * 1000,
      thumb: item.grandparentThumb ?? item.parentThumb ?? item.thumb,
    });
  }

  for (const item of libraryItems.flat()) {
    events.push({
      kind: 'added',
      mediaType: item.type,
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
      at: item.addedAt * 1000,
      thumb: item.grandparentThumb ?? item.parentThumb ?? item.thumb,
    });
  }

  events.sort((a, b) => b.at - a.at);
  cachedFeed = events;
  cachedFeedAt = Date.now();
};

feedRoutes.get('/', async (req, res) => {
  try {
    if (Date.now() - cachedFeedAt > FEED_CACHE_TTL) {
      // Coalesce concurrent rebuilds
      building = building ?? buildFeed().finally(() => (building = null));
      await building;
    }

    const offset = Math.max(0, Number(req.query.offset) || 0);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const events = cachedFeed.slice(offset, offset + limit);

    return res.status(200).json({
      events,
      offset,
      total: cachedFeed.length,
      hasMore: offset + limit < cachedFeed.length,
    });
  } catch (e) {
    logger.error('Failed to build feed', {
      label: 'Feed',
      errorMessage: e.message,
    });
    return res.status(500).json({ events: [], hasMore: false });
  }
});

feedRoutes.get('/image', plexImageHandler);

export default feedRoutes;
