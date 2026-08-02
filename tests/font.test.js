import { describe, it, expect } from 'vitest';
import { FONT_CHARS, GLYPHS, GLYPH_SIZE, FONT_CHARS_PER_ROW } from '../src/art/font.js';

describe('the arcade font', () => {
  it('has exactly one glyph per character, and no strays', () => {
    expect(Object.keys(GLYPHS).sort()).toEqual([...FONT_CHARS].sort());
  });

  it('has no duplicate characters in its charset', () => {
    expect(new Set([...FONT_CHARS]).size).toBe(FONT_CHARS.length);
  });

  it('authors every glyph on the 8x8 tile the cabinet used', () => {
    for (const [char, rows] of Object.entries(GLYPHS)) {
      expect({ char, rows: rows.length }).toEqual({ char, rows: GLYPH_SIZE });
      for (const row of rows) {
        expect({ char, width: row.length }).toEqual({ char, width: GLYPH_SIZE });
      }
    }
  });

  it('uses only lit and unlit pixels, nothing the renderer would guess at', () => {
    for (const [char, rows] of Object.entries(GLYPHS)) {
      expect({ char, clean: rows.every((row) => /^[#.]+$/.test(row)) }).toEqual({
        char,
        clean: true,
      });
    }
  });

  it('draws something for every printable character and nothing for space', () => {
    for (const char of FONT_CHARS) {
      const lit = GLYPHS[char].join('').split('#').length - 1;
      if (char === ' ') {
        expect(lit).toBe(0);
      } else {
        expect({ char, lit: lit >= 4 }).toEqual({ char, lit: true });
      }
    }
  });

  it('gives every character its own shape', () => {
    const shapes = new Map();
    for (const [char, rows] of Object.entries(GLYPHS)) {
      const shape = rows.join('|');
      expect({ char, clashesWith: shapes.get(shape) ?? null }).toEqual({
        char,
        clashesWith: null,
      });
      shapes.set(shape, char);
    }
  });

  it('lays out in full rows for the sheet the loader builds', () => {
    expect(FONT_CHARS_PER_ROW).toBe(16);
    expect(FONT_CHARS.length).toBeGreaterThan(0);
  });
});
