import React from 'react';
import { useOptionalThemeSystem } from '@/contexts/useThemeSystem';
import { useI18n } from '@/lib/i18n';

interface OpenChamberLogoProps {
  className?: string;
  width?: number;
  height?: number;
  isAnimated?: boolean;
}

// The exported component name remains as a compatibility boundary for the
// upstream UI. Its visual identity and accessible name are OpenDeputy.
export const OpenChamberLogo: React.FC<OpenChamberLogoProps> = ({
  className = '',
  width = 70,
  height = 70,
  isAnimated = false,
}) => {
  const { t } = useI18n();
  const themeContext = useOptionalThemeSystem();
  const isDark = themeContext
    ? themeContext.currentTheme.metadata.variant !== 'light'
    : typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const doorway = isDark ? '#ffffff' : '#211f1f';

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={t('openChamberLogo.aria.logo')}
    >
      {isAnimated ? (
        <style>{`@keyframes od-logo-breathe{0%,100%{opacity:.72;transform:scale(.985)}50%{opacity:1;transform:scale(1)}}.od-logo-breathe{animation:od-logo-breathe 1.8s ease-in-out infinite;transform-origin:center}@media (prefers-reduced-motion:reduce){.od-logo-breathe{animation:none}}`}</style>
      ) : null}
      <g className={isAnimated ? 'od-logo-breathe' : undefined}>
        <path d="M214 178H810V610L656 462V326H418V714H530V846H214Z" fill={doorway} />
        <path d="M564 488L820 742H678L564 856Z" fill="#b9b9bf" />
      </g>
    </svg>
  );
};
