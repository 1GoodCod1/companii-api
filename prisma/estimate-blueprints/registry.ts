import type { EstimateBlueprintConfig } from '../estimate-blueprint-config.types';
import { validateBlueprintUnits } from './base';
import { acoperisBlueprint } from './categories/acoperis.blueprint';
import { acoperisPlatBlueprint } from './categories/acoperis-plat.blueprint';
import { cleaningBlueprint } from './categories/cleaning.blueprint';
import { climaBlueprint } from './categories/clima.blueprint';
import { constructiiBlueprint } from './categories/constructii.blueprint';
import { elektrikaBlueprint } from './categories/elektrika.blueprint';
import { fatadeBlueprint } from './categories/fatade.blueprint';
import { itNetworksBlueprint } from './categories/it-networks.blueprint';
import { lucrariFinisajBlueprint } from './categories/lucrari-finisaj.blueprint';
import { mobilaBlueprint } from './categories/mobila.blueprint';
import { oknaDveriBlueprint } from './categories/okna-dveri.blueprint';
import { panouriSolareBlueprint } from './categories/panouri-solare.blueprint';
import { pavajBlueprint } from './categories/pavaj.blueprint';
import { santehnikaBlueprint } from './categories/santehnika.blueprint';

export const CATEGORY_BLUEPRINTS = {
  santehnika: santehnikaBlueprint,
  elektrika: elektrikaBlueprint,
  clima: climaBlueprint,
  'lucrari-finisaj': lucrariFinisajBlueprint,
  acoperis: acoperisBlueprint,
  'acoperis-plat': acoperisPlatBlueprint,
  fatade: fatadeBlueprint,
  'okna-dveri': oknaDveriBlueprint,
  mobila: mobilaBlueprint,
  cleaning: cleaningBlueprint,
  'it-networks': itNetworksBlueprint,
  'panouri-solare': panouriSolareBlueprint,
  constructii: constructiiBlueprint,
  pavaj: pavajBlueprint,
} satisfies Record<string, EstimateBlueprintConfig>;

for (const [slug, config] of Object.entries(CATEGORY_BLUEPRINTS)) {
  validateBlueprintUnits(slug, config);
}

export {
  acoperisBlueprint,
  acoperisPlatBlueprint,
  cleaningBlueprint,
  climaBlueprint,
  constructiiBlueprint,
  elektrikaBlueprint,
  fatadeBlueprint,
  itNetworksBlueprint,
  lucrariFinisajBlueprint,
  mobilaBlueprint,
  oknaDveriBlueprint,
  panouriSolareBlueprint,
  pavajBlueprint,
  santehnikaBlueprint,
};
