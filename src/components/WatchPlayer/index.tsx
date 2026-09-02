import { XMarkIcon } from '@heroicons/react/24/solid';
import type Hls from 'hls.js';
import { useEffect, useRef } from 'react';

interface WatchPlayerProps {
  ratingKey: string;
  title: string;
  onClose: () => void;
}

const WatchPlayer = ({ ratingKey, title, onClose }: WatchPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
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
      location: 'lan',
      hasMDE: '1',
      session,
      'X-Plex-Client-Identifier': 'rathi-studios-web',
      'X-Plex-Product': 'Rathi Studios',
      'X-Plex-Platform': 'Chrome',
      'X-Plex-Device': 'Browser',
    });
    const src = `/api/v1/watch/plex/video/:/transcode/universal/start.m3u8?${params.toString()}`;

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

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      cancelled = true;
      hls?.destroy();
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [ratingKey, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="truncate text-lg font-semibold text-white">
          {title}
        </span>
        <button
          type="button"
          aria-label="Close player"
          className="ml-4 rounded-full p-2 text-gray-300 transition hover:bg-gray-800 hover:text-white"
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
};

export default WatchPlayer;
