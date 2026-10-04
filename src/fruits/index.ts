import { apple } from './apple';
import { banana } from './banana';
import { cherries } from './cherries';
import type { FruitDef } from './common';
import { grapes } from './grapes';
import { melon } from './melon';
import { peach } from './peach';
import { pear } from './pear';
import { persimmon } from './persimmon';
import { pineapple } from './pineapple';
import { watermelon } from './watermelon';

/** ステージ順 */
export const FRUITS: FruitDef[] = [apple, persimmon, melon, pear, pineapple, peach, watermelon, banana, cherries, grapes];
