import { platformSchema } from './platform-schema.js';
import { financialSchema } from './financial-schema.js';

export * from './platform-schema.js';
export * from './financial-schema.js';

export const databaseSchema = { ...platformSchema, ...financialSchema };
