import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  extractSvgIds,
  validatePackData,
  discoverPackDirs,
  runValidation,
} from '../tools/validate-pack';

const schemaPath = join(process.cwd(), 'packs/schema/pack.schema.json');

function validPack() {
  return {
    id: 'test-pack',
    title: 'Test Pack',
    subtitle: 'A pack for tests',
    attribution: 'test',
    viewBox: [0, 0, 100, 100],
    groups: [{ id: 'group-a', name: 'Group A', fillToken: 'region-primary' }],
    targets: [
      {
        id: 'target-a',
        name: 'Target A',
        aliases: [],
        groupId: 'group-a',
        pathId: 'path-a',
        labelPoint: { x: 1, y: 1 },
        labelAnchor: 'n',
        tier: 1,
      },
    ],
  };
}

describe('extractSvgIds', () => {
  it('collects ids from <path> elements', () => {
    const svg = '<svg><path id="a" d="M0 0"/><path id="b" d="M1 1"/><rect id="c"/></svg>';
    expect(extractSvgIds(svg)).toEqual(new Set(['a', 'b']));
  });
});

describe('validatePackData', () => {
  it('passes a well-formed pack', () => {
    const errors = validatePackData(validPack(), new Set(['path-a']), schemaPath);
    expect(errors).toEqual([]);
  });

  it('fails when a target pathId has no matching geometry', () => {
    const errors = validatePackData(validPack(), new Set(['some-other-path']), schemaPath);
    expect(errors.some((e) => e.includes('pathId "path-a"'))).toBe(true);
  });

  it('fails when a target references an unknown groupId', () => {
    const pack = validPack();
    pack.targets[0]!.groupId = 'no-such-group';
    const errors = validatePackData(pack, new Set(['path-a']), schemaPath);
    expect(errors.some((e) => e.includes('unknown groupId'))).toBe(true);
  });

  it('fails on duplicate target ids', () => {
    const pack = validPack();
    pack.targets.push({ ...pack.targets[0]! });
    const errors = validatePackData(pack, new Set(['path-a']), schemaPath);
    expect(errors.some((e) => e.includes('duplicate target id'))).toBe(true);
  });

  it('fails on duplicate group ids', () => {
    const pack = validPack();
    pack.groups.push({ ...pack.groups[0]! });
    const errors = validatePackData(pack, new Set(['path-a']), schemaPath);
    expect(errors.some((e) => e.includes('duplicate group id'))).toBe(true);
  });

  it('fails schema validation for a structurally invalid pack', () => {
    const errors = validatePackData({}, new Set(), schemaPath);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/^schema:/);
  });
});

describe('discoverPackDirs and runValidation with zero packs', () => {
  it('discoverPackDirs returns [] when only schema/ exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mapdrill-packs-'));
    mkdirSync(join(dir, 'schema'));
    try {
      expect(discoverPackDirs(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('runValidation exits 0 cleanly with zero packs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mapdrill-packs-'));
    try {
      const result = runValidation(dir, schemaPath);
      expect(result.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('runValidation end-to-end', () => {
  it('reports all failures for a pack, not just the first', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mapdrill-packs-'));
    const packDir = join(dir, 'broken-pack');
    mkdirSync(packDir);
    const pack = validPack();
    pack.targets.push({ ...pack.targets[0]!, groupId: 'missing-group' });
    writeFileSync(join(packDir, 'pack.json'), JSON.stringify(pack));
    writeFileSync(join(packDir, 'geometry.svg'), '<svg></svg>'); // no matching path ids
    try {
      const result = runValidation(dir, schemaPath);
      expect(result.code).toBe(1);
      const [only] = result.results;
      // both targets miss their pathId, and the second also has an unknown groupId
      expect(only!.errors.length).toBeGreaterThanOrEqual(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes a well-formed pack end-to-end', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mapdrill-packs-'));
    const packDir = join(dir, 'good-pack');
    mkdirSync(packDir);
    writeFileSync(join(packDir, 'pack.json'), JSON.stringify(validPack()));
    writeFileSync(join(packDir, 'geometry.svg'), '<svg><path id="path-a" d="M0 0"/></svg>');
    try {
      const result = runValidation(dir, schemaPath);
      expect(result.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
