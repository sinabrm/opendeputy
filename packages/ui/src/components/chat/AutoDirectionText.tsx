import React from 'react';
import { cn } from '@/lib/utils';

type AutoDirectionTextProps = Omit<React.ComponentPropsWithoutRef<'div'>, 'dir'>;

/**
 * Lets the browser choose the correct base direction from the first strong
 * Unicode character. `plaintext` also resets bidi handling for each paragraph
 * instead of forcing an entire multilingual message into one direction.
 */
export const AutoDirectionText = React.forwardRef<HTMLDivElement, AutoDirectionTextProps>(({
  className,
  style,
  ...props
}, ref) => (
  <div
    {...props}
    ref={ref}
    dir="auto"
    className={cn('text-start', className)}
    style={{ unicodeBidi: 'plaintext', ...style }}
  />
));

AutoDirectionText.displayName = 'AutoDirectionText';
