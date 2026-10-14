// Dispatch a furniture item to its part builder, then depth-sort its parts for drawing.
import type { Furniture } from '@shared/office';
import { depthSort } from '../../iso/depth';
import { chairParts } from './chairParts';
import {
  binParts, bookshelfParts, cabinetParts, coffeeTableParts, copierParts, couchParts, itCartParts,
  ledgeParts, plantParts, roundTableParts, tableParts, tvParts, waterCoolerParts, whiteboardParts,
} from './commonParts';
import { deskParts } from './deskParts';
import { type Part, partBox } from './parts';
import {
  bulletinParts, partitionParts, receptionDeskParts, suppliesParts, supplyShelfParts, tvStandParts, wallSignParts,
} from './referenceParts';
import {
  counterParts, cratesParts, fridgeParts, kettlebellParts, palletParts, shelvingParts, toiletParts, vanityParts, vendingParts,
} from './roomParts';
import { balustradeParts, pictureParts, stairsParts } from './stairwellParts';
import { wallCabinetsParts } from './kitchenParts';
import { elevatorParts } from './elevatorParts';

function rawParts(f: Furniture): Part[] {
  switch (f.kind) {
    case 'desk': return deskParts(f);
    case 'ledge': return ledgeParts(f);
    case 'table': return tableParts(f);
    case 'round-table': return roundTableParts(f);
    case 'coffee-table': return coffeeTableParts(f);
    case 'couch': return couchParts(f);
    case 'chair':
    case 'armchair': {
      const c = chairParts(f.id, f.kind === 'armchair' ? 'armchair' : 'conference', f.x + f.w / 2, f.y + f.d / 2, f.facing ?? 's', f.color);
      return [...c.behind, ...c.front];
    }
    case 'cabinet': return cabinetParts(f);
    case 'bookshelf': return bookshelfParts(f);
    case 'plant': return plantParts(f);
    case 'bin': return binParts(f);
    case 'copier': return copierParts(f);
    case 'it-cart': return itCartParts(f);
    case 'water-cooler': return waterCoolerParts(f);
    case 'elevator': return elevatorParts(f);
    case 'whiteboard': return whiteboardParts(f);
    case 'tv': return tvParts(f);
    case 'counter': return counterParts(f);
    case 'fridge': return fridgeParts(f);
    case 'vending': return vendingParts(f);
    case 'toilet': return toiletParts(f);
    case 'vanity': return vanityParts(f);
    case 'kettlebell': return kettlebellParts(f);
    case 'shelving': return shelvingParts(f);
    case 'crates': return cratesParts(f);
    case 'pallet': return palletParts(f);
    case 'stairs': return stairsParts(f);
    case 'binder-shelf': return bookshelfParts(f, true);
    case 'reception-desk': return receptionDeskParts(f);
    case 'wall-sign': return wallSignParts(f);
    case 'partition': return partitionParts(f);
    case 'bulletin': return bulletinParts(f);
    case 'supplies': return suppliesParts(f);
    case 'tv-stand': return tvStandParts(f);
    case 'supply-shelf': return supplyShelfParts(f);
    case 'wall-cabinets': return wallCabinetsParts(f);
    case 'balustrade': return balustradeParts(f);
    case 'picture': return pictureParts(f);
    default: return [];
  }
}

export function sortParts(parts: readonly Part[]): Part[] {
  return depthSort(parts.map((part) => ({ id: part.id, box: partBox(part), part }))).map((s) => s.part);
}

export const furnitureParts = (f: Furniture): Part[] => sortParts(rawParts(f));
