import ButtonWithDropdown from '@app/components/Common/ButtonWithDropdown';

interface PlayButtonProps {
  links: PlayButtonLink[];
}

export interface PlayButtonLink {
  text: string;
  url?: string;
  onClick?: () => void;
  svg: React.ReactNode;
}

const PlayButton = ({ links }: PlayButtonProps) => {
  if (!links || !links.length) {
    return null;
  }

  return (
    <ButtonWithDropdown
      as="a"
      buttonType="ghost"
      text={
        <>
          {links[0].svg}
          <span>{links[0].text}</span>
        </>
      }
      href={links[0].url}
      onClick={links[0].onClick}
      target={links[0].url ? '_blank' : undefined}
    >
      {links.length > 1 &&
        links.slice(1).map((link, i) => {
          return (
            <ButtonWithDropdown.Item
              key={`play-button-dropdown-item-${i}`}
              buttonType="ghost"
              href={link.url}
              onClick={link.onClick}
              target={link.url ? '_blank' : undefined}
            >
              {link.svg}
              <span>{link.text}</span>
            </ButtonWithDropdown.Item>
          );
        })}
    </ButtonWithDropdown>
  );
};

export default PlayButton;
