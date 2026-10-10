export interface paths {
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
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
