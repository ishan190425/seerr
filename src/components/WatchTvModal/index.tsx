import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import WatchPlayer from '@app/components/WatchPlayer';
import { CheckCircleIcon, PlayIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const PROXY_BASE = '/api/v1/watch/plex';

interface Episode {
  ratingKey: string;
  title: string;
  index: number;
  parentIndex: number;
  duration?: number;
  viewCount?: number;
  viewOffset?: number;
}

interface WatchTvModalProps {
  ratingKey: string;
  title: string;
  onClose: () => void;
}

// The next episode to watch: first one with saved progress, otherwise the
// first unwatched episode after the last watched one
const findNextUp = (episodes: Episode[]): Episode | null => {
  const inProgress = episodes.find((e) => (e.viewOffset ?? 0) > 0);
  if (inProgress) {
    return inProgress;
  }
  const lastWatched = episodes.reduce(
    (last, e, i) => ((e.viewCount ?? 0) > 0 ? i : last),
    -1
  );
  if (lastWatched === -1) {
    return null;
  }
  return episodes.slice(lastWatched + 1).find((e) => !(e.viewCount ?? 0)) ?? null;
};

const WatchTvModal = ({ ratingKey, title, onClose }: WatchTvModalProps) => {
  const [episodes, setEpisodes] = useState<Episode[] | null>(null);
  const [error, setError] = useState(false);
  const [playing, setPlaying] = useState<Episode | null>(null);

  useEffect(() => {
    // Reload watch state when returning from the player too
    if (playing) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${PROXY_BASE}/library/metadata/${ratingKey}/allLeaves`,
          { headers: { accept: 'application/json' } }
        );
        const metadata: Episode[] =
          (await res.json())?.MediaContainer?.Metadata ?? [];
        metadata.sort(
          (a, b) => a.parentIndex - b.parentIndex || a.index - b.index
        );
        if (!cancelled) {
          setEpisodes(metadata);
        }
      } catch {
        if (!cancelled) {
          setError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ratingKey, playing]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (playing) {
    return (
      <WatchPlayer
        ratingKey={playing.ratingKey}
        title={`${title} · S${playing.parentIndex}E${playing.index} — ${playing.title}`}
        onClose={() => setPlaying(null)}
      />
    );
  }

  const seasons = [...new Set((episodes ?? []).map((e) => e.parentIndex))].sort(
    (a, b) => a - b
  );
  const nextUp = episodes ? findNextUp(episodes) : null;

  const progressPercent = (e: Episode) =>
    e.duration && e.viewOffset
      ? Math.min(100, Math.round((e.viewOffset / e.duration) * 100))
      : 0;

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-gray-700 bg-gray-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
          <span className="truncate text-lg font-semibold text-white">
            {title}
          </span>
          <button
            type="button"
            aria-label="Close"
            className="ml-4 rounded-full p-2 text-gray-300 transition hover:bg-gray-800 hover:text-white"
            onClick={onClose}
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <p className="text-sm text-gray-400">
              Could not load episodes from Plex.
            </p>
          )}
          {!error && !episodes && <LoadingSpinner />}
          {!error && episodes && episodes.length === 0 && (
            <p className="text-sm text-gray-400">
              No episodes available in Plex yet.
            </p>
          )}
          {nextUp && (
            <button
              type="button"
              className="mb-5 w-full rounded-lg border border-indigo-500 bg-indigo-600/20 px-4 py-3 text-left transition hover:bg-indigo-600/40"
              onClick={() => setPlaying(nextUp)}
            >
              <div className="flex items-center gap-3">
                <PlayIcon className="h-5 w-5 shrink-0 text-indigo-400" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-indigo-400">
                    {(nextUp.viewOffset ?? 0) > 0 ? 'Continue Watching' : 'Next Up'}
                  </div>
                  <div className="truncate text-sm font-medium text-white">
                    S{nextUp.parentIndex}E{nextUp.index} — {nextUp.title}
                  </div>
                </div>
                {progressPercent(nextUp) > 0 && (
                  <span className="shrink-0 text-xs text-gray-400">
                    {progressPercent(nextUp)}%
                  </span>
                )}
              </div>
              {progressPercent(nextUp) > 0 && (
                <div className="mt-2 h-1 w-full overflow-hidden rounded bg-gray-800">
                  <div
                    className="h-full bg-indigo-500"
                    style={{ width: `${progressPercent(nextUp)}%` }}
                  />
                </div>
              )}
            </button>
          )}
          {seasons.map((season) => (
            <div key={season} className="mb-4">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">
                Season {season}
              </h3>
              <ul className="space-y-1">
                {(episodes ?? [])
                  .filter((e) => e.parentIndex === season)
                  .map((episode) => {
                    const watched = (episode.viewCount ?? 0) > 0;
                    const percent = progressPercent(episode);
                    return (
                      <li key={episode.ratingKey}>
                        <button
                          type="button"
                          className="w-full rounded px-3 py-2 text-left text-sm transition hover:bg-gray-800"
                          onClick={() => setPlaying(episode)}
                        >
                          <div className="flex items-center gap-3">
                            {watched ? (
                              <CheckCircleIcon className="h-4 w-4 shrink-0 text-indigo-500" />
                            ) : (
                              <PlayIcon className="h-4 w-4 shrink-0 text-gray-400" />
                            )}
                            <span
                              className={`w-10 shrink-0 ${
                                watched ? 'text-gray-600' : 'text-gray-400'
                              }`}
                            >
                              E{episode.index}
                            </span>
                            <span
                              className={`min-w-0 flex-1 truncate ${
                                watched ? 'text-gray-500' : 'text-gray-200'
                              }`}
                            >
                              {episode.title}
                            </span>
                            {percent > 0 && (
                              <span className="shrink-0 text-xs text-gray-500">
                                {percent}%
                              </span>
                            )}
                            {episode.duration ? (
                              <span className="shrink-0 text-xs text-gray-500">
                                {Math.round(episode.duration / 60000)} min
                              </span>
                            ) : null}
                          </div>
                          {percent > 0 && (
                            <div className="ml-7 mt-1.5 h-0.5 overflow-hidden rounded bg-gray-800">
                              <div
                                className="h-full bg-indigo-500"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          )}
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return null;
  }
  return createPortal(modal, document.body);
};

export default WatchTvModal;
