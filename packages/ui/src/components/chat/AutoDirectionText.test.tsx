import React from 'react';
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { AutoDirectionText } from './AutoDirectionText';

describe('AutoDirectionText', () => {
  const languageSamples: Array<[language: string, text: string]> = [
    ['English', 'Hello world'],
    ['German', 'Guten Tag'],
    ['Persian', '\u0633\u0644\u0627\u0645 \u062F\u0646\u06CC\u0627'],
    ['Arabic', '\u0645\u0631\u062D\u0628\u0627 \u0628\u0627\u0644\u0639\u0627\u0644\u0645'],
    ['Hebrew', '\u05E9\u05DC\u05D5\u05DD \u05E2\u05D5\u05DC\u05DD'],
    ['Japanese', '\u3053\u3093\u306B\u3061\u306F\u4E16\u754C'],
    ['Chinese', '\u4F60\u597D\u4E16\u754C'],
  ];

  for (const [language, text] of languageSamples) {
    test(`delegates ${language} text direction to the browser Unicode algorithm`, () => {
      const markup = renderToStaticMarkup(<AutoDirectionText>{text}</AutoDirectionText>);

      expect(markup).toContain('dir="auto"');
      expect(markup).toContain('class="text-start"');
      expect(markup).toContain('unicode-bidi:plaintext');
    });
  }

  test('keeps caller classes and styles while preserving automatic direction', () => {
    const markup = renderToStaticMarkup(
      <AutoDirectionText className="message" style={{ color: 'red' }}>
        Mixed language text
      </AutoDirectionText>,
    );

    expect(markup).toContain('class="text-start message"');
    expect(markup).toContain('unicode-bidi:plaintext');
    expect(markup).toContain('color:red');
  });
});
