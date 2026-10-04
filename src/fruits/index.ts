import { apple } from './apple';
import { banana } from './banana';
import type { FruitDef } from './common';
import { grapes } from './grapes';
import { melon } from './melon';
import { pear } from './pear';
import { persimmon } from './persimmon';
import { watermelon } from './watermelon';

/** ステージ順 */
export const FRUITS: FruitDef[] = [apple, persimmon, pear, melon, watermelon, banana, grapes];
