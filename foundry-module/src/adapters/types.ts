/**
 * Adapter types for system-specific actor data extraction.
 * Each game system (dnd5e, pf2e, etc.) implements SystemAdapter to map
 * its actor structure to a common panel data format.
 */

/**
 * A trackable resource like HP, spell slots, or ki points.
 */
export interface Resource {
  id: string;
  label: string;
  current: number;
  max: number;
  color?: string; // Hex color for UI theming
}

/**
 * A static stat like AC, speed, or level.
 */
export interface Stat {
  id: string;
  label: string;
  value: string | number;
}

/**
 * Normalized actor data for the phone info panel.
 * System adapters transform system-specific actor data into this format.
 */
export interface ActorPanelData {
  tokenId: string;
  name: string;
  portrait?: string; // URL or base64-encoded image
  resources: Resource[];
  stats: Stat[];
  conditions: string[];
}

/**
 * Interface for system-specific data extraction.
 * Each supported game system implements this to provide actor data.
 */
export interface SystemAdapter {
  /** System ID as registered in Foundry (e.g., 'dnd5e', 'pf2e') */
  systemId: string;

  /**
   * Extract normalized panel data from a Foundry actor and token.
   * @param actor The Foundry Actor document
   * @param token The Foundry Token document
   * @returns Normalized actor panel data
   */
  extractActorData(actor: unknown, token: unknown): ActorPanelData;
}
