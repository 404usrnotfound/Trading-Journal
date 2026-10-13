import { importSchema } from './import-schema.js';
import { platformSchema } from './platform-schema.js';
import { financialSchema } from './financial-schema.js';
import { strategySchema } from './strategy-schema.js';
import { journalSchema } from './journal-schema.js';
import { accountingSchema } from './accounting-schema.js';

export * from './platform-schema.js';
export * from './financial-schema.js';
export * from './strategy-schema.js';
export * from './journal-schema.js';
export * from './accounting-schema.js';

export const databaseSchema = {
  ...platformSchema,
  ...financialSchema,
  ...strategySchema,
  ...journalSchema,
  ...accountingSchema,
  ...importSchema,
};

export * from './import-schema.js';
