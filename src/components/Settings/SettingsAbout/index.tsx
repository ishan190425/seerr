import List from '@app/components/Common/List';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type { SettingsAboutResponse } from '@server/interfaces/api/settingsInterfaces';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Settings.SettingsAbout', {
  about: 'About',
  aboutseerr: 'About Rathi Studios',
  version: 'Version',
  totalmedia: 'Total Media',
  totalrequests: 'Total Requests',
  gettingsupport: 'Getting Support',
  githubdiscussions: 'GitHub Discussions',
  timezone: 'Time Zone',
  appDataPath: 'Data Directory',
  supportseerr: 'Support Rathi Studios',
  contribute: 'Make a Contribution',
  documentation: 'Documentation',
  outofdate: 'Out of Date',
  uptodate: 'Up to Date',
  versionCheckDisabled: 'Version Check Disabled',
  runningDevelop:
    'You are running the <code>develop</code> branch of Rathi Studios, which is only recommended for those contributing to development or assisting with bleeding-edge testing.',
});

const SettingsAbout = () => {
  const intl = useIntl();
  const { data, error } = useSWR<SettingsAboutResponse>(
    '/api/v1/settings/about'
  );

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <ErrorPage statusCode={500} />;
  }

  return (
    <>
      <PageTitle
        title={[
          intl.formatMessage(messages.about),
          intl.formatMessage(globalMessages.settings),
        ]}
      />
      <div className="section">
        <List title={intl.formatMessage(messages.aboutseerr)}>
          <List.Item
            title={intl.formatMessage(messages.version)}
            className="flex flex-row items-center truncate"
          >
            <code className="truncate">
              {data.version.replace('develop-', '')}
            </code>
          </List.Item>
          <List.Item title={intl.formatMessage(messages.totalmedia)}>
            {intl.formatNumber(data.totalMediaItems)}
          </List.Item>
          <List.Item title={intl.formatMessage(messages.totalrequests)}>
            {intl.formatNumber(data.totalRequests)}
          </List.Item>
          <List.Item title={intl.formatMessage(messages.appDataPath)}>
            <code>{data.appDataPath}</code>
          </List.Item>
          {data.tz && (
            <List.Item title={intl.formatMessage(messages.timezone)}>
              <code>{data.tz}</code>
            </List.Item>
          )}
        </List>
      </div>
      <div className="section">
        <List title={intl.formatMessage(messages.gettingsupport)}>
          <List.Item title={intl.formatMessage(messages.documentation)}>
            <a
              href="https://docs.seerr.dev"
              target="_blank"
              rel="noreferrer"
              className="text-indigo-500 transition duration-300 hover:underline"
            >
              https://docs.seerr.dev
            </a>
          </List.Item>
          <List.Item title={intl.formatMessage(messages.githubdiscussions)}>
            <a
              href="https://github.com/seerr-team/seerr/discussions"
              target="_blank"
              rel="noreferrer"
              className="text-indigo-500 transition duration-300 hover:underline"
            >
              https://github.com/seerr-team/seerr/discussions
            </a>
          </List.Item>
          <List.Item title="Discord">
            <a
              href="https://discord.gg/seerr"
              target="_blank"
              rel="noreferrer"
              className="text-indigo-500 transition duration-300 hover:underline"
            >
              https://discord.gg/seerr
            </a>
          </List.Item>
        </List>
      </div>
    </>
  );
};

export default SettingsAbout;
