/**
 * Adapter registry for game system support.
 * Maps Foundry system IDs to their respective adapters.
 */

import type { SystemAdapter } from './types';
import { dnd5eAdapter } from './dnd5e';

// Re-export types for convenience
export type { ActorPanelData, Resource, Stat, SystemAdapter } from './types';

/**
 * Registry of available system adapters.
 * Add new adapters here as they are implemented.
 */
const adapters: Record<string, SystemAdapter> = {
  dnd5e: dnd5eAdapter,
};

// Foundry global - declared as any since we're not using @league-of-foundry-developers types
declare const game: { system?: { id: string } } | undefined;

/**
 * Get the adapter for the current game system.
 * @returns The adapter for the current system, or null if unsupported.
 */
export function getAdapter(): SystemAdapter | null {
  const systemId = game?.system?.id;
  if (!systemId) {
    return null;
  }
  return adapters[systemId] ?? null;
}

/**
 * Check if the current game system is supported.
 */
export function isSystemSupported(): boolean {
  return getAdapter() !== null;
}

/**
 * Get list of supported system IDs.
 */
export function getSupportedSystems(): string[] {
  return Object.keys(adapters);
}
