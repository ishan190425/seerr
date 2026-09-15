import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import defineMessages from '@app/utils/defineMessages';
import { EyeIcon, FolderPlusIcon } from '@heroicons/react/24/solid';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Feed', {
  feed: 'Feed',
  watched: 'Watched',
  added: 'Added',
  caughtup: "You're all caught up",
  episodeDownloaded: 'Episode Downloaded',
  movieDownloaded: 'Movie Downloaded',
  episodeWatched: 'Episode Watched',
  movieWatched: 'Movie Watched',
  itemDownloaded: 'Downloaded',
  itemWatched: 'Watched',
  tvseries: 'TV Series',
  movie: 'Movie',
  watchedby: 'Watched by {user}',
});

interface FeedEvent {
  kind: 'watched' | 'added';
  mediaType: string;
  title: string;
  subtitle?: string;
  user?: string;
  at: number;
  thumb?: string;
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

const plexImage = (path: string): string =>
  `/api/v1/feed/image?path=${encodeURIComponent(path)}`;

const pad2 = (n: number): string => String(n).padStart(2, '0');

const formatRuntime = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) {
    return `${h}h ${m}m`;
  }
  return h ? `${h}h` : `${m}m`;
};

const headlineFor = (event: FeedEvent) => {
  const isEpisode = event.mediaType === 'episode';
  const isMovie = event.mediaType === 'movie';
  if (event.kind === 'added') {
    return isEpisode
      ? messages.episodeDownloaded
      : isMovie
        ? messages.movieDownloaded
        : messages.itemDownloaded;
  }
  return isEpisode
    ? messages.episodeWatched
    : isMovie
      ? messages.movieWatched
      : messages.itemWatched;
};

// "Show - 10x04 - Episode title [WEBDL-1080p]" / "Movie (2024) [Bluray-2160p]"
const detailLine = (event: FeedEvent): string => {
  const parts: string[] = [event.title];
  if (event.mediaType === 'episode') {
    if (event.season != null && event.episode != null) {
      parts.push(`${event.season}x${pad2(event.episode)}`);
    }
    if (event.subtitle) {
      parts.push(event.subtitle);
    }
  } else if (event.year) {
    parts[0] = `${event.title} (${event.year})`;
  }
  const line = parts.join(' - ');
  return event.quality ? `${line} [${event.quality}]` : line;
};

const PAGE_SIZE = 20;

const relativeTime = (at: number): string => {
  const diff = Date.now() - at;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }
  return new Date(at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
};

const Feed = () => {
  const intl = useIntl();
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const loadingRef = useRef(false);
  const offsetRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loadingRef.current) {
      return;
    }
    loadingRef.current = true;
    try {
      const res = await fetch(
        `/api/v1/feed?offset=${offsetRef.current}&limit=${PAGE_SIZE}`
      );
      const data = await res.json();
      const newEvents: FeedEvent[] = data.events ?? [];
      offsetRef.current += newEvents.length;
      setEvents((prev) => [...prev, ...newEvents]);
      setHasMore(Boolean(data.hasMore) && newEvents.length > 0);
    } catch {
      setHasMore(false);
    } finally {
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    loadMore();
  }, [loadMore]);

  // Endless scroll: load the next page when the sentinel nears the viewport
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: '600px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore, events.length]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title={intl.formatMessage(messages.feed)} />
      <div className="mb-5 mt-2">
        <h1 className="text-2xl font-extrabold text-gray-100">
          {intl.formatMessage(messages.feed)}
        </h1>
      </div>
      <div className="flex flex-col gap-3 pb-8">
        {events.map((event, index) => {
          const isEpisode = event.mediaType === 'episode';
          const imdbUrl = event.imdbId
            ? `https://www.imdb.com/title/${event.imdbId}/`
            : undefined;
          const image = event.art ?? event.thumb;
          const meta = [
            event.rating != null ? `\u2b50 ${event.rating.toFixed(1)}` : null,
            event.genres?.length ? event.genres.join(', ') : null,
          ]
            .filter(Boolean)
            .join(' | ');
          return (
            <div
              key={`${event.kind}-${event.at}-${index}`}
              className="rounded-2xl border border-gray-700 bg-gray-800/70 p-4 shadow-lg"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-lg font-extrabold leading-tight text-gray-100">
                  {intl.formatMessage(headlineFor(event))}
                </div>
                <div className="flex flex-shrink-0 items-center gap-2 pt-0.5">
                  {event.kind === 'watched' ? (
                    <span className="flex items-center gap-1 rounded-full bg-indigo-600/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                      <EyeIcon className="h-3 w-3" />
                      {intl.formatMessage(messages.watched)}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-600/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                      <FolderPlusIcon className="h-3 w-3" />
                      {intl.formatMessage(messages.added)}
                    </span>
                  )}
                  <span className="text-xs text-gray-500">
                    {relativeTime(event.at)}
                  </span>
                </div>
              </div>
              <div className="mt-1 text-base leading-snug text-gray-200">
                {detailLine(event)}
              </div>
              {event.kind === 'watched' && event.user && (
                <div className="mt-0.5 text-sm text-gray-400">
                  {intl.formatMessage(messages.watchedby, {
                    user: event.user,
                  })}
                </div>
              )}
              {imdbUrl && (
                <a
                  href={imdbUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-base font-medium text-indigo-400 hover:text-indigo-300 hover:underline"
                >
                  IMDb
                </a>
              )}
              <div className="mt-3 overflow-hidden rounded-r-xl border-l-4 border-indigo-500 bg-indigo-500/10">
                <div className="px-3 pt-2">
                  <div className="text-sm font-bold text-indigo-400">IMDb</div>
                  <div className="text-base font-semibold text-gray-100">
                    {event.title}{' '}
                    <span className="font-normal text-gray-300">
                      (
                      {intl.formatMessage(
                        isEpisode ? messages.tvseries : messages.movie
                      )}
                      {event.year ? ` ${event.year}` : ''}
                      {isEpisode ? '\u2013 ' : ''})
                    </span>
                    {meta && (
                      <span className="font-normal text-gray-200"> {meta}</span>
                    )}
                  </div>
                  {event.runtime ? (
                    <div className="pb-2 text-sm text-gray-300">
                      {formatRuntime(event.runtime)}
                    </div>
                  ) : (
                    <div className="pb-2" />
                  )}
                </div>
                {image && (
                  <a
                    href={imdbUrl}
                    target={imdbUrl ? '_blank' : undefined}
                    rel="noreferrer"
                    className="block bg-gray-900"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={plexImage(image)}
                      alt=""
                      loading="lazy"
                      className={`w-full ${
                        event.art
                          ? 'aspect-video object-cover'
                          : 'max-h-96 object-contain'
                      }`}
                    />
                  </a>
                )}
              </div>
            </div>
          );
        })}
        {hasMore && (
          <div ref={sentinelRef} className="py-4">
            <LoadingSpinner />
          </div>
        )}
        {!hasMore && events.length > 0 && (
          <div className="py-6 text-center text-sm text-gray-500">
            {intl.formatMessage(messages.caughtup)}
          </div>
        )}
      </div>
    </div>
  );
};

export default Feed;
