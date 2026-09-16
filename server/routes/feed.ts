import type { PlexMetadata } from '@server/api/plexapi';
import RadarrAPI from '@server/api/servarr/radarr';
import SonarrAPI from '@server/api/servarr/sonarr';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';
import { getAdminPlex, plexImageHandler } from './activity';

const feedRoutes = Router();

export interface FeedEvent {
  kind: 'watched' | 'added' | 'upgraded';
  mediaType: string;
  title: string;
  subtitle?: string;
  user?: string;
  at: number;
  thumb?: string;
  /** Plex rating keys used to enrich the event lazily (never sent to clients) */
  itemKey?: string;
  showKey?: string;
  // Enriched, notification-style fields (filled in per page)
  season?: number;
  episode?: number;
  year?: number;
  quality?: string;
  runtime?: number;
  imdbId?: string;
  rating?: number;
  genres?: string[];
  art?: string;
}

// The merged feed is rebuilt at most once a minute and paginated from
// memory — deep enough for a long scroll without hammering Plex
let cachedFeed: FeedEvent[] = [];
let cachedFeedAt = 0;
let building: Promise<void> | null = null;
const FEED_CACHE_TTL = 60_000;
const HISTORY_DEPTH = 1000;
const ARRIVALS_DAYS = 120;

// Item metadata rarely changes, so cache it for a long time keyed by ratingKey
const metadataCache = new Map<string, Promise<PlexMetadata | null>>();
const METADATA_CACHE_MAX = 5000;

// An import counts as an upgrade when the previous file was deleted for
// that reason shortly before it
const UPGRADE_WINDOW_MS = 30 * 60_000;

const isUpgradeImport = (
  importedAt: number,
  deletions: number[] | undefined
): boolean =>
  Boolean(
    deletions?.some(
      (deletedAt) =>
        deletedAt <= importedAt + 60_000 &&
        importedAt - deletedAt < UPGRADE_WINDOW_MS
    )
  );

/**
 * Upgrades from Radarr/Sonarr history, matched back to Plex items through
 * Seerr's media table so they get the same poster/IMDb enrichment
 */
const collectUpgrades = async (): Promise<FeedEvent[]> => {
  const settings = getSettings();
  const events: FeedEvent[] = [];

  const [radarrResults, sonarrResults] = await Promise.all([
    Promise.all(
      settings.radarr.map((instance) =>
        new RadarrAPI({
          apiKey: instance.apiKey,
          url: RadarrAPI.buildUrl(instance, '/api/v3'),
        })
          .getHistory()
          .catch(() => [])
      )
    ),
    Promise.all(
      settings.sonarr.map((instance) =>
        new SonarrAPI({
          apiKey: instance.apiKey,
          url: SonarrAPI.buildUrl(instance, '/api/v3'),
        })
          .getHistory()
          .catch(() => [])
      )
    ),
  ]);

  const mediaRepository = getRepository(Media);

  for (const records of radarrResults) {
    const deletions = new Map<number, number[]>();
    for (const record of records) {
      if (
        record.eventType === 'movieFileDeleted' &&
        record.data?.reason === 'Upgrade'
      ) {
        deletions.set(record.movieId, [
          ...(deletions.get(record.movieId) ?? []),
          Date.parse(record.date),
        ]);
      }
    }
    const upgrades = records.filter(
      (record) =>
        record.eventType === 'downloadFolderImported' &&
        record.movie &&
        isUpgradeImport(Date.parse(record.date), deletions.get(record.movieId))
    );
    const tmdbIds = [
      ...new Set(upgrades.map((r) => r.movie?.tmdbId).filter(Boolean)),
    ] as number[];
    const media = tmdbIds.length
      ? await mediaRepository
          .createQueryBuilder('media')
          .where('media.tmdbId IN (:...tmdbIds)', { tmdbIds })
          .andWhere('media.mediaType = :mediaType', {
            mediaType: MediaType.MOVIE,
          })
          .getMany()
      : [];
    const keyByTmdb = new Map(
      media.map((m) => [m.tmdbId, m.ratingKey ?? m.ratingKey4k ?? undefined])
    );
    for (const record of upgrades) {
      const movie = record.movie;
      if (!movie) {
        continue;
      }
      events.push({
        kind: 'upgraded',
        mediaType: 'movie',
        title: movie.title,
        year: movie.year,
        quality: record.quality?.quality?.name,
        runtime: movie.runtime || undefined,
        at: Date.parse(record.date),
        itemKey: movie.tmdbId ? keyByTmdb.get(movie.tmdbId) : undefined,
      });
    }
  }

  for (const records of sonarrResults) {
    const deletions = new Map<number, number[]>();
    for (const record of records) {
      if (
        record.eventType === 'episodeFileDeleted' &&
        record.data?.reason === 'Upgrade'
      ) {
        deletions.set(record.episodeId, [
          ...(deletions.get(record.episodeId) ?? []),
          Date.parse(record.date),
        ]);
      }
    }
    const upgrades = records.filter(
      (record) =>
        record.eventType === 'downloadFolderImported' &&
        record.series &&
        record.episode &&
        isUpgradeImport(
          Date.parse(record.date),
          deletions.get(record.episodeId)
        )
    );
    const tvdbIds = [
      ...new Set(upgrades.map((r) => r.series?.tvdbId).filter(Boolean)),
    ] as number[];
    const media = tvdbIds.length
      ? await mediaRepository
          .createQueryBuilder('media')
          .where('media.tvdbId IN (:...tvdbIds)', { tvdbIds })
          .andWhere('media.mediaType = :mediaType', {
            mediaType: MediaType.TV,
          })
          .getMany()
      : [];
    const keyByTvdb = new Map(
      media.map((m) => [m.tvdbId, m.ratingKey ?? m.ratingKey4k ?? undefined])
    );
    for (const record of upgrades) {
      const series = record.series;
      const episode = record.episode;
      if (!series || !episode) {
        continue;
      }
      events.push({
        kind: 'upgraded',
        mediaType: 'episode',
        title: series.title,
        subtitle: episode.title,
        season: episode.seasonNumber,
        episode: episode.episodeNumber,
        year: series.year,
        quality: record.quality?.quality?.name,
        runtime: episode.runtime || series.runtime || undefined,
        at: Date.parse(record.date),
        showKey: series.tvdbId ? keyByTvdb.get(series.tvdbId) : undefined,
      });
    }
  }

  return events;
};

const ratingKeyFromKey = (key?: string): string | undefined =>
  key?.match(/\/library\/metadata\/(\d+)/)?.[1];

const getCachedMetadata = (
  fetcher: (key: string) => Promise<PlexMetadata>,
  key: string
): Promise<PlexMetadata | null> => {
  let cached = metadataCache.get(key);
  if (!cached) {
    if (metadataCache.size >= METADATA_CACHE_MAX) {
      metadataCache.clear();
    }
    cached = fetcher(key).catch(() => null);
    metadataCache.set(key, cached);
  }
  return cached;
};

const SOURCE_TAGS: [RegExp, string][] = [
  [/\bremux\b/i, 'Remux'],
  [/\bweb[-. ]?dl\b/i, 'WEBDL'],
  [/\bweb[-. ]?rip\b/i, 'WEBRip'],
  [/\bweb\b/i, 'WEB'],
  [/\b(blu[-. ]?ray|bdrip|brrip)\b/i, 'Bluray'],
  [/\bhdtv\b/i, 'HDTV'],
  [/\b(dvd|dvdrip)\b/i, 'DVD'],
];

const RESOLUTIONS: Record<string, string> = {
  '4k': '2160p',
  '2160': '2160p',
  '1080': '1080p',
  '720': '720p',
  '576': '576p',
  '480': '480p',
  sd: 'SD',
};

const qualityLabel = (item: PlexMetadata): string | undefined => {
  const media = item.Media?.[0];
  if (!media) {
    return undefined;
  }
  const resolution = media.videoResolution
    ? (RESOLUTIONS[media.videoResolution.toLowerCase()] ??
      `${media.videoResolution}p`)
    : undefined;
  const file = media.Part?.[0]?.file ?? '';
  const source = SOURCE_TAGS.find(([re]) => re.test(file))?.[1];
  return [source, resolution].filter(Boolean).join('-') || undefined;
};

const imdbIdOf = (item?: PlexMetadata | null): string | undefined =>
  item?.Guid?.find((g) => g.id.startsWith('imdb://'))?.id.replace(
    'imdb://',
    ''
  );

const enrichEvent = async (
  fetcher: (key: string) => Promise<PlexMetadata>,
  event: FeedEvent
): Promise<FeedEvent> => {
  const { itemKey, showKey, ...publicEvent } = event;
  if (!itemKey && !showKey) {
    return publicEvent;
  }
  const [item, show] = await Promise.all([
    itemKey ? getCachedMetadata(fetcher, itemKey) : Promise.resolve(null),
    showKey ? getCachedMetadata(fetcher, showKey) : Promise.resolve(null),
  ]);
  // Rating, genres and the IMDb id come from the series for episodes
  const info = show ?? item;
  if (!info) {
    return publicEvent;
  }
  return {
    ...publicEvent,
    year: info.year ?? publicEvent.year,
    quality: publicEvent.quality ?? (item ? qualityLabel(item) : undefined),
    runtime:
      publicEvent.runtime ??
      (item?.duration ? Math.round(item.duration / 60_000) : undefined),
    imdbId: imdbIdOf(show) ?? imdbIdOf(item),
    rating: info.audienceRating ?? info.rating,
    genres: info.Genre?.slice(0, 3).map((g) => g.tag),
    art: info.art ?? item?.grandparentArt ?? item?.art,
    thumb: publicEvent.thumb ?? info.thumb,
  };
};

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

  const [upgrades, history, accounts, ...libraryItems] = await Promise.all([
    collectUpgrades().catch((e) => {
      logger.warn('Failed to collect upgrades for feed', {
        label: 'Feed',
        errorMessage: e.message,
      });
      return [] as FeedEvent[];
    }),
    plex.plexClient.getWatchHistory(HISTORY_DEPTH),
    plex.plexClient.getServerAccounts().catch(() => new Map<number, string>()),
    ...libraries.map((library) =>
      plex.plexClient
        .getRecentlyAdded(library.id, { addedAt: since }, library.type)
        .catch(() => [])
    ),
  ]);

  const events: FeedEvent[] = [...upgrades];

  for (const item of history) {
    const isEpisode = item.type === 'episode';
    events.push({
      kind: 'watched',
      mediaType: item.type,
      title: isEpisode ? (item.grandparentTitle ?? item.title) : item.title,
      subtitle: isEpisode ? item.title : undefined,
      season: isEpisode ? item.parentIndex : undefined,
      episode: isEpisode ? item.index : undefined,
      user:
        (item.accountID != null ? accounts.get(item.accountID) : undefined) ??
        'Someone',
      at: item.viewedAt * 1000,
      thumb: item.grandparentThumb ?? item.parentThumb ?? item.thumb,
      itemKey: item.ratingKey ?? ratingKeyFromKey(item.key),
      showKey: isEpisode ? ratingKeyFromKey(item.grandparentKey) : undefined,
    });
  }

  for (const item of libraryItems.flat()) {
    const isEpisode = item.type === 'episode';
    events.push({
      kind: 'added',
      mediaType: item.type,
      title: isEpisode ? (item.grandparentTitle ?? item.title) : item.title,
      subtitle: isEpisode ? item.title : undefined,
      season: isEpisode ? item.parentIndex : undefined,
      episode: isEpisode ? item.index : undefined,
      year: item.year,
      at: item.addedAt * 1000,
      thumb: item.grandparentThumb ?? item.parentThumb ?? item.thumb,
      itemKey: item.ratingKey,
      showKey: isEpisode ? item.grandparentRatingKey : undefined,
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
    const page = cachedFeed.slice(offset, offset + limit);

    // Enrich only the requested page; metadata is cached across requests
    const plex = await getAdminPlex();
    const fetcher = (key: string) =>
      plex
        ? plex.plexClient.getMetadata(key)
        : Promise.reject(new Error('plex not configured'));
    const events = await Promise.all(
      page.map((event) => enrichEvent(fetcher, event))
    );

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
