/**
 * CLI: validates every packs/<pack-id>/pack.json against
 * packs/schema/pack.schema.json, plus cross-reference checks the schema
 * can't express. Run via `npm run validate:packs`; used in CI. This is the
 * one module in tools/ implemented for real rather than stubbed — pack
 * validation is the contributor contract and must not ship broken.
 *
 * Convention enforced here (see docs/PACK-SPEC.md "SVG binding"):
 * each packs/<pack-id>/ directory holds pack.json next to a geometry.svg
 * containing the <path id="..."> elements pack.json's targets bind to.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import type { ValidateFunction } from 'ajv';

export interface ValidationResult {
  packDir: string;
  errors: string[];
}

export interface RunResult {
  code: number;
  results: ValidationResult[];
  report: string;
}

let compiledSchema: ValidateFunction | undefined;

/** Compiles packs/schema/pack.schema.json once and caches the validator. */
function getSchemaValidator(schemaPath: string): ValidateFunction {
  if (!compiledSchema) {
    const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
    compiledSchema = new Ajv2020({ allErrors: true }).compile(schema);
  }
  return compiledSchema;
}

/**
 * Extracts every `id` attribute on a <path> element from raw SVG source.
 * ponytail: regex scan, not a real XML parser — upgrade to a DOM/SAX parser
 * if pack geometry ever needs namespaces, CDATA, or nested <path> in <defs>.
 */
export function extractSvgIds(svgSource: string): Set<string> {
  const ids = new Set<string>();
  const pathTagPattern = /<path\b[^>]*>/g;
  const idAttrPattern = /\bid="([^"]+)"/;
  for (const [tag] of svgSource.matchAll(pathTagPattern)) {
    const match = idAttrPattern.exec(tag);
    if (match?.[1]) ids.add(match[1]);
  }
  return ids;
}

/**
 * Validates a parsed pack against the schema (structural shape) plus
 * cross-reference invariants the schema can't express: pathId existence in
 * the pack's geometry, groupId references, and id uniqueness. Pure function
 * (no filesystem access) so it's directly unit-testable.
 */
export function validatePackData(
  data: unknown,
  svgIds: ReadonlySet<string>,
  schemaPath: string,
): string[] {
  const errors: string[] = [];

  const validate = getSchemaValidator(schemaPath);
  if (!validate(data)) {
    for (const err of validate.errors ?? []) {
      errors.push(`schema: ${err.instancePath || '(root)'} ${err.message}`);
    }
    // Structural shape is broken enough that cross-reference checks below
    // would just produce noise (e.g. missing `targets` array).
    return errors;
  }

  const pack = data as {
    groups: { id: string }[];
    targets: { id: string; groupId: string; pathId: string }[];
  };

  const groupIds = new Set<string>();
  for (const group of pack.groups) {
    if (groupIds.has(group.id)) {
      errors.push(`duplicate group id: "${group.id}"`);
    }
    groupIds.add(group.id);
  }

  const targetIds = new Set<string>();
  for (const target of pack.targets) {
    if (targetIds.has(target.id)) {
      errors.push(`duplicate target id: "${target.id}"`);
    }
    targetIds.add(target.id);

    if (!groupIds.has(target.groupId)) {
      errors.push(`target "${target.id}" references unknown groupId "${target.groupId}"`);
    }

    if (!svgIds.has(target.pathId)) {
      errors.push(
        `target "${target.id}" references pathId "${target.pathId}" not found in geometry.svg`,
      );
    }
  }

  return errors;
}

/** Directories under packsRoot that contain a pack.json, excluding schema/. */
export function discoverPackDirs(packsRoot: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(packsRoot);
  } catch {
    return [];
  }
  return entries
    .filter((name) => name !== 'schema')
    .map((name) => join(packsRoot, name))
    .filter((dir) => {
      try {
        return statSync(dir).isDirectory() && statSync(join(dir, 'pack.json')).isFile();
      } catch {
        return false;
      }
    });
}

/** Reads and validates one pack directory's pack.json + geometry.svg. */
export function validatePackDir(packDir: string, schemaPath: string): ValidationResult {
  const errors: string[] = [];

  let data: unknown;
  try {
    data = JSON.parse(readFileSync(join(packDir, 'pack.json'), 'utf-8'));
  } catch (err) {
    return { packDir, errors: [`could not read/parse pack.json: ${(err as Error).message}`] };
  }

  let svgIds: Set<string>;
  try {
    svgIds = extractSvgIds(readFileSync(join(packDir, 'geometry.svg'), 'utf-8'));
  } catch {
    errors.push('geometry.svg not found alongside pack.json');
    svgIds = new Set();
  }

  errors.push(...validatePackData(data, svgIds, schemaPath));
  return { packDir, errors };
}

/** Discovers and validates every pack; pure aside from the filesystem reads. */
export function runValidation(packsRoot: string, schemaPath: string): RunResult {
  const packDirs = discoverPackDirs(packsRoot);

  if (packDirs.length === 0) {
    return { code: 0, results: [], report: 'No packs found under packs/ — nothing to validate.' };
  }

  const results = packDirs.map((dir) => validatePackDir(dir, schemaPath));
  const failed = results.filter((r) => r.errors.length > 0);

  const lines: string[] = [];
  for (const result of results) {
    if (result.errors.length === 0) {
      lines.push(`OK    ${result.packDir}`);
    } else {
      lines.push(`FAIL  ${result.packDir}`);
      for (const err of result.errors) lines.push(`      - ${err}`);
    }
  }
  lines.push('');
  lines.push(`${results.length - failed.length}/${results.length} packs valid.`);

  return { code: failed.length > 0 ? 1 : 0, results, report: lines.join('\n') };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const { code, report } = runValidation(
    resolve('packs'),
    resolve('packs/schema/pack.schema.json'),
  );
  console.log(report);
  process.exit(code);
}
