import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyFit,
  buildPack,
  computeFit,
  computeProjectionParams,
  pointToPolygonDist,
  poleOfInaccessibility,
  projectLonLat,
  ringArea,
  run,
  simplifyRing,
  type CliOptions,
  type GeoJsonFeature,
  type GeoJsonFeatureCollection,
  type Ring,
} from '../tools/geojson-to-pack';
import { runValidation } from '../tools/validate-pack';

const schemaPath = join(process.cwd(), 'packs/schema/pack.schema.json');

// --- fixture helpers --------------------------------------------------------

function rectRing(lon1: number, lat1: number, lon2: number, lat2: number): Ring {
  return [
    [lon1, lat1],
    [lon2, lat1],
    [lon2, lat2],
    [lon1, lat2],
    [lon1, lat1],
  ];
}

function feature(name: string, state: string, ring: Ring): GeoJsonFeature {
  return {
    type: 'Feature',
    properties: { NAME: name, STATE: state },
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
}

/** Four small rectangular "districts" across two "states" — a minimal, hand-designed source. */
function fourDistrictFixture(): GeoJsonFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      feature('Alpha', 'State One', rectRing(75, 10, 76, 11)),
      feature('Beta', 'State One', rectRing(76, 10, 77, 11)),
      feature('Gamma', 'State Two', rectRing(75, 9, 76, 10)),
      feature('Delta', 'State Two', rectRing(76, 9, 77, 10)),
    ],
  };
}

function baseOptions(overrides: Partial<CliOptions> = {}): CliOptions {
  return {
    input: 'unused-by-buildPack',
    id: 'test-pack',
    nameProp: 'NAME',
    groupProp: 'STATE',
    tolerance: 1.5,
    width: 800,
    height: 1000,
    padding: 20,
    title: 'Test Pack',
    subtitle: 'A pack for tests',
    attribution: 'test attribution',
    ...overrides,
  };
}

// --- projection --------------------------------------------------------------

describe('projection', () => {
  it('produces coordinates inside the declared viewBox', () => {
    const bbox = { lonMin: 75, lonMax: 77, latMin: 9, latMax: 11 };
    const params = computeProjectionParams(bbox);
    const [projWidth] = projectLonLat(bbox.lonMax, bbox.latMax, params);
    const [, projHeight] = projectLonLat(bbox.lonMin, bbox.latMin, params);
    const width = 800;
    const height = 1000;
    const fit = computeFit(projWidth, projHeight, width, height, 20);

    for (const lon of [75, 75.5, 76, 76.7, 77]) {
      for (const lat of [9, 9.3, 10, 10.8, 11]) {
        const [x, y] = projectLonLat(lon, lat, params);
        const [fx, fy] = applyFit(x, y, fit);
        expect(fx).toBeGreaterThanOrEqual(0);
        expect(fx).toBeLessThanOrEqual(width);
        expect(fy).toBeGreaterThanOrEqual(0);
        expect(fy).toBeLessThanOrEqual(height);
      }
    }
  });

  it('end-to-end: every target in a built pack stays inside its viewBox', () => {
    const { pack } = buildPack(fourDistrictFixture(), baseOptions());
    const [, , w, h] = pack.viewBox;
    for (const target of pack.targets) {
      expect(target.labelPoint.x).toBeGreaterThanOrEqual(0);
      expect(target.labelPoint.x).toBeLessThanOrEqual(w);
      expect(target.labelPoint.y).toBeGreaterThanOrEqual(0);
      expect(target.labelPoint.y).toBeLessThanOrEqual(h);
    }
  });
});

// --- pole of inaccessibility --------------------------------------------------

describe('poleOfInaccessibility', () => {
  // A "staple"/horseshoe: base 0<=x<=10,0<=y<=3 plus two prongs at x:0-3 and
  // x:7-10 rising to y=10. The area centroid of this shape falls in the empty
  // notch (3<x<7, y>3) between the prongs — outside the polygon entirely.
  const staple: Ring[] = [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [7, 10],
      [7, 3],
      [3, 3],
      [3, 10],
      [0, 10],
      [0, 0],
    ],
  ];

  it('the naive area centroid actually lands outside this polygon (sanity check)', () => {
    // area-weighted centroid, computed by hand for the fixture above: (5, 4.4167)
    expect(pointToPolygonDist(5, 4.4167, staple)).toBeLessThan(0);
  });

  it('lands inside a deliberately concave polygon', () => {
    const pole = poleOfInaccessibility(staple);
    expect(pointToPolygonDist(pole.x, pole.y, staple)).toBeGreaterThan(0);
  });
});

// --- simplification ------------------------------------------------------------

describe('simplification', () => {
  it('drops near-collinear points beyond tolerance while keeping the ring valid', () => {
    // A near-straight edge with jitter well under a 1.5px-equivalent tolerance.
    const wiggly: Ring = [
      [0, 0],
      [1, 0.01],
      [2, -0.01],
      [3, 0.01],
      [4, -0.01],
      [5, 0.01],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ];
    const simplified = simplifyRing(wiggly, 1);
    expect(simplified.length).toBeLessThan(wiggly.length);
    expect(simplified.length).toBeGreaterThanOrEqual(4);
  });

  it('reduces output size without dropping any feature', () => {
    const wigglyRing: Ring = rectRing(75, 10, 76, 11).flatMap((point, i, arr) => {
      // Subdivide the bottom edge (75,10)->(76,10) with jittered intermediate points.
      if (i !== 0 || arr.length < 2) return [point];
      const jittered: Ring = [point];
      for (let k = 1; k < 20; k++) {
        const lon = 75 + (k / 20) * 1;
        const lat = 10 + (k % 2 === 0 ? 0.0005 : -0.0005);
        jittered.push([lon, lat]);
      }
      return jittered;
    });
    const fc: GeoJsonFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        feature('Wiggly', 'State One', wigglyRing),
        feature('Plain', 'State One', rectRing(76, 10, 77, 11)),
      ],
    };
    const { pack, svgBefore, svgAfter } = buildPack(fc, baseOptions());

    expect(pack.targets).toHaveLength(2); // no feature dropped
    expect((svgAfter.match(/<path /g) ?? []).length).toBe(2);
    expect((svgBefore.match(/<path /g) ?? []).length).toBe(2);
    expect(Buffer.byteLength(svgAfter, 'utf-8')).toBeLessThan(
      Buffer.byteLength(svgBefore, 'utf-8'),
    );
  });
});

// --- determinism -----------------------------------------------------------

describe('determinism', () => {
  it('produces byte-identical output across two consecutive runs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mapdrill-geojson-to-pack-'));
    try {
      const inputPath = join(dir, 'source.geojson');
      writeFileSync(inputPath, JSON.stringify(fourDistrictFixture()));

      const outDirA = join(dir, 'run-a');
      const outDirB = join(dir, 'run-b');
      run(baseOptions({ input: inputPath, outDir: outDirA }));
      run(baseOptions({ input: inputPath, outDir: outDirB }));

      const packA = readFileSync(join(outDirA, 'pack.json'), 'utf-8');
      const packB = readFileSync(join(outDirB, 'pack.json'), 'utf-8');
      const svgA = readFileSync(join(outDirA, 'geometry.svg'), 'utf-8');
      const svgB = readFileSync(join(outDirB, 'geometry.svg'), 'utf-8');

      expect(packA).toBe(packB);
      expect(svgA).toBe(svgB);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// --- validity ----------------------------------------------------------------

describe('validate-pack integration', () => {
  it('emits a pack that passes tools/validate-pack.ts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mapdrill-geojson-to-pack-'));
    try {
      const inputPath = join(dir, 'source.geojson');
      writeFileSync(inputPath, JSON.stringify(fourDistrictFixture()));

      const packsRoot = join(dir, 'packs');
      run(baseOptions({ input: inputPath, outDir: join(packsRoot, 'test-pack') }));

      const result = runValidation(packsRoot, schemaPath);
      expect(result.code, result.report).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('never emits more than the two fillTokens defined in tokens.css today for 2 groups', () => {
    const { pack } = buildPack(fourDistrictFixture(), baseOptions());
    expect(pack.groups.map((g) => g.fillToken).sort()).toEqual([
      'region-primary',
      'region-secondary',
    ]);
  });
});

// --- ringArea sanity (used for tiering and MultiPolygon part selection) ------

describe('ringArea', () => {
  it('computes the area of a simple rectangle', () => {
    const rect: Ring = [
      [0, 0],
      [4, 0],
      [4, 3],
      [0, 3],
      [0, 0],
    ];
    expect(ringArea(rect)).toBe(12);
  });
});
