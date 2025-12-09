/**
 * D&D 5th Edition system adapter.
 * Extracts actor data from the dnd5e system for the phone info panel.
 */

import type { Ability, AbilityCategory, ActorPanelData, Resource, Stat, SystemAdapter } from './types';

/**
 * Convert a relative Foundry path to an absolute URL.
 * This is needed for the phone client to load images from Foundry.
 */
function toAbsoluteUrl(path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http')) return path; // Already absolute
  return `${window.location.origin}/${path.replace(/^\//, '')}`;
}

// Type definitions for dnd5e actor structure (simplified)
interface Dnd5eItem {
  id: string;
  name: string;
  img?: string;
  type: string;
  system: {
    description?: { value?: string };
    uses?: { value: number; max: number; per?: string };
    preparation?: { prepared?: boolean; mode?: string };
    activation?: { type?: string };
    level?: number;
  };
}

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
  items: Dnd5eItem[] & { contents?: Dnd5eItem[] };
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

/**
 * Map D&D 5e item type to ability category.
 */
function getAbilityCategory(itemType: string): AbilityCategory {
  switch (itemType) {
    case 'spell':
      return 'spell';
    case 'feat':
      return 'feature';
    case 'weapon':
      return 'weapon';
    case 'consumable':
      return 'consumable';
    default:
      return 'other';
  }
}

/**
 * Check if an item is usable (has an activation type or uses).
 */
function isUsableItem(item: Dnd5eItem): boolean {
  // Skip items without system data
  if (!item.system) return false;

  // Items with activation types
  const activationType = item.system.activation?.type;
  if (activationType && activationType !== 'none' && activationType !== '') {
    return true;
  }
  // Items with limited uses
  if (item.system.uses?.max && item.system.uses.max > 0) {
    return true;
  }
  return false;
}

/**
 * Check if a spell is prepared/available.
 */
function isSpellPrepared(item: Dnd5eItem): boolean {
  const prep = item.system.preparation;
  if (!prep) return true; // No preparation needed
  // Always prepared spells (innate, pact, atwill)
  if (prep.mode === 'always' || prep.mode === 'innate' || prep.mode === 'pact' || prep.mode === 'atwill') {
    return true;
  }
  // Standard prepared spells
  return prep.prepared === true;
}

/**
 * Extract a short description snippet from HTML.
 */
function extractDescriptionSnippet(html?: string, maxLength = 100): string | undefined {
  if (!html) return undefined;
  // Strip HTML tags and get plain text
  const text = html.replace(/<[^>]*>/g, '').trim();
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}

/**
 * Extract usable abilities from actor items.
 */
function extractAbilities(items: Dnd5eItem[]): Ability[] {
  const abilities: Ability[] = [];

  for (const item of items) {
    // Skip non-usable items
    if (!isUsableItem(item)) continue;

    // Skip class, background, race items (not usable directly)
    if (['class', 'background', 'race', 'subclass'].includes(item.type)) continue;

    // For spells, skip unprepared ones
    if (item.type === 'spell' && !isSpellPrepared(item)) continue;

    const ability: Ability = {
      id: item.id,
      name: item.name,
      category: getAbilityCategory(item.type),
      img: toAbsoluteUrl(item.img),
    };

    // Add uses if present
    if (item.system.uses?.max && item.system.uses.max > 0) {
      ability.uses = {
        current: item.system.uses.value ?? 0,
        max: item.system.uses.max,
      };
    }

    // Spell-specific data
    if (item.type === 'spell') {
      ability.spellLevel = item.system.level ?? 0;
      ability.prepared = isSpellPrepared(item);
    }

    // Add description snippet for list view
    ability.description = extractDescriptionSnippet(item.system.description?.value);
    // Add full HTML description for info modal
    ability.fullDescription = item.system.description?.value;

    abilities.push(ability);
  }

  // Sort by category, then by name
  const categoryOrder: AbilityCategory[] = ['weapon', 'spell', 'feature', 'consumable', 'other'];
  abilities.sort((a, b) => {
    const catDiff = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
    if (catDiff !== 0) return catDiff;
    // Within spells, sort by level
    if (a.category === 'spell' && b.category === 'spell') {
      const levelDiff = (a.spellLevel ?? 0) - (b.spellLevel ?? 0);
      if (levelDiff !== 0) return levelDiff;
    }
    return a.name.localeCompare(b.name);
  });

  return abilities;
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

    // Extract usable abilities
    const abilities = extractAbilities(a.items as unknown as Dnd5eItem[]);

    return {
      tokenId: t.id,
      name: t.name,
      portrait: toAbsoluteUrl(a.img),
      resources,
      stats,
      conditions,
      abilities,
    };
  },
};
