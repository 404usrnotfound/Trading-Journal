import { portabilitySchema } from './portability-schema.js';
import { periodReviewSchema } from './period-review-schema.js';
import { outboxTables } from './outbox-schema.js';
import { suppliedComponents } from './supplied-schema.js';
import { riskSchema } from './risk-schema.js';
import { reconciliationSchema } from './reconciliation-schema.js';
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
  suppliedComponents,
  ...outboxTables,
  ...periodReviewSchema,
  ...portabilitySchema,
  ...riskSchema,
  ...reconciliationSchema,
  ...platformSchema,
  ...financialSchema,
  ...strategySchema,
  ...journalSchema,
  ...accountingSchema,
  ...importSchema,
};

export * from './import-schema.js';

export * from './reconciliation-schema.js';

export * from './risk-schema.js';

export * from './portability-schema.js';

export * from './period-review-schema.js';

export * from './outbox-schema.js';

export * from './supplied-schema.js';
