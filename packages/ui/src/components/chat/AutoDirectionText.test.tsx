import React from 'react';
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { AutoDirectionText } from './AutoDirectionText';

describe('AutoDirectionText', () => {
  const languageSamples: Array<[language: string, text: string]> = [
    ['English', 'Hello world'],
    ['German', 'Guten Tag'],
    ['Persian', 'سلام دنیا'],
    ['Arabic', 'مرحبا بالعالم'],
    ['Hebrew', 'שלום עולם'],
    ['Japanese', 'こんにちは世界'],
    ['Chinese', '你好世界'],
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
