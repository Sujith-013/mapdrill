import { describe, expect, it } from 'vitest';
import { buildAliasIndex, match, normalise } from '../src/engine/matcher';
import type { Target } from '../src/engine/types';

function target(id: string, name: string, aliases: string[] = []): Target {
  return {
    id,
    name,
    aliases,
    groupId: 'group-a',
    pathId: id,
    labelPoint: { x: 0, y: 0 },
    labelAnchor: 'n',
    tier: 1,
  };
}

const unsolved = (...ids: string[]) => new Set(ids);

describe('normalise', () => {
  it('strips diacritics', () => {
    expect(normalise('São Paulo')).toBe('saopaulo');
  });

  it('lowercases', () => {
    expect(normalise('KERALA')).toBe('kerala');
  });

  it('strips internal spaces', () => {
    expect(normalise('Tamil Nadu')).toBe('tamilnadu');
  });

  it('strips hyphens and en dashes', () => {
    expect(normalise('Pondicherry-Puducherry')).toBe('pondicherrypuducherry');
    expect(normalise('Pondicherry–Puducherry')).toBe('pondicherrypuducherry');
  });

  it('strips apostrophes', () => {
    expect(normalise("O'Brien")).toBe('obrien');
  });

  it('is idempotent', () => {
    const inputs = ['São Paulo', '  KERALA ', "O'Brien-Smith", 'tamil   nadu'];
    for (const input of inputs) {
      const once = normalise(input);
      expect(normalise(once)).toBe(once);
    }
  });
});

describe('buildAliasIndex + match', () => {
  it('resolves alias hits to the canonical target', () => {
    const targets = [target('kozhikode', 'Kozhikode', ['Calicut'])];
    const index = buildAliasIndex(targets);
    const result = match('Calicut', index, unsolved('kozhikode'));
    expect(result.ids).toEqual(['kozhikode']);
  });

  it('returns every unsolved id for duplicate names (solve-all)', () => {
    const targets = [target('a1', 'Alappuzha'), target('a2', 'Alappuzha')];
    const index = buildAliasIndex(targets);
    const result = match('alappuzha', index, unsolved('a1', 'a2'));
    expect(result.ids.sort()).toEqual(['a1', 'a2']);
  });

  it('never returns already-solved ids', () => {
    const targets = [target('a1', 'Alappuzha'), target('a2', 'Alappuzha')];
    const index = buildAliasIndex(targets);
    // a1 already solved, so not in unsolvedIds
    const result = match('alappuzha', index, unsolved('a2'));
    expect(result.ids).toEqual(['a2']);
  });

  it('returns empty array on no match', () => {
    const targets = [target('a1', 'Alappuzha')];
    const index = buildAliasIndex(targets);
    expect(match('nonexistent', index, unsolved('a1')).ids).toEqual([]);
  });

  it('accepts a 1-char typo at 6+ normalised chars', () => {
    const targets = [target('coimbatore', 'Coimbatore')];
    const index = buildAliasIndex(targets);
    // substitution
    expect(match('coimbatort', index, unsolved('coimbatore')).ids).toEqual(['coimbatore']);
    // insertion
    expect(match('coimbatoree', index, unsolved('coimbatore')).ids).toEqual(['coimbatore']);
    // deletion
    expect(match('coimbator', index, unsolved('coimbatore')).ids).toEqual(['coimbatore']);
  });

  it('does not apply fuzzy matching below 6 chars', () => {
    // "Erode" (5 chars) vs one-off typo "Erod" should not match.
    const targets = [target('erode', 'Erode')];
    const index = buildAliasIndex(targets);
    expect(match('erod', index, unsolved('erode')).ids).toEqual([]);
  });

  it('fuzzy can be disabled via options', () => {
    const targets = [target('coimbatore', 'Coimbatore')];
    const index = buildAliasIndex(targets);
    expect(match('coimbatort', index, unsolved('coimbatore'), { fuzzy: false }).ids).toEqual([]);
  });

  it('returns no match when fuzzy hits span distinct, non-duplicate targets', () => {
    // Two distinct 7-char names, each one substitution away from "aaaaaad" —
    // genuinely ambiguous, not a duplicate-name group.
    const a = target('a1', 'aaaaaab');
    const b = target('a2', 'aaaaaac');
    const index = buildAliasIndex([a, b]);
    const result = match('aaaaaad', index, unsolved('a1', 'a2'));
    expect(result.ids).toEqual([]);
  });

  it('exact match takes priority over fuzzy', () => {
    const exact = target('exact', 'trichy');
    const nearby = target('nearby', 'trichyy');
    const index = buildAliasIndex([exact, nearby]);
    const result = match('trichy', index, unsolved('exact', 'nearby'));
    expect(result.ids).toEqual(['exact']);
  });

  describe('real cases from the south-india pack', () => {
    const targets = [
      target('kozhikode', 'Kozhikode', ['Calicut']),
      target('thiruvananthapuram', 'Thiruvananthapuram', ['Trivandrum']),
      target('kanniyakumari', 'Kanniyakumari', ['Kanyakumari', 'Cape Comorin']),
      target('the-nilgiris', 'The Nilgiris', ['Nilgiris', 'Ooty']),
      target('tuticorin', 'Tuticorin', ['Thoothukkudi', 'Thoothukudi']),
      target('tiruchirapalli', 'Tiruchirapalli', ['Tiruchirappalli', 'Trichy', 'Tiruchi']),
    ];
    const index = buildAliasIndex(targets);
    const allUnsolved = unsolved(...targets.map((t) => t.id));

    it.each([
      ['trichy', 'tiruchirapalli'],
      ['thoothukudi', 'tuticorin'],
      ['trivandrum', 'thiruvananthapuram'],
      ['calicut', 'kozhikode'],
      ['nilgiris', 'the-nilgiris'],
      ['kanyakumari', 'kanniyakumari'],
    ])('%s -> %s', (input, expectedId) => {
      expect(match(input, index, allUnsolved).ids).toEqual([expectedId]);
    });
  });
});
