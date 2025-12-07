import { describe, it, expect } from 'vitest';
import { dnd5eAdapter } from '../adapters/dnd5e';

// Mock D&D 5e actor structure
function createMockActor(overrides: Partial<{
  name: string;
  img: string | undefined;
  type: string;
  hp: { value: number; max: number; temp?: number };
  ac: number;
  walk: number;
  level: number;
  cr: number;
  spells: Record<string, { value: number; max: number }>;
  items: Array<{ type: string; name: string }>;
}> = {}) {
  return {
    name: overrides.name ?? 'Test Actor',
    img: 'img' in overrides ? overrides.img : '/path/to/image.png',
    type: overrides.type ?? 'character',
    system: {
      attributes: {
        hp: overrides.hp ?? { value: 25, max: 45 },
        ac: { value: overrides.ac ?? 16 },
        movement: { walk: overrides.walk ?? 30 },
      },
      details: {
        level: overrides.level,
        cr: overrides.cr,
      },
      spells: overrides.spells,
    },
    items: overrides.items ?? [{ type: 'class', name: 'Fighter' }],
  };
}

// Mock token structure
function createMockToken(overrides: Partial<{
  id: string;
  name: string;
  statuses: string[];
}> = {}) {
  return {
    id: overrides.id ?? 'tok123',
    name: overrides.name ?? 'Shadowcat',
    actor: {
      statuses: overrides.statuses ? new Set(overrides.statuses) : new Set(),
    },
  };
}

describe('dnd5eAdapter', () => {
  describe('systemId', () => {
    it('has correct system ID', () => {
      expect(dnd5eAdapter.systemId).toBe('dnd5e');
    });
  });

  describe('extractActorData', () => {
    describe('basic fields', () => {
      it('extracts token ID and name', () => {
        const actor = createMockActor();
        const token = createMockToken({ id: 'myToken', name: 'Hero' });

        const data = dnd5eAdapter.extractActorData(actor, token);

        expect(data.tokenId).toBe('myToken');
        expect(data.name).toBe('Hero');
      });

      it('extracts portrait from actor img', () => {
        const actor = createMockActor({ img: '/custom/portrait.webp' });
        const token = createMockToken();

        const data = dnd5eAdapter.extractActorData(actor, token);

        expect(data.portrait).toBe('/custom/portrait.webp');
      });

      it('handles missing portrait', () => {
        const actor = createMockActor({ img: undefined });
        const token = createMockToken();

        const data = dnd5eAdapter.extractActorData(actor, token);

        expect(data.portrait).toBeUndefined();
      });
    });

    describe('HP resources', () => {
      it('extracts HP correctly', () => {
        const actor = createMockActor({ hp: { value: 25, max: 45 } });
        const token = createMockToken();

        const data = dnd5eAdapter.extractActorData(actor, token);
        const hp = data.resources.find((r) => r.id === 'hp');

        expect(hp).toBeDefined();
        expect(hp?.current).toBe(25);
        expect(hp?.max).toBe(45);
        expect(hp?.label).toBe('HP');
        expect(hp?.color).toBe('#e74c3c');
      });

      it('handles zero HP', () => {
        const actor = createMockActor({ hp: { value: 0, max: 30 } });
        const token = createMockToken();

        const data = dnd5eAdapter.extractActorData(actor, token);
        const hp = data.resources.find((r) => r.id === 'hp');

        expect(hp?.current).toBe(0);
        expect(hp?.max).toBe(30);
      });

      it('extracts temp HP when present', () => {
        const actor = createMockActor({ hp: { value: 20, max: 40, temp: 10 } });
        const token = createMockToken();

        const data = dnd5eAdapter.extractActorData(actor, token);
        const tempHp = data.resources.find((r) => r.id === 'temp-hp');

        expect(tempHp).toBeDefined();
        expect(tempHp?.current).toBe(10);
        expect(tempHp?.max).toBe(10);
        expect(tempHp?.label).toBe('Temp HP');
        expect(tempHp?.color).toBe('#3498db');
      });

      it('does not include temp HP when zero', () => {
        const actor = createMockActor({ hp: { value: 20, max: 40, temp: 0 } });
        const token = createMockToken();

        const data = dnd5eAdapter.extractActorData(actor, token);
        const tempHp = data.resources.find((r) => r.id === 'temp-hp');

        expect(tempHp).toBeUndefined();
      });

      it('does not include temp HP when undefined', () => {
        const actor = createMockActor({ hp: { value: 20, max: 40 } });
        const token = createMockToken();

        const data = dnd5eAdapter.extractActorData(actor, token);
        const tempHp = data.resources.find((r) => r.id === 'temp-hp');

        expect(tempHp).toBeUndefined();
      });
    });

    describe('spell slots', () => {
      it('extracts spell slots for spellcasters', () => {
        const actor = createMockActor({
          spells: {
            spell1: { value: 2, max: 4 },
            spell2: { value: 1, max: 3 },
            spell3: { value: 0, max: 2 },
          },
        });
        const token = createMockToken();

        const data = dnd5eAdapter.extractActorData(actor, token);

        const slot1 = data.resources.find((r) => r.id === 'spell1');
        expect(slot1).toBeDefined();
        expect(slot1?.label).toBe('L1 Slots');
        expect(slot1?.current).toBe(2);
        expect(slot1?.max).toBe(4);
        expect(slot1?.color).toBe('#8b5cf6');

        const slot2 = data.resources.find((r) => r.id === 'spell2');
        expect(slot2?.current).toBe(1);
        expect(slot2?.max).toBe(3);

        const slot3 = data.resources.find((r) => r.id === 'spell3');
        expect(slot3?.current).toBe(0);
        expect(slot3?.max).toBe(2);
      });

      it('skips spell slots with zero max', () => {
        const actor = createMockActor({
          spells: {
            spell1: { value: 0, max: 0 },
            spell2: { value: 2, max: 3 },
          },
        });
        const token = createMockToken();

        const data = dnd5eAdapter.extractActorData(actor, token);

        const slot1 = data.resources.find((r) => r.id === 'spell1');
        expect(slot1).toBeUndefined();

        const slot2 = data.resources.find((r) => r.id === 'spell2');
        expect(slot2).toBeDefined();
      });

      it('handles missing spells object', () => {
        const actor = createMockActor({ spells: undefined });
        const token = createMockToken();

        const data = dnd5eAdapter.extractActorData(actor, token);

        // Should only have HP, no spell slots
        const spellResources = data.resources.filter((r) => r.id.startsWith('spell'));
        expect(spellResources).toHaveLength(0);
      });
    });

    describe('stats', () => {
      it('extracts AC', () => {
        const actor = createMockActor({ ac: 18 });
        const token = createMockToken();

        const data = dnd5eAdapter.extractActorData(actor, token);
        const ac = data.stats.find((s) => s.id === 'ac');

        expect(ac).toBeDefined();
        expect(ac?.label).toBe('AC');
        expect(ac?.value).toBe(18);
      });

      it('extracts walking speed', () => {
        const actor = createMockActor({ walk: 35 });
        const token = createMockToken();

        const data = dnd5eAdapter.extractActorData(actor, token);
        const speed = data.stats.find((s) => s.id === 'speed');

        expect(speed).toBeDefined();
        expect(speed?.label).toBe('Speed');
        expect(speed?.value).toBe('35 ft');
      });

      it('omits speed when zero', () => {
        const actor = createMockActor({ walk: 0 });
        const token = createMockToken();

        const data = dnd5eAdapter.extractActorData(actor, token);
        const speed = data.stats.find((s) => s.id === 'speed');

        expect(speed).toBeUndefined();
      });

      it('extracts level and class for PCs', () => {
        const actor = createMockActor({
          type: 'character',
          level: 5,
          items: [{ type: 'class', name: 'Wizard' }],
        });
        const token = createMockToken();

        const data = dnd5eAdapter.extractActorData(actor, token);

        const level = data.stats.find((s) => s.id === 'level');
        expect(level?.value).toBe(5);

        const classInfo = data.stats.find((s) => s.id === 'class');
        expect(classInfo?.value).toBe('Wizard');
      });

      it('handles PC without class item', () => {
        const actor = createMockActor({
          type: 'character',
          level: 3,
          items: [{ type: 'equipment', name: 'Sword' }],
        });
        const token = createMockToken();

        const data = dnd5eAdapter.extractActorData(actor, token);

        const level = data.stats.find((s) => s.id === 'level');
        expect(level?.value).toBe(3);

        const classInfo = data.stats.find((s) => s.id === 'class');
        expect(classInfo).toBeUndefined();
      });

      it('extracts CR for NPCs', () => {
        const actor = createMockActor({
          type: 'npc',
          cr: 5,
        });
        const token = createMockToken();

        const data = dnd5eAdapter.extractActorData(actor, token);

        const cr = data.stats.find((s) => s.id === 'cr');
        expect(cr?.label).toBe('CR');
        expect(cr?.value).toBe(5);

        // Should not have level/class
        expect(data.stats.find((s) => s.id === 'level')).toBeUndefined();
        expect(data.stats.find((s) => s.id === 'class')).toBeUndefined();
      });

      it('handles CR 0 for NPCs', () => {
        const actor = createMockActor({
          type: 'npc',
          cr: 0,
        });
        const token = createMockToken();

        const data = dnd5eAdapter.extractActorData(actor, token);

        const cr = data.stats.find((s) => s.id === 'cr');
        expect(cr?.value).toBe(0);
      });
    });

    describe('conditions', () => {
      it('extracts conditions from token statuses', () => {
        const actor = createMockActor();
        const token = createMockToken({
          statuses: ['prone', 'poisoned', 'frightened'],
        });

        const data = dnd5eAdapter.extractActorData(actor, token);

        expect(data.conditions).toContain('prone');
        expect(data.conditions).toContain('poisoned');
        expect(data.conditions).toContain('frightened');
        expect(data.conditions).toHaveLength(3);
      });

      it('returns empty array when no conditions', () => {
        const actor = createMockActor();
        const token = createMockToken({ statuses: [] });

        const data = dnd5eAdapter.extractActorData(actor, token);

        expect(data.conditions).toEqual([]);
      });

      it('handles missing statuses set', () => {
        const actor = createMockActor();
        const token = {
          id: 'tok1',
          name: 'Test',
          actor: {},
        };

        const data = dnd5eAdapter.extractActorData(actor, token);

        expect(data.conditions).toEqual([]);
      });

      it('handles missing actor on token', () => {
        const actor = createMockActor();
        const token = {
          id: 'tok1',
          name: 'Test',
        };

        const data = dnd5eAdapter.extractActorData(actor, token);

        expect(data.conditions).toEqual([]);
      });
    });

    describe('full data extraction', () => {
      it('returns complete ActorPanelData for a typical PC', () => {
        const actor = createMockActor({
          name: 'Gandalf',
          img: '/portraits/gandalf.webp',
          type: 'character',
          hp: { value: 55, max: 80, temp: 5 },
          ac: 15,
          walk: 30,
          level: 10,
          spells: {
            spell1: { value: 2, max: 4 },
            spell5: { value: 1, max: 2 },
          },
          items: [{ type: 'class', name: 'Wizard' }],
        });
        const token = createMockToken({
          id: 'gandalf-token',
          name: 'Gandalf the Grey',
          statuses: ['concentrating'],
        });

        const data = dnd5eAdapter.extractActorData(actor, token);

        // Basic info
        expect(data.tokenId).toBe('gandalf-token');
        expect(data.name).toBe('Gandalf the Grey');
        expect(data.portrait).toBe('/portraits/gandalf.webp');

        // Resources
        expect(data.resources.find((r) => r.id === 'hp')?.current).toBe(55);
        expect(data.resources.find((r) => r.id === 'temp-hp')?.current).toBe(5);
        expect(data.resources.find((r) => r.id === 'spell1')).toBeDefined();
        expect(data.resources.find((r) => r.id === 'spell5')).toBeDefined();

        // Stats
        expect(data.stats.find((s) => s.id === 'ac')?.value).toBe(15);
        expect(data.stats.find((s) => s.id === 'speed')?.value).toBe('30 ft');
        expect(data.stats.find((s) => s.id === 'level')?.value).toBe(10);
        expect(data.stats.find((s) => s.id === 'class')?.value).toBe('Wizard');

        // Conditions
        expect(data.conditions).toContain('concentrating');
      });
    });
  });
});
