/**
 * Loads and validates a pack's pack.json against packs/schema/pack.schema.json
 * before it reaches the engine or UI.
 */
import type { Pack } from './types';

/** Fetches and parses a pack.json by pack id (directory name under packs/). */
export function loadPack(_packId: string): Promise<Pack> {
  throw new Error('TODO');
}

/** Validates a parsed object against the pack schema, throwing with details on failure. */
export function validatePack(_data: unknown): asserts _data is Pack {
  throw new Error('TODO');
}
