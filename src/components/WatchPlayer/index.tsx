import { XMarkIcon } from '@heroicons/react/24/solid';
import type Hls from 'hls.js';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const PROXY_BASE = '/api/v1/watch/plex';

interface PlexStream {
  id: number;
  streamType: number;
  displayTitle?: string;
  extendedDisplayTitle?: string;
  selected?: boolean;
}

interface StreamInfo {
  token: string | null;
  connections: { uri: string; local: boolean }[];
}

interface WatchPlayerProps {
  ratingKey: string;
  title: string;
  onClose: () => void;
}

const WatchPlayer = ({ ratingKey, title, onClose }: WatchPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Direct connection to Plex (plex.direct) when reachable; proxy otherwise
  const [resolved, setResolved] = useState(false);
  const [directBase, setDirectBase] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [partId, setPartId] = useState<number | null>(null);
  const [audioStreams, setAudioStreams] = useState<PlexStream[]>([]);
  const [subStreams, setSubStreams] = useState<PlexStream[]>([]);
  const [audioId, setAudioId] = useState<number | null>(null);
  const [subId, setSubId] = useState<number>(0);
  const [generation, setGeneration] = useState(0);

  const mediaUrl = (path: string, params?: URLSearchParams) => {
    const qs = params ? `?${params.toString()}` : '';
    if (directBase && token) {
      const sep = params ? '&' : '?';
      return `${directBase}${path}${qs}${sep}X-Plex-Token=${token}`;
    }
    return `${PROXY_BASE}${path}${qs}`;
  };

  // Resolve the best route to Plex: try direct plex.direct connections
  // (LAN first), fall back to the server-side proxy through the tunnel
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/watch/streaminfo');
        const info: StreamInfo = await res.json();
        if (info.token && info.connections?.length) {
          const probeAll = (uris: string[]) =>
            new Promise<string | null>((resolve) => {
              let pending = uris.length;
              let done = false;
              if (!pending) {
                resolve(null);
                return;
              }
              uris.forEach(async (uri) => {
                try {
                  const controller = new AbortController();
                  const timer = setTimeout(() => controller.abort(), 4000);
                  const ping = await fetch(
                    `${uri}/identity?X-Plex-Token=${info.token}`,
                    { signal: controller.signal }
                  );
                  clearTimeout(timer);
                  if (ping.ok && !done) {
                    done = true;
                    resolve(uri);
                  }
                } catch {
                  // unreachable from this network
                }
                if (--pending === 0 && !done) {
                  resolve(null);
                }
              });
            });
          // Prefer LAN connections, fall back to the public address
          const locals = info.connections.filter((c) => c.local);
          const publics = info.connections.filter((c) => !c.local);
          const base =
            (await probeAll(locals.map((c) => c.uri))) ??
            (await probeAll(publics.map((c) => c.uri)));
          if (base && !cancelled) {
            setDirectBase(base);
            setToken(info.token);
            setResolved(true);
            return;
          }
        }
      } catch {
        // fall through to proxy mode
      }
      if (!cancelled) {
        setResolved(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the media's audio/subtitle streams
  useEffect(() => {
    if (!resolved) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(mediaUrl(`/library/metadata/${ratingKey}`), {
          headers: { accept: 'application/json' },
        });
        const part = (await res.json())?.MediaContainer?.Metadata?.[0]
          ?.Media?.[0]?.Part?.[0];
        if (!part || cancelled) {
          return;
        }
        const streams: PlexStream[] = part.Stream ?? [];
        setPartId(part.id);
        setAudioStreams(streams.filter((s) => s.streamType === 2));
        setSubStreams(streams.filter((s) => s.streamType === 3));
        setAudioId(
          streams.find((s) => s.streamType === 2 && s.selected)?.id ?? null
        );
        setSubId(
          streams.find((s) => s.streamType === 3 && s.selected)?.id ?? 0
        );
      } catch {
        // selectors just stay hidden
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, directBase, token, ratingKey]);

  // Playback — restarted whenever the stream selection generation changes
  useEffect(() => {
    if (!resolved) {
      return;
    }
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const session = `rathi-web-${Math.random().toString(36).slice(2, 10)}`;
    const params = new URLSearchParams({
      path: `/library/metadata/${ratingKey}`,
      mediaIndex: '0',
      partIndex: '0',
      protocol: 'hls',
      fastSeek: '1',
      directPlay: '0',
      directStream: '1',
      subtitles: 'burn',
      audioBoost: '100',
      hasMDE: '1',
      session,
      'X-Plex-Client-Identifier': 'rathi-studios-web',
      'X-Plex-Product': 'Rathi Studios',
      'X-Plex-Platform': 'Chrome',
      'X-Plex-Device': 'Browser',
    });
    const src = mediaUrl('/video/:/transcode/universal/start.m3u8', params);

    let hls: Hls | undefined;
    let cancelled = false;

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari plays HLS natively
      video.src = src;
      video.play().catch(() => undefined);
    } else {
      import('hls.js').then(({ default: HlsClass }) => {
        if (cancelled || !HlsClass.isSupported()) {
          return;
        }
        hls = new HlsClass();
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(HlsClass.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => undefined);
        });
      });
    }

    return () => {
      cancelled = true;
      hls?.destroy();
      video.removeAttribute('src');
      // Tell Plex to tear down this transcode session
      const stopParams = new URLSearchParams({ session });
      fetch(mediaUrl('/video/:/transcode/universal/stop', stopParams), {
        keepalive: true,
      }).catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, directBase, token, ratingKey, generation]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const changeStream = async (kind: 'audio' | 'subtitle', id: number) => {
    if (!partId) {
      return;
    }
    const params = new URLSearchParams({ allParts: '1' });
    params.set(kind === 'audio' ? 'audioStreamID' : 'subtitleStreamID', `${id}`);
    try {
      await fetch(mediaUrl(`/library/parts/${partId}`, params), {
        method: 'PUT',
      });
      if (kind === 'audio') {
        setAudioId(id);
      } else {
        setSubId(id);
      }
      setGeneration((g) => g + 1);
    } catch {
      // keep playing with the previous selection
    }
  };

  const selectClasses =
    'rounded border border-gray-700 bg-gray-900 px-2 py-1 text-sm text-gray-200 focus:border-gray-400 focus:outline-none';

  const overlay = (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <span className="min-w-0 flex-1 truncate text-lg font-semibold text-white">
          {title}
        </span>
        {audioStreams.length > 1 && (
          <label className="flex items-center gap-2 text-sm text-gray-400">
            Audio
            <select
              className={selectClasses}
              value={audioId ?? ''}
              onChange={(e) => changeStream('audio', Number(e.target.value))}
            >
              {audioStreams.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.extendedDisplayTitle ?? s.displayTitle ?? `Track ${s.id}`}
                </option>
              ))}
            </select>
          </label>
        )}
        {subStreams.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-gray-400">
            Subtitles
            <select
              className={selectClasses}
              value={subId}
              onChange={(e) => changeStream('subtitle', Number(e.target.value))}
            >
              <option value={0}>None</option>
              {subStreams.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.extendedDisplayTitle ?? s.displayTitle ?? `Track ${s.id}`}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          aria-label="Close player"
          className="rounded-full p-2 text-gray-300 transition hover:bg-gray-800 hover:text-white"
          onClick={onClose}
        >
          <XMarkIcon className="h-6 w-6" />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          controls
          autoPlay
          playsInline
          className="h-full w-full"
        />
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return null;
  }
  return createPortal(overlay, document.body);
};

export default WatchPlayer;
