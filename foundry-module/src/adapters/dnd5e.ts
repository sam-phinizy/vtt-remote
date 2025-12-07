/**
 * D&D 5th Edition system adapter.
 * Extracts actor data from the dnd5e system for the phone info panel.
 */

import type { ActorPanelData, Resource, Stat, SystemAdapter } from './types';

// Type definitions for dnd5e actor structure (simplified)
interface Dnd5eActor {
  name: string;
  img?: string;
  type: string;
  system: {
    attributes: {
      hp: { value: number; max: number; temp?: number };
      ac: { value: number };
      movement: { walk?: number; fly?: number; swim?: number };
    };
    details: {
      level?: number;
      cr?: number;
    };
    spells?: Record<string, { value: number; max: number }>;
  };
  items: Array<{ type: string; name: string }>;
}

interface Dnd5eToken {
  id: string;
  name: string;
  actor?: {
    statuses?: Set<string>;
  };
}

/**
 * Extract spell slot resources from dnd5e spells object.
 */
function extractSpellSlots(spells: Record<string, { value: number; max: number }> | undefined): Resource[] {
  if (!spells) return [];

  const slots: Resource[] = [];
  for (let level = 1; level <= 9; level++) {
    const key = `spell${level}`;
    const slot = spells[key];
    if (slot && slot.max > 0) {
      slots.push({
        id: key,
        label: `L${level} Slots`,
        current: slot.value,
        max: slot.max,
        color: '#8b5cf6', // Purple for spell slots
      });
    }
  }
  return slots;
}

/**
 * Get the primary class name from actor items.
 */
function getPrimaryClass(items: Array<{ type: string; name: string }>): string {
  const classItem = items.find((i) => i.type === 'class');
  return classItem?.name ?? '';
}

export const dnd5eAdapter: SystemAdapter = {
  systemId: 'dnd5e',

  extractActorData(actor: unknown, token: unknown): ActorPanelData {
    const a = actor as Dnd5eActor;
    const t = token as Dnd5eToken;
    const sys = a.system;

    const resources: Resource[] = [
      {
        id: 'hp',
        label: 'HP',
        current: sys.attributes.hp.value,
        max: sys.attributes.hp.max,
        color: '#e74c3c', // Red for HP
      },
    ];

    // Add temp HP if present
    if (sys.attributes.hp.temp && sys.attributes.hp.temp > 0) {
      resources.push({
        id: 'temp-hp',
        label: 'Temp HP',
        current: sys.attributes.hp.temp,
        max: sys.attributes.hp.temp, // Temp HP has no "max", show current as max
        color: '#3498db', // Blue for temp HP
      });
    }

    // Add spell slots for spellcasters
    resources.push(...extractSpellSlots(sys.spells));

    const stats: Stat[] = [
      { id: 'ac', label: 'AC', value: sys.attributes.ac.value },
    ];

    // Add movement speed
    const speed = sys.attributes.movement.walk ?? 0;
    if (speed > 0) {
      stats.push({ id: 'speed', label: 'Speed', value: `${speed} ft` });
    }

    // Add level for PCs, CR for NPCs
    if (a.type === 'character' && sys.details.level) {
      stats.push({ id: 'level', label: 'Level', value: sys.details.level });
      const className = getPrimaryClass(a.items);
      if (className) {
        stats.push({ id: 'class', label: 'Class', value: className });
      }
    } else if (a.type === 'npc' && sys.details.cr !== undefined) {
      stats.push({ id: 'cr', label: 'CR', value: sys.details.cr });
    }

    // Extract conditions from token statuses
    const conditions: string[] = [];
    if (t.actor?.statuses) {
      for (const status of t.actor.statuses) {
        conditions.push(status);
      }
    }

    return {
      tokenId: t.id,
      name: t.name,
      portrait: a.img,
      resources,
      stats,
      conditions,
    };
  },
};
