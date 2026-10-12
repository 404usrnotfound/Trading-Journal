export interface paths {
    "/api/v1/workspaces/{workspaceId}/strategies": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Workspace-scoped strategy and immutable version history. Lists are cursor-paginated, at most 100 entries per page. */
        get: {
            parameters: {
                query?: {
                    cursor?: components["schemas"]["FinancialId"];
                    limit?: string;
                    includeArchived?: "true" | "false";
                    status?: components["schemas"]["StrategyStatus"];
                    search?: string;
                };
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["StrategyListResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        /** @description Editor/owner strategy command. Definitions are complete immutable snapshots, bounded to 196608 UTF-8 bytes; JSON request bodies are bounded to 262144 bytes. Changes append a version and never rewrite historical trade references. Deletion archives the identity. Late trade classification is explicitly retrospective. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["StrategyCreate"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["StrategyResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/strategies/{strategyId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Workspace-scoped strategy and immutable version history. Lists are cursor-paginated, at most 100 entries per page. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    strategyId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["StrategyResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        /** @description Editor/owner strategy command. Definitions are complete immutable snapshots, bounded to 196608 UTF-8 bytes; JSON request bodies are bounded to 262144 bytes. Changes append a version and never rewrite historical trade references. Deletion archives the identity. Late trade classification is explicitly retrospective. */
        put: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    strategyId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["StrategyUpdate"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["StrategyResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        post?: never;
        /** @description Editor/owner strategy command. Definitions are complete immutable snapshots, bounded to 196608 UTF-8 bytes; JSON request bodies are bounded to 262144 bytes. Changes append a version and never rewrite historical trade references. Deletion archives the identity. Late trade classification is explicitly retrospective. */
        delete: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    strategyId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["StrategyArchive"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["StrategyResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/strategies/{strategyId}/versions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Workspace-scoped strategy and immutable version history. Lists are cursor-paginated, at most 100 entries per page. */
        get: {
            parameters: {
                query?: {
                    cursor?: components["schemas"]["FinancialId"];
                    limit?: string;
                };
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    strategyId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["StrategyVersionListResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/strategies/{strategyId}/versions/{versionId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Workspace-scoped strategy and immutable version history. Lists are cursor-paginated, at most 100 entries per page. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    strategyId: components["schemas"]["FinancialId"];
                    versionId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["StrategyVersionResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/strategies/{strategyId}/trades": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Workspace-scoped strategy and immutable version history. Lists are cursor-paginated, at most 100 entries per page. */
        get: {
            parameters: {
                query?: {
                    cursor?: components["schemas"]["FinancialId"];
                    limit?: string;
                };
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    strategyId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["StrategyTradesResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/strategies/{strategyId}/trade-links": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Editor/owner strategy command. Definitions are complete immutable snapshots, bounded to 196608 UTF-8 bytes; JSON request bodies are bounded to 262144 bytes. Changes append a version and never rewrite historical trade references. Deletion archives the identity. Late trade classification is explicitly retrospective. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    strategyId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["StrategyTradeLinkCreate"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["StrategyTradeLinkResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/strategy-attachments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    limit?: string;
                };
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["StrategyAttachmentListResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        /** @description Upload immutable workspace-owned PNG, JPEG, WebP or PDF content, at most 10485760 bytes. X-File-Name is URI-component encoded. Repeated identical Idempotency-Key returns the original metadata; different contents conflict. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                    "X-File-Name": string;
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "image/png": string;
                    "image/jpeg": string;
                    "image/webp": string;
                    "application/pdf": string;
                };
            };
            responses: {
                /** @description Validated application DTO */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["StrategyAttachmentResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/strategy-attachments/{attachmentId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Authenticated immutable attachment read. Images may be displayed inline; PDF files are always downloaded. Content is private, uncached, sandboxed and protected from MIME sniffing. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    attachmentId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Original uploaded content after workspace authorization. */
                200: {
                    headers: {
                        /** @description Safe inline image or attachment download filename. */
                        "Content-Disposition"?: string;
                        /** @description Sandboxed untrusted content. */
                        "Content-Security-Policy"?: string;
                        "X-Content-Type-Options"?: "nosniff";
                        "Cache-Control"?: "private, no-store";
                        [name: string]: unknown;
                    };
                    content: {
                        "image/png": string;
                        "image/jpeg": string;
                        "image/webp": string;
                        "application/pdf": string;
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        /** @description Delete only unreferenced attachment content. Any immutable strategy version, journal revision or published plan reference returns 409, including archived trades and strategies. */
        delete: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    attachmentId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Unreferenced attachment deleted. */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/journal-attachments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    limit?: string;
                };
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["StrategyAttachmentListResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        /** @description Upload immutable workspace-owned PNG, JPEG, WebP or PDF content, at most 10485760 bytes. X-File-Name is URI-component encoded. Repeated identical Idempotency-Key returns the original metadata; different contents conflict. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                    "X-File-Name": string;
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "image/png": string;
                    "image/jpeg": string;
                    "image/webp": string;
                    "application/pdf": string;
                };
            };
            responses: {
                /** @description Validated application DTO */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["StrategyAttachmentResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/journal-attachments/{attachmentId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Authenticated immutable attachment read. Images may be displayed inline; PDF files are always downloaded. Content is private, uncached, sandboxed and protected from MIME sniffing. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    attachmentId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Original uploaded content after workspace authorization. */
                200: {
                    headers: {
                        /** @description Safe inline image or attachment download filename. */
                        "Content-Disposition"?: string;
                        /** @description Sandboxed untrusted content. */
                        "Content-Security-Policy"?: string;
                        "X-Content-Type-Options"?: "nosniff";
                        "Cache-Control"?: "private, no-store";
                        [name: string]: unknown;
                    };
                    content: {
                        "image/png": string;
                        "image/jpeg": string;
                        "image/webp": string;
                        "application/pdf": string;
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        /** @description Delete only unreferenced attachment content. Any immutable strategy version, journal revision or published plan reference returns 409, including archived trades and strategies. */
        delete: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    attachmentId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Unreferenced attachment deleted. */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/journals": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Workspace-scoped trade journal. Detail is a coherent snapshot of immutable financial sources, historical strategy rules and manual journal entries. Financial information is calculated independently of manually reported observations. Lists are cursor-paginated, at most 100 entries per page. */
        get: {
            parameters: {
                query?: {
                    cursor?: components["schemas"]["FinancialId"];
                    limit?: string;
                    includeArchived?: "true" | "false";
                    status?: "planned" | "open" | "partially_closed" | "closed" | "canceled";
                    search?: string;
                };
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["JournalListResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        /** @description Editor/owner journal command with optimistic revision checks. Identical retries with the same Idempotency-Key return the committed command response; changed contents conflict. Complete journal documents are bounded to 131072 UTF-8 bytes and JSON requests to 262144 bytes. Saves append immutable revisions without changing ledger balances. Publication freezes the original server-timed plan and risk; later plans and separate risk additions never rewrite the historical R denominator. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["JournalCreate"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["JournalDetailResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/journals/{tradeId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Workspace-scoped trade journal. Detail is a coherent snapshot of immutable financial sources, historical strategy rules and manual journal entries. Financial information is calculated independently of manually reported observations. Lists are cursor-paginated, at most 100 entries per page. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    tradeId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["JournalDetailResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        /** @description Editor/owner journal command with optimistic revision checks. Identical retries with the same Idempotency-Key return the committed command response; changed contents conflict. Complete journal documents are bounded to 131072 UTF-8 bytes and JSON requests to 262144 bytes. Saves append immutable revisions without changing ledger balances. Publication freezes the original server-timed plan and risk; later plans and separate risk additions never rewrite the historical R denominator. */
        put: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    tradeId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["JournalSave"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["JournalEntryResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/journals/{tradeId}/plans": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Workspace-scoped trade journal. Detail is a coherent snapshot of immutable financial sources, historical strategy rules and manual journal entries. Financial information is calculated independently of manually reported observations. Lists are cursor-paginated, at most 100 entries per page. */
        get: {
            parameters: {
                query?: {
                    cursor?: components["schemas"]["FinancialId"];
                    limit?: string;
                };
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    tradeId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["JournalPlansResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        /** @description Editor/owner journal command with optimistic revision checks. Identical retries with the same Idempotency-Key return the committed command response; changed contents conflict. Complete journal documents are bounded to 131072 UTF-8 bytes and JSON requests to 262144 bytes. Saves append immutable revisions without changing ledger balances. Publication freezes the original server-timed plan and risk; later plans and separate risk additions never rewrite the historical R denominator. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    tradeId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["JournalPublishPlan"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["JournalPlanVersionResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/journals/{tradeId}/risk-additions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Workspace-scoped trade journal. Detail is a coherent snapshot of immutable financial sources, historical strategy rules and manual journal entries. Financial information is calculated independently of manually reported observations. Lists are cursor-paginated, at most 100 entries per page. */
        get: {
            parameters: {
                query?: {
                    cursor?: components["schemas"]["FinancialId"];
                    limit?: string;
                };
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    tradeId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["JournalRiskAdditionsResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        /** @description Editor/owner journal command with optimistic revision checks. Identical retries with the same Idempotency-Key return the committed command response; changed contents conflict. Complete journal documents are bounded to 131072 UTF-8 bytes and JSON requests to 262144 bytes. Saves append immutable revisions without changing ledger balances. Publication freezes the original server-timed plan and risk; later plans and separate risk additions never rewrite the historical R denominator. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    tradeId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["JournalRiskAddition"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["JournalRiskAdditionResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/journals/{tradeId}/revisions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Workspace-scoped trade journal. Detail is a coherent snapshot of immutable financial sources, historical strategy rules and manual journal entries. Financial information is calculated independently of manually reported observations. Lists are cursor-paginated, at most 100 entries per page. */
        get: {
            parameters: {
                query?: {
                    cursor?: components["schemas"]["FinancialId"];
                    limit?: string;
                };
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    tradeId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["JournalRevisionsResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/journals/{tradeId}/revisions/{revisionId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Workspace-scoped trade journal. Detail is a coherent snapshot of immutable financial sources, historical strategy rules and manual journal entries. Financial information is calculated independently of manually reported observations. Lists are cursor-paginated, at most 100 entries per page. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    tradeId: components["schemas"]["FinancialId"];
                    revisionId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["JournalRevisionResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/accounting/portfolios": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Workspace-scoped immutable portfolio definitions and owned-account cash transfer evidence. Lists are cursor-paginated, at most 100 entries per page. Transfer status can be read at an explicit economic boundary. */
        get: {
            parameters: {
                query?: {
                    cursor?: components["schemas"]["FinancialId"];
                    limit?: string;
                    includeArchived?: "true" | "false";
                };
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PortfolioListResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        /** @description Editor/owner accounting command with durable idempotency. Portfolio edits append complete immutable scope versions. Income records gross dividends or interest and optional withholding as a separate tax posting. Positive expense/tax amounts are charges and negative amounts are refunds. Cash transfers require distinct same-currency owned accounts; omitted receiptAt records departure and an evidenced monetary transit claim. A later receipt is a separate immutable command. Deposits and boundary transfers are capital flows, never trading profit. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CreatePortfolioRequest"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PortfolioMutationResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/accounting/portfolios/{portfolioId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Workspace-scoped immutable portfolio definitions and owned-account cash transfer evidence. Lists are cursor-paginated, at most 100 entries per page. Transfer status can be read at an explicit economic boundary. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    portfolioId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PortfolioResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        /** @description Editor/owner accounting command with durable idempotency. Portfolio edits append complete immutable scope versions. Income records gross dividends or interest and optional withholding as a separate tax posting. Positive expense/tax amounts are charges and negative amounts are refunds. Cash transfers require distinct same-currency owned accounts; omitted receiptAt records departure and an evidenced monetary transit claim. A later receipt is a separate immutable command. Deposits and boundary transfers are capital flows, never trading profit. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    portfolioId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["UpdatePortfolioRequest"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PortfolioMutationResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/accounting/portfolios/{portfolioId}/versions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Workspace-scoped immutable portfolio definitions and owned-account cash transfer evidence. Lists are cursor-paginated, at most 100 entries per page. Transfer status can be read at an explicit economic boundary. */
        get: {
            parameters: {
                query?: {
                    cursor?: components["schemas"]["FinancialId"];
                    limit?: string;
                };
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    portfolioId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PortfolioVersionListResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/accounting/transfers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Workspace-scoped immutable portfolio definitions and owned-account cash transfer evidence. Lists are cursor-paginated, at most 100 entries per page. Transfer status can be read at an explicit economic boundary. */
        get: {
            parameters: {
                query?: {
                    cursor?: components["schemas"]["FinancialId"];
                    limit?: string;
                    asOf?: components["schemas"]["FinancialInstant"];
                };
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CashTransferListResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        /** @description Editor/owner accounting command with durable idempotency. Portfolio edits append complete immutable scope versions. Income records gross dividends or interest and optional withholding as a separate tax posting. Positive expense/tax amounts are charges and negative amounts are refunds. Cash transfers require distinct same-currency owned accounts; omitted receiptAt records departure and an evidenced monetary transit claim. A later receipt is a separate immutable command. Deposits and boundary transfers are capital flows, never trading profit. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CreateCashTransferRequest"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AccountingMutationResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/accounting/portfolios/{portfolioId}/archive": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Editor/owner accounting command with durable idempotency. Portfolio edits append complete immutable scope versions. Income records gross dividends or interest and optional withholding as a separate tax posting. Positive expense/tax amounts are charges and negative amounts are refunds. Cash transfers require distinct same-currency owned accounts; omitted receiptAt records departure and an evidenced monetary transit claim. A later receipt is a separate immutable command. Deposits and boundary transfers are capital flows, never trading profit. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    portfolioId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["ArchivePortfolioRequest"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PortfolioMutationResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/accounting/income": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Editor/owner accounting command with durable idempotency. Portfolio edits append complete immutable scope versions. Income records gross dividends or interest and optional withholding as a separate tax posting. Positive expense/tax amounts are charges and negative amounts are refunds. Cash transfers require distinct same-currency owned accounts; omitted receiptAt records departure and an evidenced monetary transit claim. A later receipt is a separate immutable command. Deposits and boundary transfers are capital flows, never trading profit. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["RecordIncomeRequest"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AccountingMutationResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/accounting/taxes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Editor/owner accounting command with durable idempotency. Portfolio edits append complete immutable scope versions. Income records gross dividends or interest and optional withholding as a separate tax posting. Positive expense/tax amounts are charges and negative amounts are refunds. Cash transfers require distinct same-currency owned accounts; omitted receiptAt records departure and an evidenced monetary transit claim. A later receipt is a separate immutable command. Deposits and boundary transfers are capital flows, never trading profit. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["RecordTaxRequest"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AccountingMutationResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/accounting/expenses": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Editor/owner accounting command with durable idempotency. Portfolio edits append complete immutable scope versions. Income records gross dividends or interest and optional withholding as a separate tax posting. Positive expense/tax amounts are charges and negative amounts are refunds. Cash transfers require distinct same-currency owned accounts; omitted receiptAt records departure and an evidenced monetary transit claim. A later receipt is a separate immutable command. Deposits and boundary transfers are capital flows, never trading profit. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["RecordExpenseRequest"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AccountingMutationResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/accounting/transfers/{transferId}/receipt": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Editor/owner accounting command with durable idempotency. Portfolio edits append complete immutable scope versions. Income records gross dividends or interest and optional withholding as a separate tax posting. Positive expense/tax amounts are charges and negative amounts are refunds. Cash transfers require distinct same-currency owned accounts; omitted receiptAt records departure and an evidenced monetary transit claim. A later receipt is a separate immutable command. Deposits and boundary transfers are capital flows, never trading profit. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    transferId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["ReceiveCashTransferRequest"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AccountingMutationResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/accounting/reports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Read-only accounting report available to viewers. Select exactly one explicit account population or immutable portfolio version and a reporting currency. The period is (from,to], with complete opening and closing boundaries. Source revision, FX policy and price freshness/source priorities are explicit. Monetary amounts are lossless decimal strings. Missing evidence produces null totals with known subtotals and explanations; reconciliation variance is retained rather than relabeled as FX or profit. This POST performs no mutation and requires no mutation CSRF proof or idempotency key. */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["AccountingReportRequest"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AccountingReportResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/currencies/{id}/archive": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    id: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["ArchiveFinancial"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CatalogArchiveResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/brokers/{id}/archive": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    id: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["ArchiveFinancial"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CatalogArchiveResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/accounts/{id}/archive": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    id: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["ArchiveFinancial"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CatalogArchiveResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/instruments/{id}/archive": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    id: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["ArchiveFinancial"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CatalogArchiveResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/trades/{id}/archive": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    id: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["ArchiveFinancial"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CatalogArchiveResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/currencies": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    includeArchived?: "true" | "false";
                    limit?: number;
                };
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CurrencyResponse"][];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        /** @description Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CurrencyCreate"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CurrencyResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/brokers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    includeArchived?: "true" | "false";
                    limit?: number;
                };
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["BrokerResponse"][];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        /** @description Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["BrokerCreate"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["BrokerResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/accounts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    includeArchived?: "true" | "false";
                    limit?: number;
                    environment?: "live" | "paper";
                };
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AccountResponse"][];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        /** @description Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["AccountCreate"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AccountResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/instruments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    includeArchived?: "true" | "false";
                    limit?: number;
                };
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["InstrumentResponse"][];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        /** @description Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["InstrumentCreate"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["InstrumentResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    includeArchived?: "true" | "false";
                    limit?: number;
                };
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["OrderResponse"][];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        /** @description Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["OrderCreate"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["OrderResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/trades": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    includeArchived?: "true" | "false";
                    limit?: number;
                };
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["StrategyTradeLinkResponse"][];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        /** @description Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["TradeCreate"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["StrategyTradeLinkResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/trade-legs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["TradeLegCreate"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TradeLegResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/cash-buckets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CashBucketCreate"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CashBucketResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/cash-movements": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CashMovementCreate"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FinancialMutationResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/fees": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    accountId?: components["schemas"]["FinancialId"];
                };
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CurrencyAmountResponse"][];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        /** @description Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["FeeCreate"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FinancialMutationResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/fx-conversions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["FxConversionCreate"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FxConversionResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/bucket-movements": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["BucketMovementCreate"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FinancialMutationResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/executions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    accountId?: components["schemas"]["FinancialId"];
                    afterId?: components["schemas"]["FinancialId"];
                    includeSuperseded?: "true" | "false";
                    limit?: number;
                };
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ExecutionResponse"][];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        /** @description Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["ExecutionCreate"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ExecutionResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/opening-lots": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["OpeningLotCreate"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FinancialMutationResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/execution-corrections": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["ExecutionCorrection"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ExecutionResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/execution-allocations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["ExecutionAllocation"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AllocationMutationResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/fx-observations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["FxObservationCreate"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FinancialMutationResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/price-observations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["PriceObservationCreate"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FinancialMutationResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/account-valuations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    accountId?: components["schemas"]["FinancialId"];
                    asOf?: components["schemas"]["FinancialInstant"];
                    includeSuperseded?: "true" | "false";
                    limit?: number;
                };
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AccountValuationObservationResponse"][];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        /** @description Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["AccountValuationObservationCreate"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FinancialMutationResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/holding-transfers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["HoldingTransferCreate"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FinancialMutationResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/fee-attributions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["FeeAttributionCreate"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AllocationMutationResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/trades/{id}/closures": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    id: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["TradeClosureCreate"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TradeClosureResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/trades/{id}/cancellations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    id: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["ArchiveFinancial"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["StrategyTradeLinkResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/currencies/{id}/conventions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    id: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CurrencyConventionCreate"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CurrencyResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/accounts/{id}/settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    id: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["AccountSettingsCreate"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AccountResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/instruments/{id}/versions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    id: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["InstrumentVersionCreate"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["InstrumentResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/orders/{id}/amendments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings. */
        post: {
            parameters: {
                query?: never;
                header: {
                    Origin: string;
                    "X-CSRF-Token": string;
                    "Idempotency-Key": components["schemas"]["FinancialId"];
                };
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    id: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["OrderAmend"];
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["OrderResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/positions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    accountId?: components["schemas"]["FinancialId"];
                    instrumentId?: components["schemas"]["FinancialId"];
                };
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PositionResponse"][];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/cash-balances": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    accountId?: components["schemas"]["FinancialId"];
                    asOf?: components["schemas"]["FinancialInstant"];
                    sourceRevision?: components["schemas"]["FinancialSourceRevision"];
                };
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CashBalanceResponse"][];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/valuation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query: {
                    accountIds: string;
                    reportingCurrencyId: components["schemas"]["FinancialId"];
                    asOf: components["schemas"]["FinancialInstant"];
                    fxPolicyId: components["schemas"]["FinancialLabel"];
                    fxMaxAgeMilliseconds?: number | null;
                    fxSourcePriority: string;
                    priceMaxAgeMilliseconds?: number | null;
                    priceSourcePriority: string;
                };
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["FinancialValuationResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/currencies/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    id: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CurrencyResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/accounts/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    id: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AccountResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/instruments/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    id: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["InstrumentResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/orders/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    id: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["OrderResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/trades/{id}/legs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    id: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TradeLegResponse"][];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/trades/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                    id: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["StrategyTradeLinkResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}/financial/campaign-inventory": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    accountId?: components["schemas"]["FinancialId"];
                    instrumentId?: components["schemas"]["FinancialId"];
                    tradeId?: components["schemas"]["FinancialId"];
                };
                header?: never;
                path: {
                    workspaceId: components["schemas"]["FinancialId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CampaignInventoryResponse"];
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/health/live": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            status: "ok";
                            /** @enum {string} */
                            service: "web" | "worker";
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/health/ready": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            status: "ready";
                            /** @enum {string} */
                            database: "connected";
                            /** @enum {string} */
                            schema: "current";
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            user: {
                                id: string;
                                name: string;
                                /** Format: email */
                                email: string;
                            };
                            /** Format: date-time */
                            expiresAt: string;
                        } | null;
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            workspaces: {
                                /** Format: uuid */
                                id: string;
                                name: string;
                                /** @enum {string} */
                                role: "owner" | "editor" | "viewer";
                                isDemo: boolean;
                                timezone: string;
                                reportingCurrency: string | null;
                                revision: number;
                            }[];
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/workspaces/{workspaceId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    workspaceId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            id: string;
                            name: string;
                            /** @enum {string} */
                            role: "owner" | "editor" | "viewer";
                            isDemo: boolean;
                            timezone: string;
                            reportingCurrency: string | null;
                            revision: number;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch: {
            parameters: {
                query?: never;
                header: {
                    "X-CSRF-Token": string;
                };
                path: {
                    workspaceId: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        timezone?: string;
                        reportingCurrency?: string | null;
                        expectedRevision: number;
                    };
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            id: string;
                            name: string;
                            /** @enum {string} */
                            role: "owner" | "editor" | "viewer";
                            isDemo: boolean;
                            timezone: string;
                            reportingCurrency: string | null;
                            revision: number;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/api/auth/session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        /** @description Session-bound mutation proof, present only for authenticated sessions. */
                        "X-CSRF-Token"?: string;
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            user: {
                                id: string;
                                name: string;
                                /** Format: email */
                                email: string;
                            };
                            /** Format: date-time */
                            expiresAt: string;
                        } | null;
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description List safe session identifiers after authentication within the past five minutes. */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            sessions: {
                                id: string;
                                /** Format: date-time */
                                createdAt: string;
                                /** Format: date-time */
                                expiresAt: string;
                                current: boolean;
                            }[];
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/change-password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-CSRF-Token": string;
                };
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        currentPassword: string;
                        newPassword: string;
                    };
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {boolean} */
                            ok: true;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/revoke-session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-CSRF-Token": string;
                };
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        sessionId: string;
                    };
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {boolean} */
                            ok: true;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/sign-in/email": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** Format: email */
                        email: string;
                        password: string;
                    };
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {boolean} */
                            ok: true;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/sign-out": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header: {
                    "X-CSRF-Token": string;
                };
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": Record<string, never>;
                };
            };
            responses: {
                /** @description Validated application DTO */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {boolean} */
                            ok: true;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
                /** @description Safe problem details; no credentials or database diagnostics */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            requestId: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        HealthResponse: {
            /** @enum {string} */
            status: "ok";
            /** @enum {string} */
            service: "web" | "worker";
        };
        ReadyResponse: {
            /** @enum {string} */
            status: "ready";
            /** @enum {string} */
            database: "connected";
            /** @enum {string} */
            schema: "current";
        };
        SessionResponse: {
            user: {
                id: string;
                name: string;
                /** Format: email */
                email: string;
            };
            /** Format: date-time */
            expiresAt: string;
        } | null;
        WorkspaceResponse: {
            /** Format: uuid */
            id: string;
            name: string;
            /** @enum {string} */
            role: "owner" | "editor" | "viewer";
            isDemo: boolean;
            timezone: string;
            reportingCurrency: string | null;
            revision: number;
        };
        WorkspaceListResponse: {
            workspaces: {
                /** Format: uuid */
                id: string;
                name: string;
                /** @enum {string} */
                role: "owner" | "editor" | "viewer";
                isDemo: boolean;
                timezone: string;
                reportingCurrency: string | null;
                revision: number;
            }[];
        };
        WorkspacePreferencesUpdateInput: {
            timezone?: string;
            reportingCurrency?: string | null;
            expectedRevision: number;
        };
        SignInInput: {
            /** Format: email */
            email: string;
            password: string;
        };
        Problem: {
            type: string;
            title: string;
            status: number;
            detail: string;
            code: string;
            requestId: string;
        };
        AuthActionResponse: {
            /** @enum {boolean} */
            ok: true;
        };
        ChangePasswordInput: {
            currentPassword: string;
            newPassword: string;
        };
        RevokeSessionInput: {
            sessionId: string;
        };
        SafeSessionListResponse: {
            sessions: {
                id: string;
                /** Format: date-time */
                createdAt: string;
                /** Format: date-time */
                expiresAt: string;
                current: boolean;
            }[];
        };
        FinancialJson: string | number | boolean | null | (components["schemas"]["FinancialJson"] | null)[] | {
            [key: string]: components["schemas"]["FinancialJson"] | null;
        };
        FinancialLabel: string;
        FinancialPinnedRate: {
            observationId: components["schemas"]["FinancialId"];
            rate: components["schemas"]["PositiveFinancialDecimal"];
            baseCurrencyId?: components["schemas"]["FinancialId"];
            quoteCurrencyId?: components["schemas"]["FinancialId"];
        };
        /** Format: uuid */
        FinancialId: string;
        PositiveFinancialDecimal: string;
        FinancialSourceIdentity: {
            namespace: components["schemas"]["FinancialLabel"];
            id: components["schemas"]["FinancialLabel"];
        };
        FinancialInstrumentMetadata: {
            quantityUnit: components["schemas"]["FinancialLabel"];
            quoteCurrencyId: components["schemas"]["FinancialId"] & (string | null);
            settlementCurrencyId: components["schemas"]["FinancialId"] & (string | null);
            multiplier: components["schemas"]["PositiveFinancialDecimal"] & (string | null);
            quantityIncrement: components["schemas"]["PositiveFinancialDecimal"] & (string | null);
            priceIncrement: components["schemas"]["PositiveFinancialDecimal"] & (string | null);
            /** @enum {string} */
            capability: "native-linear" | "manual";
            effectiveAt: components["schemas"]["FinancialInstant"];
            metadata?: {
                [key: string]: components["schemas"]["FinancialJson"];
            };
        };
        /** Format: date-time */
        FinancialInstant: string;
        FinancialOrderLeg: {
            instrumentVersionId: components["schemas"]["FinancialId"];
            /** @enum {string} */
            side: "buy" | "sell";
            ratio: components["schemas"]["PositiveFinancialDecimal"];
        };
        InventoryScope: {
            workspaceId: string;
            accountId: string;
            instrumentId: string;
            instrumentVersionId: string;
            unitVersionId: string;
            settlementCurrencyId: string | null;
        };
        InventoryManifest: {
            kernelVersion: components["schemas"]["FinancialLabel"];
            instrumentModuleVersion: components["schemas"]["FinancialLabel"];
            lotPolicyVersion: components["schemas"]["FinancialLabel"];
            allocationPolicyVersion: components["schemas"]["FinancialLabel"];
            fxPolicyVersion: components["schemas"]["FinancialLabel"];
            roundingPolicyVersion: components["schemas"]["FinancialLabel"];
        };
        InventoryMetric: {
            /** @enum {string} */
            status: "available" | "unavailable" | "unsupported";
            value: components["schemas"]["FinancialDecimal"];
            currencyId?: string;
            reasons: string[];
        };
        FinancialDecimal: string | null;
        InventoryPinnedRate: {
            observationId: string;
            rate: components["schemas"]["FinancialDecimal"];
            baseCurrencyId?: string;
            quoteCurrencyId?: string;
        };
        InventoryCost: {
            id: string;
            currencyId: string;
            amount: components["schemas"]["FinancialDecimal"];
            chargedAt: string;
            nativeFx?: components["schemas"]["InventoryPinnedRate"];
            reportingFx?: components["schemas"]["InventoryPinnedRate"];
        };
        InventoryEconomicOrder: {
            instant: string | null;
            sequence: components["schemas"]["FinancialOrderingKey"];
        };
        FinancialOrderingKey: string | null;
        InventoryLot: {
            id: string;
            sourceId: string;
            effectId: string;
            /** @enum {string} */
            direction: "long" | "short";
            economicOrder: components["schemas"]["InventoryEconomicOrder"];
            originalQuantity: components["schemas"]["FinancialDecimal"];
            remainingQuantity: components["schemas"]["FinancialDecimal"];
            multiplier: components["schemas"]["FinancialDecimal"];
            entryPrice: components["schemas"]["FinancialDecimal"];
            remainingQuoteNotional: components["schemas"]["FinancialDecimal"];
            remainingPrincipal: components["schemas"]["FinancialDecimal"];
            signedGrossBasis: components["schemas"]["InventoryMetric"];
            costs: components["schemas"]["InventoryCost"][];
            costsComplete: boolean;
            basisReportingFx?: components["schemas"]["InventoryPinnedRate"];
            transferId?: string;
            parentLotId?: string;
        };
        InventoryMatch: {
            id: string;
            lotId: string;
            openingSourceId: string;
            closingSourceId: string;
            /** @enum {string} */
            direction: "long" | "short";
            economicOrder: components["schemas"]["InventoryEconomicOrder"];
            /** @enum {string} */
            policy: "fifo" | "specific" | "average";
            policyVersion: components["schemas"]["FinancialLabel"];
            quantity: components["schemas"]["FinancialDecimal"];
            multiplier: components["schemas"]["FinancialDecimal"];
            entryPrice: components["schemas"]["FinancialDecimal"];
            exitPrice: components["schemas"]["FinancialDecimal"];
            consumedPrincipal: components["schemas"]["FinancialDecimal"];
            exitPrincipal: components["schemas"]["FinancialDecimal"];
            consumedQuoteNotional: components["schemas"]["FinancialDecimal"];
            exitQuoteNotional: components["schemas"]["FinancialDecimal"];
            entryCosts: components["schemas"]["InventoryCost"][];
            exitCosts: components["schemas"]["InventoryCost"][];
            carryingCosts: components["schemas"]["InventoryCost"][];
            costsComplete: boolean;
            basisReportingFx?: components["schemas"]["InventoryPinnedRate"];
            exitReportingFx?: components["schemas"]["InventoryPinnedRate"];
            grossPnl: components["schemas"]["InventoryMetric"];
            netPnl: components["schemas"]["InventoryMetric"];
            quotePricePnl: components["schemas"]["InventoryMetric"];
            settlementRoundingPnl: components["schemas"]["InventoryMetric"];
        };
        FxSelectionPolicy: {
            id: components["schemas"]["FinancialLabel"];
            maxAgeMilliseconds: number;
            sourcePriority: components["schemas"]["FinancialLabel"][];
        };
        SelectedFxRate: {
            baseCurrencyId: components["schemas"]["FinancialId"];
            quoteCurrencyId: components["schemas"]["FinancialId"];
            rate: components["schemas"]["PositiveFinancialDecimal"];
            requestedAt: components["schemas"]["FinancialInstant"];
            observationIds: components["schemas"]["FinancialId"][];
            /** @enum {string} */
            route: "identity" | "direct" | "inverse" | "manual-direct" | "manual-inverse";
            policyId: components["schemas"]["FinancialLabel"];
            reviewedContextId?: components["schemas"]["FinancialLabel"];
        };
        FxRateSelection: {
            /** @enum {string} */
            state: "available";
            value: components["schemas"]["SelectedFxRate"];
        } | {
            /** @enum {string} */
            state: "unavailable";
            reasons: string[];
            missingReferences: string[];
        };
        FinancialNavManifest: {
            kernel: components["schemas"]["FinancialLabel"];
            ordinaryLinear: components["schemas"]["FinancialLabel"];
            lotMatching: components["schemas"]["FinancialLabel"];
            allocation: components["schemas"]["FinancialLabel"];
            fxSelection: components["schemas"]["FinancialLabel"];
            precision: components["schemas"]["FinancialLabel"];
            schema: components["schemas"]["FinancialLabel"];
        };
        FinancialNavComponent: {
            currencyId: components["schemas"]["FinancialId"];
            amount: components["schemas"]["FinancialDecimal"];
            id: components["schemas"]["FinancialId"];
        };
        FinancialNav: {
            asOf: components["schemas"]["FinancialInstant"];
            sourceRevision: components["schemas"]["FinancialSourceRevision"];
            manifest: components["schemas"]["FinancialNavManifest"];
            /** @enum {string} */
            state: "available";
            value: components["schemas"]["CurrencyAmountResponse"];
            components: components["schemas"]["FinancialNavComponent"][];
            roundingResidual: components["schemas"]["FinancialDecimal"];
        } | {
            asOf: components["schemas"]["FinancialInstant"];
            sourceRevision: components["schemas"]["FinancialSourceRevision"];
            manifest: components["schemas"]["FinancialNavManifest"];
            /** @enum {string} */
            state: "partial";
            availableSubtotal: components["schemas"]["CurrencyAmountResponse"];
            availableComponents: components["schemas"]["FinancialNavComponent"][];
            missingReferences: string[];
            reasons: string[];
        } | {
            asOf: components["schemas"]["FinancialInstant"];
            sourceRevision: components["schemas"]["FinancialSourceRevision"];
            manifest: components["schemas"]["FinancialNavManifest"];
            /** @enum {string} */
            state: "unavailable";
            missingReferences: string[];
            reasons: string[];
        };
        FinancialSourceRevision: string;
        CurrencyAmountResponse: {
            currencyId: components["schemas"]["FinancialId"];
            amount: components["schemas"]["FinancialDecimal"];
        };
        CampaignInventoryBridge: {
            /** @enum {string} */
            population: "account-versus-campaign-attribution";
            /** @enum {string} */
            ownership: "attribution-only";
            sourceRevision: components["schemas"]["FinancialSourceRevision"];
            accountSourceIds: string[];
            attributedSourceIds: string[];
            quantityDifference: components["schemas"]["InventoryMetric"];
            grossBasisDifference: components["schemas"]["InventoryMetric"];
            realizedGrossDifference: components["schemas"]["InventoryMetric"];
            basisAttributionDifference: components["schemas"]["InventoryMetric"];
            remainingCounterpart: components["schemas"]["InventoryMetric"];
            reconciliationResidual: components["schemas"]["InventoryMetric"];
            attributedLongQuantity: components["schemas"]["InventoryMetric"];
            attributedShortQuantity: components["schemas"]["InventoryMetric"];
            opposingClaims: boolean;
        };
        AccountCreate: {
            name: components["schemas"]["FinancialLabel"];
            brokerId?: components["schemas"]["FinancialId"];
            /** @enum {string} */
            environment: "live" | "paper";
            /** @enum {string} */
            accountType: "cash" | "margin" | "other";
            baseCurrencyId: components["schemas"]["FinancialId"];
            /** @enum {string} */
            inventoryMethod: "fifo" | "specific" | "average";
            allowShort: boolean;
            /** @enum {string} */
            holdingMode: "netted" | "segregated";
            effectiveAt: components["schemas"]["FinancialInstant"];
        };
        AccountResponse: {
            name: components["schemas"]["FinancialLabel"];
            brokerId: components["schemas"]["FinancialId"] & (string | null);
            /** @enum {string} */
            environment: "live" | "paper";
            /** @enum {string} */
            accountType: "cash" | "margin" | "other";
            baseCurrencyId: components["schemas"]["FinancialId"];
            /** @enum {string} */
            inventoryMethod: "fifo" | "specific" | "average";
            allowShort: boolean;
            /** @enum {string} */
            holdingMode: "netted" | "segregated";
            effectiveAt: components["schemas"]["FinancialInstant"];
            id: components["schemas"]["FinancialId"];
            revision: components["schemas"]["FinancialRevision"];
            archivedAt: components["schemas"]["FinancialInstant"] & (string | null);
            settingsId: components["schemas"]["FinancialId"];
            settingsVersion: components["schemas"]["FinancialRevision"];
            /** @enum {string} */
            status: "active" | "closed" | "historical";
        };
        FinancialRevision: number;
        AccountSettingsCreate: {
            baseCurrencyId: components["schemas"]["FinancialId"];
            /** @enum {string} */
            inventoryMethod: "fifo" | "specific" | "average";
            allowShort: boolean;
            /** @enum {string} */
            holdingMode: "netted" | "segregated";
            effectiveAt: components["schemas"]["FinancialInstant"];
            expectedRevision: components["schemas"]["FinancialRevision"];
            reason: components["schemas"]["FinancialLabel"];
        };
        AccountValuationObservationCreate: {
            accountId: components["schemas"]["FinancialId"];
            currencyId: components["schemas"]["FinancialId"];
            amount: components["schemas"]["FinancialDecimal"];
            observedAt: components["schemas"]["FinancialInstant"];
            definition: components["schemas"]["FinancialLabel"];
            source: components["schemas"]["FinancialLabel"];
            supersedesId?: components["schemas"]["FinancialId"];
            reason?: components["schemas"]["FinancialLabel"];
        };
        AccountValuationObservationResponse: {
            id: components["schemas"]["FinancialId"];
            accountId: components["schemas"]["FinancialId"];
            currencyId: components["schemas"]["FinancialId"];
            amount: components["schemas"]["FinancialDecimal"];
            observedAt: components["schemas"]["FinancialInstant"];
            definition: components["schemas"]["FinancialLabel"];
            source: components["schemas"]["FinancialLabel"];
            supersedesId: components["schemas"]["FinancialId"] & (string | null);
            payload: {
                [key: string]: components["schemas"]["FinancialJson"];
            };
            actorId: string;
            origin: components["schemas"]["FinancialLabel"];
            recordedAt: components["schemas"]["FinancialInstant"];
        };
        AllocationMutationResponse: {
            id: components["schemas"]["FinancialId"];
            commandId: components["schemas"]["FinancialId"];
            sourceRevision: components["schemas"]["FinancialSourceRevision"];
            version: components["schemas"]["FinancialRevision"];
        };
        ArchiveFinancial: {
            expectedRevision: components["schemas"]["FinancialRevision"];
            reason: components["schemas"]["FinancialLabel"];
        };
        BrokerCreate: {
            name: components["schemas"]["FinancialLabel"];
            sourceNamespace: components["schemas"]["FinancialLabel"];
        };
        BrokerResponse: {
            name: components["schemas"]["FinancialLabel"];
            sourceNamespace: components["schemas"]["FinancialLabel"];
            id: components["schemas"]["FinancialId"];
            revision: components["schemas"]["FinancialRevision"];
            archivedAt: components["schemas"]["FinancialInstant"] & (string | null);
        };
        BucketMovementCreate: {
            economicAt: components["schemas"]["FinancialInstant"];
            orderingKey: components["schemas"]["FinancialOrderingKey"];
            sourceBucketId: components["schemas"]["FinancialId"];
            destinationBucketId: components["schemas"]["FinancialId"];
            amount: components["schemas"]["PositiveFinancialDecimal"];
            /** @enum {string} */
            kind: "settlement" | "reclassification" | "internal-transfer";
            executionId?: components["schemas"]["FinancialId"];
        };
        CampaignInventoryResponse: {
            sourceRevision: components["schemas"]["FinancialSourceRevision"];
            populations: {
                tradeLegId: components["schemas"]["FinancialId"] & (string | null);
                accountId: components["schemas"]["FinancialId"];
                instrumentId: components["schemas"]["FinancialId"];
                inventory: components["schemas"]["InventoryResponse"];
                valuation?: components["schemas"]["InventoryValuationResponse"];
            }[];
            bridges: components["schemas"]["CampaignInventoryBridge"][];
        };
        InventoryResponse: {
            /** @enum {string} */
            population: "account-inventory" | "campaign-attribution";
            /** @enum {string} */
            status: "available" | "unavailable" | "unsupported";
            reasons: string[];
            scope: components["schemas"]["InventoryScope"];
            manifest: components["schemas"]["InventoryManifest"];
            sourceRevision: components["schemas"]["FinancialSourceRevision"];
            /** @enum {string} */
            policy: "fifo" | "average" | "specific";
            policyVersion: components["schemas"]["FinancialLabel"];
            effectiveSourceIds: string[];
            lots: components["schemas"]["InventoryLot"][];
            matches: components["schemas"]["InventoryMatch"][];
            originalCosts: components["schemas"]["InventoryCost"][];
            unassignedCosts: components["schemas"]["InventoryCost"][];
            transferredCosts: components["schemas"]["InventoryCost"][];
            openQuantity: components["schemas"]["InventoryMetric"];
            longQuantity: components["schemas"]["InventoryMetric"];
            shortQuantity: components["schemas"]["InventoryMetric"];
            averageEntryPrice: components["schemas"]["InventoryMetric"];
            grossBasis: components["schemas"]["InventoryMetric"];
            netBasis: components["schemas"]["InventoryMetric"];
            realizedGross: components["schemas"]["InventoryMetric"];
            realizedNet: components["schemas"]["InventoryMetric"];
        };
        InventoryValuationResponse: {
            scope: components["schemas"]["InventoryScope"];
            manifest: components["schemas"]["InventoryManifest"];
            sourceRevision: components["schemas"]["FinancialSourceRevision"];
            markId: string | null;
            observationIds: string[];
            markedValue: components["schemas"]["InventoryMetric"];
            unrealizedGross: components["schemas"]["InventoryMetric"];
            unrealizedNet: components["schemas"]["InventoryMetric"];
            reportingMarkedValue: components["schemas"]["InventoryMetric"];
            realizedReportingTradingGross: components["schemas"]["InventoryMetric"];
            realizedHoldingFx: components["schemas"]["InventoryMetric"];
            realizedReportingTradingNet: components["schemas"]["InventoryMetric"];
            realizedReportingNet: components["schemas"]["InventoryMetric"];
            unrealizedReportingTradingGross: components["schemas"]["InventoryMetric"];
            unrealizedHoldingFx: components["schemas"]["InventoryMetric"];
            unrealizedReportingTradingNet: components["schemas"]["InventoryMetric"];
            unrealizedReportingNet: components["schemas"]["InventoryMetric"];
        };
        CashBalanceResponse: {
            accountId: components["schemas"]["FinancialId"];
            currencyId: components["schemas"]["FinancialId"];
            cashBucketId: components["schemas"]["FinancialId"];
            kind: components["schemas"]["FinancialLabel"];
            amount: components["schemas"]["FinancialDecimal"];
        };
        CashBucketCreate: {
            accountId: components["schemas"]["FinancialId"];
            currencyId: components["schemas"]["FinancialId"];
            /** @enum {string} */
            kind: "settled" | "unsettled" | "restricted" | "collateral_cash";
            custodyKey?: components["schemas"]["FinancialLabel"];
        };
        CashBucketResponse: {
            id: components["schemas"]["FinancialId"];
            commandId: components["schemas"]["FinancialId"];
            sourceRevision: components["schemas"]["FinancialSourceRevision"];
            accountId: components["schemas"]["FinancialId"];
            currencyId: components["schemas"]["FinancialId"];
            /** @enum {string} */
            kind: "settled" | "unsettled" | "restricted" | "collateral_cash";
        };
        CashMovementCreate: {
            economicAt: components["schemas"]["FinancialInstant"];
            orderingKey: components["schemas"]["FinancialOrderingKey"];
            accountId: components["schemas"]["FinancialId"];
            cashBucketId: components["schemas"]["FinancialId"];
            currencyId: components["schemas"]["FinancialId"];
            amount: components["schemas"]["FinancialDecimal"];
            /** @enum {string} */
            kind: "deposit" | "withdrawal" | "opening" | "income" | "unresolved";
            sourceIdentity?: components["schemas"]["FinancialSourceIdentity"];
        };
        CatalogArchiveResponse: {
            id: components["schemas"]["FinancialId"];
            revision: components["schemas"]["FinancialRevision"];
            archivedAt: components["schemas"]["FinancialInstant"];
        };
        CurrencyConventionCreate: {
            displayScale: number;
            settlementIncrement: components["schemas"]["PositiveFinancialDecimal"];
            effectiveAt: components["schemas"]["FinancialInstant"];
            expectedRevision: components["schemas"]["FinancialRevision"];
            reason: components["schemas"]["FinancialLabel"];
        };
        CurrencyCreate: {
            namespace: components["schemas"]["FinancialLabel"];
            code: components["schemas"]["FinancialLabel"];
            /** @enum {string} */
            kind: "fiat" | "digital" | "custom";
            unitIdentity: components["schemas"]["FinancialLabel"];
            name: components["schemas"]["FinancialLabel"];
            displayScale: number;
            settlementIncrement: components["schemas"]["PositiveFinancialDecimal"];
            effectiveAt: components["schemas"]["FinancialInstant"];
        };
        CurrencyResponse: {
            namespace: components["schemas"]["FinancialLabel"];
            code: components["schemas"]["FinancialLabel"];
            /** @enum {string} */
            kind: "fiat" | "digital" | "custom";
            unitIdentity: components["schemas"]["FinancialLabel"];
            name: components["schemas"]["FinancialLabel"];
            displayScale: number;
            settlementIncrement: components["schemas"]["PositiveFinancialDecimal"];
            effectiveAt: components["schemas"]["FinancialInstant"];
            id: components["schemas"]["FinancialId"];
            revision: components["schemas"]["FinancialRevision"];
            archivedAt: components["schemas"]["FinancialInstant"] & (string | null);
            conventionId: components["schemas"]["FinancialId"];
            version: components["schemas"]["FinancialRevision"];
        };
        ExecutionAllocation: {
            executionId: components["schemas"]["FinancialId"];
            reason: components["schemas"]["FinancialLabel"];
            expectedVersion: components["schemas"]["FinancialRevision"];
            allocations: {
                tradeLegId: components["schemas"]["FinancialId"];
                quantity: components["schemas"]["PositiveFinancialDecimal"];
            }[];
        };
        ExecutionCorrection: {
            originalExecutionId: components["schemas"]["FinancialId"];
            reason: components["schemas"]["FinancialLabel"];
            replacement: components["schemas"]["ExecutionCreate"];
            replacementAllocations?: {
                tradeLegId: components["schemas"]["FinancialId"];
                quantity: components["schemas"]["PositiveFinancialDecimal"];
            }[];
        };
        ExecutionCreate: {
            economicAt: components["schemas"]["FinancialInstant"];
            orderingKey: components["schemas"]["FinancialOrderingKey"];
            accountId: components["schemas"]["FinancialId"];
            instrumentVersionId: components["schemas"]["FinancialId"];
            orderLegId?: components["schemas"]["FinancialId"];
            /** @enum {string} */
            side: "buy" | "sell";
            quantity: components["schemas"]["PositiveFinancialDecimal"];
            price: components["schemas"]["NonnegativeFinancialDecimal"];
            bookedPrincipal?: components["schemas"]["PositiveFinancialDecimal"];
            principalCurrencyId?: components["schemas"]["FinancialId"];
            cashBucketId?: components["schemas"]["FinancialId"];
            sourceIdentity?: components["schemas"]["FinancialSourceIdentity"];
            fees?: components["schemas"]["FeeComponent"][];
            closeOnly?: boolean;
            costsComplete?: boolean;
            specificLots?: {
                lotId: string;
                quantity: components["schemas"]["PositiveFinancialDecimal"];
            }[];
            basisReportingFx?: components["schemas"]["FinancialPinnedRate"];
            principalReview?: {
                reason: components["schemas"]["FinancialLabel"];
                source: components["schemas"]["FinancialLabel"];
            };
            manualCashEffects?: {
                cashBucketId: components["schemas"]["FinancialId"];
                currencyId: components["schemas"]["FinancialId"];
                amount: components["schemas"]["FinancialDecimal"];
            }[];
        };
        NonnegativeFinancialDecimal: string | null;
        FeeComponent: {
            cashBucketId: components["schemas"]["FinancialId"];
            currencyId: components["schemas"]["FinancialId"];
            amount: components["schemas"]["FinancialDecimal"];
            kind: components["schemas"]["FinancialLabel"];
            economicAt?: components["schemas"]["FinancialInstant"];
            nativeFx?: components["schemas"]["FinancialPinnedRate"];
            reportingFx?: components["schemas"]["FinancialPinnedRate"];
        };
        ExecutionResponse: {
            id: components["schemas"]["FinancialId"];
            commandId: components["schemas"]["FinancialId"];
            sourceRevision: components["schemas"]["FinancialSourceRevision"];
            accountId: components["schemas"]["FinancialId"];
            instrumentVersionId: components["schemas"]["FinancialId"];
            /** @enum {string} */
            side: "buy" | "sell";
            quantity: components["schemas"]["FinancialDecimal"];
            price: components["schemas"]["FinancialDecimal"];
            bookedPrincipal: components["schemas"]["FinancialDecimal"];
            principalCurrencyId: components["schemas"]["FinancialId"] & (string | null);
            economicAt: components["schemas"]["FinancialInstant"];
            orderingKey: components["schemas"]["FinancialOrderingKey"];
            supersedesId: components["schemas"]["FinancialId"] & (string | null);
            payload: {
                economicAt: components["schemas"]["FinancialInstant"];
                orderingKey: components["schemas"]["FinancialOrderingKey"];
                accountId: components["schemas"]["FinancialId"];
                instrumentVersionId: components["schemas"]["FinancialId"];
                orderLegId?: components["schemas"]["FinancialId"];
                /** @enum {string} */
                side: "buy" | "sell";
                quantity: components["schemas"]["PositiveFinancialDecimal"];
                price: components["schemas"]["NonnegativeFinancialDecimal"];
                bookedPrincipal?: components["schemas"]["PositiveFinancialDecimal"];
                principalCurrencyId?: components["schemas"]["FinancialId"];
                cashBucketId?: components["schemas"]["FinancialId"];
                sourceIdentity?: components["schemas"]["FinancialSourceIdentity"];
                fees?: components["schemas"]["FeeComponent"][];
                closeOnly?: boolean;
                costsComplete?: boolean;
                specificLots?: {
                    lotId: string;
                    quantity: components["schemas"]["PositiveFinancialDecimal"];
                }[];
                basisReportingFx?: components["schemas"]["FinancialPinnedRate"];
                principalReview?: {
                    reason: components["schemas"]["FinancialLabel"];
                    source: components["schemas"]["FinancialLabel"];
                };
                manualCashEffects?: {
                    cashBucketId: components["schemas"]["FinancialId"];
                    currencyId: components["schemas"]["FinancialId"];
                    amount: components["schemas"]["FinancialDecimal"];
                }[];
                sourceInput: components["schemas"]["ExecutionCreate"];
                booking?: {
                    [key: string]: components["schemas"]["FinancialJson"];
                };
                accountSettingsId?: components["schemas"]["FinancialId"];
                sourceFingerprint?: string;
            };
        };
        FeeAttributionCreate: {
            economicAt: components["schemas"]["FinancialInstant"];
            orderingKey: components["schemas"]["FinancialOrderingKey"];
            feeId: components["schemas"]["FinancialId"];
            instrumentVersionId: components["schemas"]["FinancialId"];
            reason: components["schemas"]["FinancialLabel"];
            expectedVersion: number;
            allocations: {
                /** @enum {string} */
                target: "lot" | "match" | "unassigned";
                targetId?: string;
                amount: components["schemas"]["FinancialDecimal"];
            }[];
        };
        FeeCreate: {
            cashBucketId: components["schemas"]["FinancialId"];
            currencyId: components["schemas"]["FinancialId"];
            amount: components["schemas"]["FinancialDecimal"];
            kind: components["schemas"]["FinancialLabel"];
            economicAt: components["schemas"]["FinancialInstant"];
            nativeFx?: components["schemas"]["FinancialPinnedRate"];
            reportingFx?: components["schemas"]["FinancialPinnedRate"];
            orderingKey: components["schemas"]["FinancialOrderingKey"];
            accountId: components["schemas"]["FinancialId"];
            executionId?: components["schemas"]["FinancialId"];
        };
        FinancialMutationResponse: {
            id: components["schemas"]["FinancialId"];
            commandId: components["schemas"]["FinancialId"];
            sourceRevision: components["schemas"]["FinancialSourceRevision"];
        };
        FinancialValuationResponse: {
            accountIds: components["schemas"]["FinancialId"][];
            /** @enum {string} */
            environment: "live" | "paper";
            reportingCurrencyId: components["schemas"]["FinancialId"];
            asOf: components["schemas"]["FinancialInstant"];
            sourceRevision: components["schemas"]["FinancialSourceRevision"];
            fxPolicy: components["schemas"]["FxSelectionPolicy"];
            pricePolicy: {
                maxAgeMilliseconds: number;
                sourcePriority: components["schemas"]["FinancialLabel"][];
            };
            positions: components["schemas"]["PositionResponse"][];
            nav: components["schemas"]["FinancialNav"];
            priceDependencies: {
                id: components["schemas"]["FinancialId"];
                price_raw: components["schemas"]["FinancialDecimal"];
                observed_at: components["schemas"]["FinancialInstant"];
                source: components["schemas"]["FinancialLabel"];
                instrumentVersionId: components["schemas"]["FinancialId"];
            }[];
            fxDependencies: {
                componentId: components["schemas"]["FinancialId"];
                selection: components["schemas"]["FxRateSelection"];
            }[];
        };
        PositionResponse: {
            id: components["schemas"]["FinancialId"];
            accountId: components["schemas"]["FinancialId"];
            instrumentId: components["schemas"]["FinancialId"];
            instrumentVersionId: components["schemas"]["FinancialId"];
            sourceRevision: components["schemas"]["FinancialSourceRevision"];
            inventory: components["schemas"]["InventoryResponse"];
            valuation?: components["schemas"]["InventoryValuationResponse"];
        };
        FxConversionCreate: {
            economicAt: components["schemas"]["FinancialInstant"];
            orderingKey: components["schemas"]["FinancialOrderingKey"];
            sourceBucketId: components["schemas"]["FinancialId"];
            destinationBucketId: components["schemas"]["FinancialId"];
            sourceAmount: components["schemas"]["PositiveFinancialDecimal"];
            destinationAmount: components["schemas"]["PositiveFinancialDecimal"];
            rate?: components["schemas"]["PositiveFinancialDecimal"];
            rateReview?: {
                reason: components["schemas"]["FinancialLabel"];
                source: components["schemas"]["FinancialLabel"];
            };
            fees?: components["schemas"]["FeeComponent"][];
        };
        FxConversionResponse: {
            id: components["schemas"]["FinancialId"];
            commandId: components["schemas"]["FinancialId"];
            sourceRevision: components["schemas"]["FinancialSourceRevision"];
            actualRate: components["schemas"]["FinancialDecimal"];
        };
        FxObservationCreate: {
            baseCurrencyId: components["schemas"]["FinancialId"];
            quoteCurrencyId: components["schemas"]["FinancialId"];
            rate: components["schemas"]["PositiveFinancialDecimal"];
            observedAt: components["schemas"]["FinancialInstant"];
            source: components["schemas"]["FinancialLabel"];
            supersedesId?: components["schemas"]["FinancialId"];
            reason?: components["schemas"]["FinancialLabel"];
        };
        HoldingTransferCreate: {
            economicAt: components["schemas"]["FinancialInstant"];
            orderingKey: components["schemas"]["FinancialOrderingKey"];
            sourceAccountId: components["schemas"]["FinancialId"];
            destinationAccountId: components["schemas"]["FinancialId"];
            instrumentVersionId: components["schemas"]["FinancialId"];
            reason: components["schemas"]["FinancialLabel"];
            selections: {
                lotId: string;
                quantity: components["schemas"]["PositiveFinancialDecimal"];
            }[];
        };
        InstrumentCreate: {
            name: components["schemas"]["FinancialLabel"];
            family: components["schemas"]["FinancialLabel"];
            subtype: components["schemas"]["FinancialLabel"];
            economicIdentity: components["schemas"]["FinancialLabel"];
            quantityUnit: components["schemas"]["FinancialLabel"];
            quoteCurrencyId: components["schemas"]["FinancialId"] & (string | null);
            settlementCurrencyId: components["schemas"]["FinancialId"] & (string | null);
            multiplier: components["schemas"]["PositiveFinancialDecimal"] & (string | null);
            quantityIncrement: components["schemas"]["PositiveFinancialDecimal"] & (string | null);
            priceIncrement: components["schemas"]["PositiveFinancialDecimal"] & (string | null);
            /** @enum {string} */
            capability: "native-linear" | "manual";
            effectiveAt: components["schemas"]["FinancialInstant"];
            metadata?: {
                [key: string]: components["schemas"]["FinancialJson"];
            };
        };
        InstrumentResponse: {
            name: components["schemas"]["FinancialLabel"];
            family: components["schemas"]["FinancialLabel"];
            subtype: components["schemas"]["FinancialLabel"];
            economicIdentity: components["schemas"]["FinancialLabel"];
            quantityUnit: components["schemas"]["FinancialLabel"];
            quoteCurrencyId: components["schemas"]["FinancialId"] & (string | null);
            settlementCurrencyId: components["schemas"]["FinancialId"] & (string | null);
            multiplier: components["schemas"]["PositiveFinancialDecimal"] & (string | null);
            quantityIncrement: components["schemas"]["PositiveFinancialDecimal"] & (string | null);
            priceIncrement: components["schemas"]["PositiveFinancialDecimal"] & (string | null);
            /** @enum {string} */
            capability: "native-linear" | "manual";
            effectiveAt: components["schemas"]["FinancialInstant"];
            metadata?: {
                [key: string]: components["schemas"]["FinancialJson"];
            };
            id: components["schemas"]["FinancialId"];
            revision: components["schemas"]["FinancialRevision"];
            archivedAt: components["schemas"]["FinancialInstant"] & (string | null);
            versionId: components["schemas"]["FinancialId"];
            version: components["schemas"]["FinancialRevision"];
        };
        InstrumentVersionCreate: {
            quantityUnit: components["schemas"]["FinancialLabel"];
            quoteCurrencyId: components["schemas"]["FinancialId"] & (string | null);
            settlementCurrencyId: components["schemas"]["FinancialId"] & (string | null);
            multiplier: components["schemas"]["PositiveFinancialDecimal"] & (string | null);
            quantityIncrement: components["schemas"]["PositiveFinancialDecimal"] & (string | null);
            priceIncrement: components["schemas"]["PositiveFinancialDecimal"] & (string | null);
            /** @enum {string} */
            capability: "native-linear" | "manual";
            effectiveAt: components["schemas"]["FinancialInstant"];
            metadata?: {
                [key: string]: components["schemas"]["FinancialJson"];
            };
            expectedRevision: components["schemas"]["FinancialRevision"];
            reason: components["schemas"]["FinancialLabel"];
        };
        OpeningLotCreate: {
            economicAt: components["schemas"]["FinancialInstant"];
            orderingKey: components["schemas"]["FinancialOrderingKey"];
            accountId: components["schemas"]["FinancialId"];
            instrumentVersionId: components["schemas"]["FinancialId"];
            /** @enum {string} */
            direction: "long" | "short";
            quantity: components["schemas"]["PositiveFinancialDecimal"];
            entryPrice?: components["schemas"]["PositiveFinancialDecimal"];
            bookedPrincipal?: components["schemas"]["PositiveFinancialDecimal"];
            reason: components["schemas"]["FinancialLabel"];
            costsComplete?: boolean;
            basisReportingFx?: components["schemas"]["FinancialPinnedRate"];
        };
        OrderAmend: {
            expectedRevision: components["schemas"]["FinancialRevision"];
            instruction: components["schemas"]["OrderInstruction"];
            economicAt: components["schemas"]["FinancialInstant"];
            reason: components["schemas"]["FinancialLabel"];
        };
        OrderInstruction: {
            /** @enum {string} */
            status: "recorded" | "working" | "partially_filled" | "filled" | "canceled" | "rejected" | "expired";
            quantity: components["schemas"]["PositiveFinancialDecimal"];
            /** @enum {string} */
            orderType: "market" | "limit" | "stop" | "stop_limit";
            limitPrice?: components["schemas"]["PositiveFinancialDecimal"];
            stopPrice?: components["schemas"]["PositiveFinancialDecimal"];
            timeInForce: components["schemas"]["FinancialLabel"];
        };
        OrderCreate: {
            accountId: components["schemas"]["FinancialId"];
            /** @enum {string} */
            kind: "single" | "package";
            sourceNamespace?: components["schemas"]["FinancialLabel"];
            sourceId?: components["schemas"]["FinancialLabel"];
            legs: components["schemas"]["FinancialOrderLeg"][];
            instruction: components["schemas"]["OrderInstruction"];
            economicAt: components["schemas"]["FinancialInstant"];
        };
        OrderResponse: {
            accountId: components["schemas"]["FinancialId"];
            /** @enum {string} */
            kind: "single" | "package";
            instruction: components["schemas"]["OrderInstruction"];
            economicAt: components["schemas"]["FinancialInstant"];
            id: components["schemas"]["FinancialId"];
            revision: components["schemas"]["FinancialRevision"];
            sourceNamespace: components["schemas"]["FinancialLabel"] & (string | null);
            sourceId: components["schemas"]["FinancialLabel"] & (string | null);
            /** @enum {string} */
            fillStatus: "unfilled" | "partially_filled" | "filled" | "overfilled";
            discrepancies: ("source-overfill" | "fill-after-terminal-intent")[];
            legs: {
                instrumentVersionId: components["schemas"]["FinancialId"];
                /** @enum {string} */
                side: "buy" | "sell";
                ratio: components["schemas"]["PositiveFinancialDecimal"];
                id: components["schemas"]["FinancialId"];
                intendedQuantity: components["schemas"]["FinancialDecimal"];
                filledQuantity: components["schemas"]["FinancialDecimal"];
                remainingQuantity: components["schemas"]["FinancialDecimal"];
                overfillQuantity: components["schemas"]["FinancialDecimal"];
                executionCount: number;
                lateFillCount: number;
            }[];
        };
        PriceObservationCreate: {
            instrumentVersionId: components["schemas"]["FinancialId"];
            currencyId: components["schemas"]["FinancialId"];
            price: components["schemas"]["NonnegativeFinancialDecimal"];
            observedAt: components["schemas"]["FinancialInstant"];
            source: components["schemas"]["FinancialLabel"];
            supersedesId?: components["schemas"]["FinancialId"];
            reason?: components["schemas"]["FinancialLabel"];
        };
        TradeClosureCreate: {
            expectedRevision: components["schemas"]["FinancialRevision"];
            reason: components["schemas"]["FinancialLabel"];
            obligationEvidence: components["schemas"]["FinancialLabel"];
        };
        TradeClosureResponse: {
            id: components["schemas"]["FinancialId"];
            tradeId: components["schemas"]["FinancialId"];
            sourceRevision: components["schemas"]["FinancialSourceRevision"];
            revision: components["schemas"]["FinancialRevision"];
            confirmedAt: components["schemas"]["FinancialInstant"];
            /** @enum {string} */
            definitionVersion: "campaign-closure/1";
            /** @enum {string} */
            status: "closed";
        };
        TradeCreate: {
            title: components["schemas"]["FinancialLabel"];
            /** @enum {string} */
            classification: "active-trading" | "investing";
            strategyVersionId?: components["schemas"]["FinancialId"];
        };
        TradeLegCreate: {
            tradeId: components["schemas"]["FinancialId"];
            expectedRevision: components["schemas"]["FinancialRevision"];
            accountId: components["schemas"]["FinancialId"];
            instrumentVersionId: components["schemas"]["FinancialId"];
            /** @enum {string} */
            direction: "long" | "short";
            label: components["schemas"]["FinancialLabel"];
        };
        TradeLegResponse: {
            tradeId: components["schemas"]["FinancialId"];
            accountId: components["schemas"]["FinancialId"];
            instrumentVersionId: components["schemas"]["FinancialId"];
            /** @enum {string} */
            direction: "long" | "short";
            label: components["schemas"]["FinancialLabel"];
            id: components["schemas"]["FinancialId"];
        };
        TradeResponse: {
            title: components["schemas"]["FinancialLabel"];
            /** @enum {string} */
            classification: "active-trading" | "investing";
            strategyVersionId: components["schemas"]["FinancialId"] | null;
            id: components["schemas"]["FinancialId"];
            revision: components["schemas"]["FinancialRevision"];
            archivedAt: components["schemas"]["FinancialInstant"] | null;
            strategyId: components["schemas"]["FinancialId"] | null;
            /** @enum {string|null} */
            strategyLinkTiming: "recorded-with-trade" | "retrospective" | null;
            /** @enum {string} */
            status: "planned" | "open" | "partially_closed" | "closed" | "canceled";
            closureReviewRequired: boolean;
        };
        StrategyLabel: string;
        StrategyNarrative: string;
        StrategyChangeReason: string;
        JournalLabel: string;
        JournalNarrative: string;
        JournalReason: string;
        JournalActor: string;
        JournalMetricUnit: string;
        AccountingMetric: {
            /** @enum {string} */
            state: "available" | "partial" | "unavailable";
            value: components["schemas"]["FinancialDecimal"] | null;
            knownSubtotal: components["schemas"]["FinancialDecimal"];
            currencyId: components["schemas"]["FinancialId"];
            reasons: string[];
            missingReferences: string[];
        };
        AccountingCurrencyMetric: {
            currencyId: components["schemas"]["FinancialId"];
            metric: components["schemas"]["AccountingMetric"];
        };
        AccountingSnapshot: {
            asOf: components["schemas"]["FinancialInstant"];
            cashByCurrency: {
                currencyId: components["schemas"]["FinancialId"];
                amount: components["schemas"]["FinancialDecimal"];
                reasons: string[];
            }[];
            cash: components["schemas"]["AccountingMetric"];
            holdings: components["schemas"]["AccountingMetric"];
            transit: components["schemas"]["AccountingMetric"];
            equity: components["schemas"]["AccountingMetric"];
            netLiquidationValue: components["schemas"]["AccountingMetric"];
            unrealizedGrossByCurrency: components["schemas"]["AccountingCurrencyMetric"][];
        };
        AccountingFxPolicy: {
            id: string;
            maxAgeMilliseconds: number;
            sourcePriority: string[];
        };
        AccountingPricePolicy: {
            maxAgeMilliseconds: number;
            sourcePriority: string[];
        };
        PortfolioVersion: {
            id: components["schemas"]["FinancialId"];
            portfolioId: components["schemas"]["FinancialId"];
            version: components["schemas"]["FinancialRevision"];
            name: string;
            description: string;
            /** @enum {string} */
            environment: "live" | "paper";
            accountIds: components["schemas"]["FinancialId"][];
            archived: boolean;
            reason: string;
            sourceRevision: components["schemas"]["FinancialSourceRevision"];
            commandId: components["schemas"]["FinancialId"];
            createdAt: components["schemas"]["FinancialInstant"];
        };
        CashTransferReceipt: {
            id: components["schemas"]["FinancialId"];
            commandId: components["schemas"]["FinancialId"];
            sourceRevision: components["schemas"]["FinancialSourceRevision"];
            economicAt: components["schemas"]["FinancialInstant"];
            orderingKey: components["schemas"]["FinancialOrderingKey"];
        };
        StrategyArchive: {
            expectedRevision: components["schemas"]["FinancialRevision"];
            reason: components["schemas"]["StrategyChangeReason"];
        };
        StrategyBooleanParameter: {
            id: components["schemas"]["FinancialId"];
            name: components["schemas"]["StrategyLabel"];
            description?: components["schemas"]["StrategyNarrative"];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "boolean";
            value: boolean;
        };
        StrategyChecklistItem: {
            id: components["schemas"]["FinancialId"];
            label: components["schemas"]["StrategyLabel"];
            /** @default false */
            required: boolean;
        };
        StrategyCreate: {
            definition: components["schemas"]["StrategyDefinition"];
            effectiveAt: components["schemas"]["FinancialInstant"];
            changeReason?: components["schemas"]["StrategyChangeReason"];
        };
        /** @description Complete immutable playbook snapshot, at most 196608 UTF-8 bytes after default normalization. Numeric parameters are lossless decimal strings; narrative rules remain manually assessed. */
        StrategyDefinition: {
            name: components["schemas"]["StrategyLabel"];
            description?: components["schemas"]["StrategyNarrative"];
            status?: components["schemas"]["StrategyStatus"];
            /** @default [] */
            assetClasses: components["schemas"]["StrategyLabel"][];
            /** @default [] */
            markets: components["schemas"]["StrategyLabel"][];
            /** @default [] */
            timeframes: components["schemas"]["StrategyLabel"][];
            direction?: components["schemas"]["StrategyDirection"];
            setupConditions?: components["schemas"]["StrategyNarrative"];
            entryRules?: components["schemas"]["StrategyNarrative"];
            confirmationRules?: components["schemas"]["StrategyNarrative"];
            invalidationRules?: components["schemas"]["StrategyNarrative"];
            stopLossMethodology?: components["schemas"]["StrategyNarrative"];
            takeProfitMethodology?: components["schemas"]["StrategyNarrative"];
            riskRules?: components["schemas"]["StrategyNarrative"];
            positionSizingRules?: components["schemas"]["StrategyNarrative"];
            exitRules?: components["schemas"]["StrategyNarrative"];
            /** @default [] */
            indicators: components["schemas"]["StrategyLabel"][];
            /** @default [] */
            attachmentIds: components["schemas"]["FinancialId"][];
            notes?: components["schemas"]["StrategyNarrative"];
            /** @default [] */
            tags: components["schemas"]["StrategyLabel"][];
            /** @default [] */
            checklist: components["schemas"]["StrategyChecklistItem"][];
            /** @default [] */
            setups: components["schemas"]["StrategySetup"][];
            /** @default [] */
            parameters: components["schemas"]["StrategyParameter"][];
            hypothesis?: components["schemas"]["StrategyNarrative"];
            /** @default  */
            style: string;
            /** @default [] */
            sessions: components["schemas"]["StrategyLabel"][];
            marketRegimeFilters?: components["schemas"]["StrategyNarrative"];
            scalingRules?: components["schemas"]["StrategyNarrative"];
            managementRules?: components["schemas"]["StrategyNarrative"];
            reviewSchedule?: components["schemas"]["StrategyNarrative"];
            /** @default [] */
            eligibleInstruments: components["schemas"]["FinancialId"][];
        };
        /**
         * @default draft
         * @enum {string}
         */
        StrategyStatus: "draft" | "active" | "paused" | "retired";
        /**
         * @default both
         * @enum {string}
         */
        StrategyDirection: "long" | "short" | "both";
        StrategySetup: {
            id: components["schemas"]["FinancialId"];
            name: components["schemas"]["StrategyLabel"];
            description?: components["schemas"]["StrategyNarrative"];
            conditions?: components["schemas"]["StrategyNarrative"];
            /** @default [] */
            checklistItemIds: components["schemas"]["FinancialId"][];
        };
        StrategyParameter: components["schemas"]["StrategyDecimalParameter"] | components["schemas"]["StrategyBooleanParameter"] | components["schemas"]["StrategyTextParameter"] | components["schemas"]["StrategyEnumParameter"];
        StrategyDecimalParameter: {
            id: components["schemas"]["FinancialId"];
            name: components["schemas"]["StrategyLabel"];
            description?: components["schemas"]["StrategyNarrative"];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "decimal";
            value: components["schemas"]["FinancialDecimal"];
            /** @default null */
            unit: components["schemas"]["StrategyLabel"] | null;
            /** @default null */
            minimum: components["schemas"]["FinancialDecimal"] | null;
            /** @default null */
            maximum: components["schemas"]["FinancialDecimal"] | null;
        };
        StrategyTextParameter: {
            id: components["schemas"]["FinancialId"];
            name: components["schemas"]["StrategyLabel"];
            description?: components["schemas"]["StrategyNarrative"];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "text";
            value: string;
        };
        StrategyEnumParameter: {
            id: components["schemas"]["FinancialId"];
            name: components["schemas"]["StrategyLabel"];
            description?: components["schemas"]["StrategyNarrative"];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "enum";
            value: components["schemas"]["StrategyLabel"];
            options: components["schemas"]["StrategyLabel"][];
        };
        StrategyListResponse: {
            strategies: components["schemas"]["StrategyResponse"][];
            nextCursor: components["schemas"]["FinancialId"] | null;
        };
        StrategyResponse: {
            id: components["schemas"]["FinancialId"];
            workspaceId: components["schemas"]["FinancialId"];
            revision: components["schemas"]["FinancialRevision"];
            currentVersionId: components["schemas"]["FinancialId"];
            currentVersion: components["schemas"]["StrategyVersionResponse"];
            archivedAt: components["schemas"]["FinancialInstant"] | null;
            archiveReason: components["schemas"]["StrategyChangeReason"] | null;
            createdAt: components["schemas"]["FinancialInstant"];
            updatedAt: components["schemas"]["FinancialInstant"];
        };
        StrategyVersionResponse: {
            id: components["schemas"]["FinancialId"];
            workspaceId: components["schemas"]["FinancialId"];
            strategyId: components["schemas"]["FinancialId"];
            version: components["schemas"]["FinancialRevision"];
            effectiveAt: components["schemas"]["FinancialInstant"];
            definition: components["schemas"]["StrategyDefinition"];
            definitionHash: string;
            changeReason: components["schemas"]["StrategyChangeReason"];
            actorId: string;
            createdAt: components["schemas"]["FinancialInstant"];
        };
        StrategyTradeLinkCreate: {
            tradeId: components["schemas"]["FinancialId"];
            versionId: components["schemas"]["FinancialId"];
            expectedTradeRevision: components["schemas"]["FinancialRevision"];
            reason: components["schemas"]["StrategyChangeReason"];
        };
        StrategyTradeLinkResponse: {
            title: components["schemas"]["FinancialLabel"];
            /** @enum {string} */
            classification: "active-trading" | "investing";
            strategyVersionId: components["schemas"]["FinancialId"] | null;
            id: components["schemas"]["FinancialId"];
            revision: components["schemas"]["FinancialRevision"];
            archivedAt: components["schemas"]["FinancialInstant"] | null;
            strategyId: components["schemas"]["FinancialId"] | null;
            /** @enum {string|null} */
            strategyLinkTiming: "recorded-with-trade" | "retrospective" | null;
            /** @enum {string} */
            status: "planned" | "open" | "partially_closed" | "closed" | "canceled";
            closureReviewRequired: boolean;
        };
        StrategyTradesResponse: {
            trades: components["schemas"]["StrategyTradeLinkResponse"][];
            nextCursor: components["schemas"]["FinancialId"] | null;
        };
        StrategyUpdate: {
            definition: components["schemas"]["StrategyDefinition"];
            effectiveAt: components["schemas"]["FinancialInstant"];
            expectedRevision: components["schemas"]["FinancialRevision"];
            changeReason: components["schemas"]["StrategyChangeReason"];
        };
        StrategyVersionListResponse: {
            versions: components["schemas"]["StrategyVersionResponse"][];
            nextCursor: components["schemas"]["FinancialId"] | null;
        };
        StrategyAttachmentListResponse: components["schemas"]["StrategyAttachmentResponse"][];
        StrategyAttachmentResponse: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            workspaceId: string;
            name: components["schemas"]["StrategyAttachmentName"];
            mediaType: components["schemas"]["StrategyAttachmentMediaType"];
            size: number;
            sha256: string;
            /** Format: date-time */
            createdAt: string;
        };
        StrategyAttachmentName: string;
        /** @enum {string} */
        StrategyAttachmentMediaType: "image/png" | "image/jpeg" | "image/webp" | "application/pdf";
        JournalActualObservation: {
            legId: components["schemas"]["FinancialId"];
            /** @default null */
            actualStop: components["schemas"]["PositiveFinancialDecimal"] | null;
            /** @default null */
            reportedEntry: components["schemas"]["PositiveFinancialDecimal"] | null;
            /** @default null */
            reportedExit: components["schemas"]["PositiveFinancialDecimal"] | null;
            notes?: components["schemas"]["JournalNarrative"];
        };
        /** @enum {string} */
        JournalAttachmentPhase: "before" | "during" | "after";
        JournalCalculatedMetric: {
            /** @enum {string} */
            status: "available" | "unavailable";
            value: components["schemas"]["FinancialDecimal"] | null;
            reasons: components["schemas"]["JournalReason"][];
            unit: components["schemas"]["JournalMetricUnit"];
            currencyId: components["schemas"]["FinancialId"] | null;
            /** @enum {string} */
            source: "calculated-ledger";
        };
        JournalCommitmentResponse: {
            originalPlanId: components["schemas"]["FinancialId"];
            committedAt: components["schemas"]["FinancialInstant"];
            financialSourceRevision: components["schemas"]["FinancialSourceRevision"];
            /** @enum {string} */
            timing: "pre-trade" | "retrospective";
            createdBy: components["schemas"]["JournalActor"];
        };
        JournalCreateLeg: {
            accountId: components["schemas"]["FinancialId"];
            instrumentVersionId: components["schemas"]["FinancialId"];
            /** @enum {string} */
            direction: "long" | "short";
            label: components["schemas"]["JournalLabel"];
        };
        JournalCreate: {
            title: components["schemas"]["JournalLabel"];
            /** @enum {string} */
            classification: "active-trading" | "investing";
            strategyVersionId?: components["schemas"]["FinancialId"];
            /** @default [] */
            legs: components["schemas"]["JournalCreateLeg"][];
        };
        JournalDetailResponse: {
            trade: components["schemas"]["StrategyTradeLinkResponse"];
            journal: components["schemas"]["JournalEntryResponse"];
            strategy: components["schemas"]["StrategyVersionResponse"] | null;
            originalPlan: components["schemas"]["JournalPlanVersionResponse"] | null;
            currentPlan: components["schemas"]["JournalPlanVersionResponse"] | null;
            commitment: components["schemas"]["JournalCommitmentResponse"] | null;
            financial: components["schemas"]["JournalFinancialSnapshot"];
            recentHistory: components["schemas"]["JournalRevisionSummary"][];
        };
        JournalEntryResponse: {
            tradeId: components["schemas"]["FinancialId"];
            revision: number;
            document: components["schemas"]["JournalDocument"];
            updatedAt: components["schemas"]["FinancialInstant"] | null;
            updatedBy: components["schemas"]["JournalActor"] | null;
        };
        JournalDocument: {
            plan?: components["schemas"]["JournalPlanDefinition"];
            review?: components["schemas"]["JournalReviewDefinition"];
        };
        /**
         * @default {
         *       "strategyVersionId": null,
         *       "setupId": null,
         *       "thesis": "",
         *       "marketConditions": "",
         *       "timeframe": "",
         *       "legs": [],
         *       "initialRisk": null,
         *       "attachmentIds": []
         *     }
         */
        JournalPlanDefinition: {
            /** @default null */
            strategyVersionId: components["schemas"]["FinancialId"] | null;
            /** @default null */
            setupId: components["schemas"]["FinancialId"] | null;
            thesis?: components["schemas"]["JournalNarrative"];
            marketConditions?: components["schemas"]["JournalNarrative"];
            /** @default  */
            timeframe: string;
            /** @default [] */
            legs: components["schemas"]["JournalPlanLeg"][];
            /** @default null */
            initialRisk: components["schemas"]["JournalInitialRisk"] | null;
            /** @default [] */
            attachmentIds: components["schemas"]["FinancialId"][];
        };
        JournalPlanLeg: {
            legId: components["schemas"]["FinancialId"];
            /** @default null */
            plannedEntry: components["schemas"]["PositiveFinancialDecimal"] | null;
            /** @default null */
            plannedStop: components["schemas"]["PositiveFinancialDecimal"] | null;
            /** @default [] */
            plannedTargets: components["schemas"]["PositiveFinancialDecimal"][];
            /** @default null */
            plannedQuantity: components["schemas"]["PositiveFinancialDecimal"] | null;
            /** @default null */
            estimatedCosts: components["schemas"]["NonnegativeFinancialDecimal"] | null;
        };
        JournalInitialRisk: {
            amount: components["schemas"]["PositiveFinancialDecimal"];
            currencyId: components["schemas"]["FinancialId"];
            method: components["schemas"]["JournalLabel"];
            methodNotes?: components["schemas"]["JournalNarrative"];
        };
        /**
         * @default {
         *       "marketConditions": "",
         *       "mistakes": [],
         *       "emotions": [],
         *       "confidence": null,
         *       "executionQuality": null,
         *       "lessonsLearned": "",
         *       "postTradeReview": "",
         *       "customNotes": "",
         *       "exitReason": "",
         *       "customTags": [],
         *       "actualObservations": [],
         *       "ruleAssessments": [],
         *       "attachments": []
         *     }
         */
        JournalReviewDefinition: {
            marketConditions?: components["schemas"]["JournalNarrative"];
            /** @default [] */
            mistakes: components["schemas"]["JournalLabel"][];
            /** @default [] */
            emotions: components["schemas"]["JournalLabel"][];
            /** @default null */
            confidence: number | null;
            /** @default null */
            executionQuality: ("excellent" | "good" | "mixed" | "poor") | null;
            lessonsLearned?: components["schemas"]["JournalNarrative"];
            postTradeReview?: components["schemas"]["JournalNarrative"];
            customNotes?: components["schemas"]["JournalNarrative"];
            exitReason?: components["schemas"]["JournalNarrative"];
            /** @default [] */
            customTags: components["schemas"]["JournalLabel"][];
            /** @default [] */
            actualObservations: components["schemas"]["JournalActualObservation"][];
            /** @default [] */
            ruleAssessments: components["schemas"]["JournalRuleAssessment"][];
            /** @default [] */
            attachments: components["schemas"]["JournalReviewAttachment"][];
        };
        JournalRuleAssessment: {
            checklistItemId: components["schemas"]["FinancialId"];
            /** @enum {string} */
            outcome: "passed" | "failed" | "unknown";
            evidence?: components["schemas"]["JournalNarrative"];
            /** @enum {string} */
            source: "manual";
        };
        JournalReviewAttachment: {
            attachmentId: components["schemas"]["FinancialId"];
            phase: components["schemas"]["JournalAttachmentPhase"];
        };
        JournalPlanVersionResponse: {
            id: components["schemas"]["FinancialId"];
            tradeId: components["schemas"]["FinancialId"];
            version: components["schemas"]["FinancialRevision"];
            definition: components["schemas"]["JournalPlanDefinition"];
            definitionHash: string;
            createdAt: components["schemas"]["FinancialInstant"];
            createdBy: components["schemas"]["JournalActor"];
            changeReason: components["schemas"]["JournalReason"];
        };
        JournalFinancialSnapshot: {
            sourceRevision: components["schemas"]["FinancialSourceRevision"];
            /** @enum {string} */
            definitionVersion: "trade-journal-financial/1";
            manifest: components["schemas"]["InventoryManifest"];
            legs: components["schemas"]["JournalFinancialLeg"][];
            timeline: components["schemas"]["JournalTimelineEvent"][];
            rMultiple: components["schemas"]["JournalRMultiple"];
        };
        JournalFinancialLeg: {
            legId: components["schemas"]["FinancialId"];
            accountId: components["schemas"]["FinancialId"];
            accountName: components["schemas"]["JournalLabel"];
            instrumentId: components["schemas"]["FinancialId"];
            instrumentVersionId: components["schemas"]["FinancialId"];
            instrumentName: components["schemas"]["JournalLabel"];
            quantityUnit: components["schemas"]["JournalLabel"];
            quoteCurrencyId: components["schemas"]["FinancialId"] | null;
            settlementCurrencyId: components["schemas"]["FinancialId"] | null;
            /** @enum {string} */
            direction: "long" | "short";
            actualEntry: components["schemas"]["JournalCalculatedMetric"];
            actualExit: components["schemas"]["JournalCalculatedMetric"];
            enteredQuantity: components["schemas"]["JournalCalculatedMetric"];
            exitedQuantity: components["schemas"]["JournalCalculatedMetric"];
            openQuantity: components["schemas"]["JournalCalculatedMetric"];
            realizedGross: components["schemas"]["JournalCalculatedMetric"];
            realizedNet: components["schemas"]["JournalCalculatedMetric"];
            costBasis: components["schemas"]["JournalCalculatedMetric"];
            fees: components["schemas"]["JournalFeeSummary"][];
            executions: components["schemas"]["JournalExecutionSummary"][];
            lots: components["schemas"]["InventoryLot"][];
            matches: components["schemas"]["InventoryMatch"][];
        };
        JournalFeeSummary: {
            feeId: components["schemas"]["FinancialId"];
            currencyId: components["schemas"]["FinancialId"];
            amount: components["schemas"]["FinancialDecimal"];
            chargedAt: components["schemas"]["FinancialInstant"];
            executionId: components["schemas"]["FinancialId"] | null;
        };
        JournalExecutionSummary: {
            executionId: components["schemas"]["FinancialId"];
            allocationId: components["schemas"]["FinancialId"];
            sourceRevision: components["schemas"]["FinancialSourceRevision"];
            economicAt: components["schemas"]["FinancialInstant"];
            /** @enum {string} */
            side: "buy" | "sell";
            /** @enum {string} */
            role: "entry" | "exit";
            quantity: components["schemas"]["PositiveFinancialDecimal"];
            price: components["schemas"]["FinancialDecimal"] | null;
            bookedPrincipal: components["schemas"]["FinancialDecimal"] | null;
            principalCurrencyId: components["schemas"]["FinancialId"] | null;
        };
        JournalTimelineEvent: {
            id: string;
            /** @enum {string} */
            kind: "execution" | "cash" | "fee";
            economicAt: components["schemas"]["FinancialInstant"];
            accountId: components["schemas"]["FinancialId"];
            legId: components["schemas"]["FinancialId"];
            executionId: components["schemas"]["FinancialId"] | null;
            feeId: components["schemas"]["FinancialId"] | null;
            currencyId: components["schemas"]["FinancialId"] | null;
            amount: components["schemas"]["FinancialDecimal"] | null;
            quantity: components["schemas"]["FinancialDecimal"] | null;
            price: components["schemas"]["FinancialDecimal"] | null;
            allocationId: components["schemas"]["FinancialId"] | null;
        };
        JournalRMultiple: {
            /** @enum {string} */
            status: "available" | "unavailable";
            value: components["schemas"]["FinancialDecimal"] | null;
            reasons: components["schemas"]["JournalReason"][];
            /** @enum {string} */
            unit: "R";
            currencyId: components["schemas"]["FinancialId"] | null;
            /** @enum {string} */
            source: "calculated-ledger";
            originalPlanId: components["schemas"]["FinancialId"] | null;
            /** @enum {string} */
            definitionVersion: "original-risk-r/1";
            financialSourceRevision: components["schemas"]["FinancialSourceRevision"];
        };
        JournalRevisionSummary: {
            id: components["schemas"]["FinancialId"];
            revision: components["schemas"]["FinancialRevision"];
            createdAt: components["schemas"]["FinancialInstant"];
            createdBy: components["schemas"]["JournalActor"];
            changeReason: components["schemas"]["JournalReason"];
        };
        JournalListResponse: {
            trades: components["schemas"]["StrategyTradeLinkResponse"][];
            nextCursor: components["schemas"]["FinancialId"] | null;
        };
        JournalPlansResponse: {
            plans: components["schemas"]["JournalPlanVersionResponse"][];
            nextCursor: components["schemas"]["FinancialId"] | null;
        };
        JournalPublishPlan: {
            expectedRevision: number;
            expectedTradeRevision: components["schemas"]["FinancialRevision"];
            reason: components["schemas"]["JournalReason"];
        };
        JournalRevisionResponse: {
            id: components["schemas"]["FinancialId"];
            revision: components["schemas"]["FinancialRevision"];
            createdAt: components["schemas"]["FinancialInstant"];
            createdBy: components["schemas"]["JournalActor"];
            changeReason: components["schemas"]["JournalReason"];
            tradeId: components["schemas"]["FinancialId"];
            document: components["schemas"]["JournalDocument"];
            documentHash: string;
        };
        JournalRevisionsResponse: {
            revisions: components["schemas"]["JournalRevisionResponse"][];
            nextCursor: components["schemas"]["FinancialId"] | null;
        };
        JournalRiskAdditionResponse: {
            id: components["schemas"]["FinancialId"];
            tradeId: components["schemas"]["FinancialId"];
            amount: components["schemas"]["PositiveFinancialDecimal"];
            currencyId: components["schemas"]["FinancialId"];
            method: components["schemas"]["JournalLabel"];
            methodNotes: components["schemas"]["JournalNarrative"];
            reason: components["schemas"]["JournalReason"];
            createdAt: components["schemas"]["FinancialInstant"];
            createdBy: components["schemas"]["JournalActor"];
        };
        JournalRiskAddition: {
            expectedRevision: number;
            amount: components["schemas"]["PositiveFinancialDecimal"];
            currencyId: components["schemas"]["FinancialId"];
            method: components["schemas"]["JournalLabel"];
            methodNotes?: components["schemas"]["JournalNarrative"];
            reason: components["schemas"]["JournalReason"];
        };
        JournalRiskAdditionsResponse: {
            riskAdditions: components["schemas"]["JournalRiskAdditionResponse"][];
            nextCursor: components["schemas"]["FinancialId"] | null;
        };
        JournalSave: {
            expectedRevision: number;
            document: components["schemas"]["JournalDocument"];
        };
        AccountingMutationResponse: {
            id: components["schemas"]["FinancialId"];
            commandId: components["schemas"]["FinancialId"];
            sourceRevision: components["schemas"]["FinancialSourceRevision"];
        };
        AccountingReportRequest: {
            accountIds?: components["schemas"]["FinancialId"][];
            portfolioVersionId?: components["schemas"]["FinancialId"];
            reportingCurrencyId: components["schemas"]["FinancialId"];
            from: components["schemas"]["FinancialInstant"];
            to: components["schemas"]["FinancialInstant"];
            sourceRevision?: components["schemas"]["FinancialSourceRevision"];
            fxPolicy: components["schemas"]["AccountingFxPolicy"];
            priceMaxAgeMilliseconds: number;
            priceSourcePriority: string[];
        };
        AccountingReportResponse: {
            context: {
                accountIds: components["schemas"]["FinancialId"][];
                portfolioVersionId?: components["schemas"]["FinancialId"];
                portfolioId: components["schemas"]["FinancialId"] | null;
                portfolioVersion: components["schemas"]["FinancialRevision"] | null;
                /** @enum {string} */
                environment: "live" | "paper";
                reportingCurrencyId: components["schemas"]["FinancialId"];
                sourceRevision: components["schemas"]["FinancialSourceRevision"];
                from: components["schemas"]["FinancialInstant"];
                to: components["schemas"]["FinancialInstant"];
                fxPolicy: components["schemas"]["AccountingFxPolicy"];
                pricePolicy: components["schemas"]["AccountingPricePolicy"];
                manifest: components["schemas"]["FinancialNavManifest"];
                /** @enum {string} */
                accountingVersion: "portfolio-accounting-v1";
            };
            opening: components["schemas"]["AccountingSnapshot"];
            closing: components["schemas"]["AccountingSnapshot"];
            breakdown: {
                realizedTradingPnl: components["schemas"]["AccountingMetric"];
                unrealizedTradingPnlChange: components["schemas"]["AccountingMetric"];
                tradingPnl: components["schemas"]["AccountingMetric"];
                holdingFx: components["schemas"]["AccountingMetric"];
                cashFx: components["schemas"]["AccountingMetric"];
                transitFx: components["schemas"]["AccountingMetric"];
                conversionEffects: components["schemas"]["AccountingMetric"];
                income: components["schemas"]["AccountingMetric"];
                fees: components["schemas"]["AccountingMetric"];
                expenses: components["schemas"]["AccountingMetric"];
                taxes: components["schemas"]["AccountingMetric"];
                externalCashFlows: components["schemas"]["AccountingMetric"];
                boundaryTransfers: components["schemas"]["AccountingMetric"];
                openingAdjustments: components["schemas"]["AccountingMetric"];
            };
            native: {
                realizedGross: components["schemas"]["AccountingCurrencyMetric"][];
                unrealizedGross: components["schemas"]["AccountingCurrencyMetric"][];
            };
            reconciliation: {
                navChange: components["schemas"]["AccountingMetric"];
                netCapitalFlows: components["schemas"]["AccountingMetric"];
                performance: components["schemas"]["AccountingMetric"];
                explainedChange: components["schemas"]["AccountingMetric"];
                variance: components["schemas"]["AccountingMetric"];
                roundingResidual: components["schemas"]["AccountingMetric"];
            };
            dependencies: {
                fx: {
                    componentId: string;
                    selection: components["schemas"]["FxRateSelection"];
                }[];
                prices: {
                    componentId: string;
                    observationId: components["schemas"]["FinancialId"];
                    observedAt: components["schemas"]["FinancialInstant"];
                }[];
                sourceIds: string[];
            };
        };
        ArchivePortfolioRequest: {
            expectedVersion: components["schemas"]["FinancialRevision"];
            reason: string;
        };
        CashTransferListResponse: {
            items: components["schemas"]["CashTransferResponse"][];
            nextCursor: components["schemas"]["FinancialId"] | null;
        };
        CashTransferResponse: {
            id: components["schemas"]["FinancialId"];
            commandId: components["schemas"]["FinancialId"];
            sourceRevision: components["schemas"]["FinancialSourceRevision"];
            sourceAccountId: components["schemas"]["FinancialId"];
            destinationAccountId: components["schemas"]["FinancialId"];
            sourceBucketId: components["schemas"]["FinancialId"];
            destinationBucketId: components["schemas"]["FinancialId"];
            currencyId: components["schemas"]["FinancialId"];
            amount: components["schemas"]["PositiveFinancialDecimal"];
            economicAt: components["schemas"]["FinancialInstant"];
            orderingKey: components["schemas"]["FinancialOrderingKey"];
            description: string;
            /** @enum {string} */
            status: "pending" | "received";
            receipt: components["schemas"]["CashTransferReceiptResponse"] | null;
        };
        CashTransferReceiptResponse: {
            id: components["schemas"]["FinancialId"];
            commandId: components["schemas"]["FinancialId"];
            sourceRevision: components["schemas"]["FinancialSourceRevision"];
            economicAt: components["schemas"]["FinancialInstant"];
            orderingKey: components["schemas"]["FinancialOrderingKey"];
        };
        CreateCashTransferRequest: {
            economicAt: components["schemas"]["FinancialInstant"];
            orderingKey: components["schemas"]["FinancialOrderingKey"];
            sourceBucketId: components["schemas"]["FinancialId"];
            destinationBucketId: components["schemas"]["FinancialId"];
            amount: components["schemas"]["PositiveFinancialDecimal"];
            description: string;
            receiptAt?: components["schemas"]["FinancialInstant"];
        };
        CreatePortfolioRequest: {
            name: string;
            /** @default  */
            description: string;
            /** @enum {string} */
            environment: "live" | "paper";
            accountIds: components["schemas"]["FinancialId"][];
        };
        PortfolioListResponse: {
            items: components["schemas"]["PortfolioResponse"][];
            nextCursor: components["schemas"]["FinancialId"] | null;
        };
        PortfolioResponse: {
            id: components["schemas"]["FinancialId"];
            workspaceId: components["schemas"]["FinancialId"];
            createdAt: components["schemas"]["FinancialInstant"];
            currentVersion: components["schemas"]["PortfolioVersionResponse"];
        };
        PortfolioVersionResponse: {
            id: components["schemas"]["FinancialId"];
            portfolioId: components["schemas"]["FinancialId"];
            version: components["schemas"]["FinancialRevision"];
            name: string;
            description: string;
            /** @enum {string} */
            environment: "live" | "paper";
            accountIds: components["schemas"]["FinancialId"][];
            archived: boolean;
            reason: string;
            sourceRevision: components["schemas"]["FinancialSourceRevision"];
            commandId: components["schemas"]["FinancialId"];
            createdAt: components["schemas"]["FinancialInstant"];
        };
        PortfolioMutationResponse: {
            id: components["schemas"]["FinancialId"];
            commandId: components["schemas"]["FinancialId"];
            sourceRevision: components["schemas"]["FinancialSourceRevision"];
            versionId: components["schemas"]["FinancialId"];
            version: components["schemas"]["FinancialRevision"];
        };
        PortfolioVersionListResponse: {
            items: components["schemas"]["PortfolioVersionResponse"][];
            nextCursor: components["schemas"]["FinancialId"] | null;
        };
        ReceiveCashTransferRequest: {
            economicAt: components["schemas"]["FinancialInstant"];
            orderingKey: components["schemas"]["FinancialOrderingKey"];
        };
        RecordExpenseRequest: {
            economicAt: components["schemas"]["FinancialInstant"];
            orderingKey: components["schemas"]["FinancialOrderingKey"];
            accountId: components["schemas"]["FinancialId"];
            cashBucketId: components["schemas"]["FinancialId"];
            currencyId: components["schemas"]["FinancialId"];
            amount: components["schemas"]["FinancialDecimal"];
            /** @enum {string} */
            kind: "financing" | "interest" | "other";
            description: string;
        };
        RecordIncomeRequest: {
            economicAt: components["schemas"]["FinancialInstant"];
            orderingKey: components["schemas"]["FinancialOrderingKey"];
            accountId: components["schemas"]["FinancialId"];
            cashBucketId: components["schemas"]["FinancialId"];
            currencyId: components["schemas"]["FinancialId"];
            /** @enum {string} */
            kind: "dividend" | "interest";
            amount: components["schemas"]["PositiveFinancialDecimal"];
            withholding?: components["schemas"]["NonnegativeFinancialDecimal"];
            description?: string;
        };
        RecordTaxRequest: {
            economicAt: components["schemas"]["FinancialInstant"];
            orderingKey: components["schemas"]["FinancialOrderingKey"];
            accountId: components["schemas"]["FinancialId"];
            cashBucketId: components["schemas"]["FinancialId"];
            currencyId: components["schemas"]["FinancialId"];
            amount: components["schemas"]["FinancialDecimal"];
            description: string;
            relatedIncomeId?: components["schemas"]["FinancialId"];
        };
        UpdatePortfolioRequest: {
            name: string;
            /** @default  */
            description: string;
            /** @enum {string} */
            environment: "live" | "paper";
            accountIds: components["schemas"]["FinancialId"][];
            expectedVersion: components["schemas"]["FinancialRevision"];
            reason: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
