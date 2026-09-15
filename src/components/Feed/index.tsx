import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import { EyeIcon, FolderPlusIcon } from '@heroicons/react/24/solid';
import { useCallback, useEffect, useRef, useState } from 'react';
import defineMessages from '@app/utils/defineMessages';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Feed', {
  feed: 'Feed',
  watched: 'Watched',
  added: 'Added',
  caughtup: "You're all caught up",
});

interface FeedEvent {
  kind: 'watched' | 'added';
  mediaType: string;
  title: string;
  subtitle?: string;
  user?: string;
  at: number;
  thumb?: string;
}

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
        {events.map((event, index) => (
          <div
            key={`${event.kind}-${event.at}-${index}`}
            className="flex gap-4 rounded-xl border border-gray-700 bg-gray-800/60 p-3"
          >
            <div className="h-24 w-16 flex-shrink-0 overflow-hidden rounded-md bg-gray-700">
              {event.thumb && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/v1/feed/image?path=${encodeURIComponent(
                    event.thumb
                  )}`}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
              <div className="flex items-center gap-2">
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
              <div className="truncate text-base font-bold text-gray-100">
                {event.title}
              </div>
              {event.subtitle && (
                <div className="truncate text-sm text-gray-400">
                  {event.subtitle}
                </div>
              )}
              {event.kind === 'watched' && event.user && (
                <div className="text-xs text-gray-500">{event.user}</div>
              )}
            </div>
          </div>
        ))}
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
