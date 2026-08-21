type ProfileIcon = (props: { size: number }) => React.JSX.Element;

function GithubMark({ size }: { size: number }): React.JSX.Element {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.76-.24.76-.54v-2.1c-3.1.67-3.76-1.32-3.76-1.32-.5-1.28-1.23-1.62-1.23-1.62-1.01-.69.08-.68.08-.68 1.12.08 1.71 1.15 1.71 1.15.99 1.7 2.6 1.2 3.23.92.1-.72.39-1.2.7-1.48-2.48-.28-5.09-1.24-5.09-5.52 0-1.22.44-2.22 1.15-3-.12-.28-.5-1.42.11-2.96 0 0 .94-.3 3.08 1.15a10.7 10.7 0 0 1 5.6 0c2.14-1.45 3.08-1.15 3.08-1.15.61 1.54.23 2.68.11 2.96.71.78 1.15 1.78 1.15 3 0 4.29-2.62 5.24-5.11 5.52.4.35.75 1.04.75 2.1v3.11c0 .3.2.65.77.54A11.2 11.2 0 0 0 12 .8Z" />
    </svg>
  );
}

function LinkedinMark({ size }: { size: number }): React.JSX.Element {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M5.1 3.7a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2ZM3.3 9.5h3.6v11.2H3.3V9.5Zm5.8 0h3.5V11c.5-.9 1.6-1.8 3.5-1.8 3.7 0 4.3 2.4 4.3 5.5v6h-3.6v-5.3c0-1.3 0-3-1.9-3s-2.2 1.4-2.2 2.9v5.4H9.1V9.5Z" />
    </svg>
  );
}

const profiles: { href: string; icon: ProfileIcon; label: string }[] = [
  {
    href: 'https://github.com/ewgenij87snwork',
    icon: GithubMark,
    label: 'GitHub',
  },
  {
    href: 'https://www.linkedin.com/in/yevgeniy-sorokin-829b7b18a/',
    icon: LinkedinMark,
    label: 'LinkedIn',
  },
];

export function CreatorSignature({ className = '' }: { className?: string }): React.JSX.Element {
  return (
    <address
      aria-label="Yevgeniy Sorokin profiles"
      className={`creator-signature ${className}`.trim()}
    >
      <p className="creator-signature__name">Yevgeniy Sorokin</p>
      <div className="creator-signature__links">
        {profiles.map(({ href, icon: Icon, label }) => (
          <a
            aria-label={`${label} profile for Yevgeniy Sorokin (opens in a new tab)`}
            className="creator-signature__link"
            href={href}
            key={label}
            rel="author noopener noreferrer"
            target="_blank"
            title={label}
          >
            <Icon size={17} />
          </a>
        ))}
      </div>
    </address>
  );
}
