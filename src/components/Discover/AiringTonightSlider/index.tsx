import Slider from '@app/components/Slider';
import defineMessages from '@app/utils/defineMessages';
import type { AiringEpisode } from '@server/routes/activity';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Discover.AiringTonightSlider', {
  airingtonight: 'Airing Tonight',
  inplex: 'IN PLEX',
});

const formatAirTime = (airDateUtc?: string) => {
  if (!airDateUtc) {
    return '';
  }
  return new Date(airDateUtc).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
};

const AiringTonightSlider = () => {
  const intl = useIntl();
  const { data, error } = useSWR<{ episodes: AiringEpisode[] }>(
    '/api/v1/airing',
    { refreshInterval: 300000 }
  );

  if ((data && data.episodes.length === 0) || error) {
    return null;
  }

  return (
    <>
      <div className="slider-header">
        <div className="slider-title">
          <span>{intl.formatMessage(messages.airingtonight)}</span>
        </div>
      </div>
      <Slider
        sliderKey="airing-tonight"
        isLoading={!data}
        items={(data?.episodes ?? []).map((episode, index) => (
          <div key={`airing-${index}`} className="flex w-36 flex-col gap-1.5">
            <div className="relative aspect-[2/3] w-36 overflow-hidden rounded-lg border border-gray-700 bg-gray-800">
              {episode.posterUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={episode.posterUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              )}
              <div className="absolute left-1.5 top-1.5 rounded-full bg-gray-900/85 px-2 py-0.5 text-[10px] font-bold tracking-wider text-indigo-400">
                {formatAirTime(episode.airDateUtc)}
              </div>
              {episode.hasFile && (
                <div className="absolute bottom-1.5 left-1.5 rounded-full bg-gray-900/85 px-2 py-0.5 text-[10px] font-bold tracking-wider text-green-400">
                  {intl.formatMessage(messages.inplex)}
                </div>
              )}
            </div>
            <div className="truncate text-sm font-semibold text-gray-100">
              {episode.seriesTitle}
            </div>
            <div className="truncate text-xs text-gray-400">
              {episode.season != null && episode.episode != null
                ? `S${episode.season}E${episode.episode}`
                : ''}
              {episode.episodeTitle ? ` · ${episode.episodeTitle}` : ''}
            </div>
          </div>
        ))}
      />
    </>
  );
};

export default AiringTonightSlider;
