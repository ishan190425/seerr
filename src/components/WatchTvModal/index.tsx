import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import WatchPlayer from '@app/components/WatchPlayer';
import { PlayIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const PROXY_BASE = '/api/v1/watch/plex';

interface Episode {
  ratingKey: string;
  title: string;
  index: number;
  parentIndex: number;
  duration?: number;
}

interface WatchTvModalProps {
  ratingKey: string;
  title: string;
  onClose: () => void;
}

const WatchTvModal = ({ ratingKey, title, onClose }: WatchTvModalProps) => {
  const [episodes, setEpisodes] = useState<Episode[] | null>(null);
  const [error, setError] = useState(false);
  const [playing, setPlaying] = useState<Episode | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${PROXY_BASE}/library/metadata/${ratingKey}/allLeaves`,
          { headers: { accept: 'application/json' } }
        );
        const metadata = (await res.json())?.MediaContainer?.Metadata ?? [];
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
  }, [ratingKey]);

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
          {seasons.map((season) => (
            <div key={season} className="mb-4">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">
                Season {season}
              </h3>
              <ul className="space-y-1">
                {(episodes ?? [])
                  .filter((e) => e.parentIndex === season)
                  .sort((a, b) => a.index - b.index)
                  .map((episode) => (
                    <li key={episode.ratingKey}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm text-gray-200 transition hover:bg-gray-800"
                        onClick={() => setPlaying(episode)}
                      >
                        <PlayIcon className="h-4 w-4 shrink-0 text-gray-400" />
                        <span className="w-10 shrink-0 text-gray-400">
                          E{episode.index}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {episode.title}
                        </span>
                        {episode.duration ? (
                          <span className="shrink-0 text-xs text-gray-500">
                            {Math.round(episode.duration / 60000)} min
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
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
