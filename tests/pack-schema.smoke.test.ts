import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';

// One runnable check: the schema itself must be well-formed enough for Ajv
// to compile, and it must actually reject an obviously-invalid pack.
describe('pack.schema.json', () => {
  const schema = JSON.parse(readFileSync('packs/schema/pack.schema.json', 'utf-8'));
  const ajv = new Ajv2020();

  it('compiles', () => {
    expect(() => ajv.compile(schema)).not.toThrow();
  });

  it('rejects an empty object', () => {
    const validate = ajv.compile(schema);
    expect(validate({})).toBe(false);
  });
});
