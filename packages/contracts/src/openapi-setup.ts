import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Extend constructors before the generator imports and instantiates public schemas.
extendZodWithOpenApi(z);
