import type { Furniture } from '../office';
import { BACK_FURNITURE } from './furniture-back';
import { BULLPEN_FURNITURE } from './furniture-bullpen';
import { FRONT_FURNITURE } from './furniture-front';
import { WAREHOUSE_FURNITURE } from './furniture-warehouse';

export const FURNITURE: readonly Furniture[] = [...FRONT_FURNITURE, ...BULLPEN_FURNITURE, ...BACK_FURNITURE, ...WAREHOUSE_FURNITURE];
