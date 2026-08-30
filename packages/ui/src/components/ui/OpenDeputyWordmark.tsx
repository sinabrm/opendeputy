import React from 'react';

const WORDMARK_SRC = '/opendeputy-wordmark-ornate-dark-with-logo.svg';
const WORDMARK_ASPECT_RATIO = 42 / 348;

export interface OpenDeputyWordmarkProps {
  className?: string;
  width?: number;
  alt?: string;
}

/** The full OpenDeputy mark used on startup/auth surfaces. */
export const OpenDeputyWordmark: React.FC<OpenDeputyWordmarkProps> = ({
  className = '',
  width = 348,
  alt = 'OpenDeputy',
}) => (
  <img
    src={WORDMARK_SRC}
    width={width}
    height={Math.round(width * WORDMARK_ASPECT_RATIO)}
    alt={alt}
    className={`block max-w-full ${className}`.trim()}
    style={{ height: 'auto' }}
  />
);
