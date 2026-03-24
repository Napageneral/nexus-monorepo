export type paths = {
    "/api/apps": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** apps.list HTTP alias */
        get: operations["apps.list.alias.api.apps"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/apps/install": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** apps.install HTTP alias */
        post: operations["apps.install.alias.api.apps.install"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/apps/uninstall": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** apps.uninstall HTTP alias */
        post: operations["apps.uninstall.alias.api.apps.uninstall"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** auth.login HTTP alias */
        post: operations["auth.login.alias.api.auth.login"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/events/subscribe": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** events.subscribe HTTP alias */
        get: operations["events.subscribe.alias.api.events.subscribe"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/operator/packages/install": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** operator.packages.install HTTP alias */
        post: operations["operator.packages.install.alias.api.operator.packages.install"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/operator/packages/uninstall": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** operator.packages.uninstall HTTP alias */
        post: operations["operator.packages.uninstall.alias.api.operator.packages.uninstall"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/operator/packages/upgrade": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** operator.packages.upgrade HTTP alias */
        post: operations["operator.packages.upgrade.alias.api.operator.packages.upgrade"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** runtime.health HTTP alias */
        get: operations["runtime.health.alias.health"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/acl.approval.request": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** acl.approval.request */
        post: operations["acl.approval.request"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/acl.audit.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** acl.audit.get */
        post: operations["acl.audit.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/acl.audit.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** acl.audit.list */
        post: operations["acl.audit.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/acl.audit.stats": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** acl.audit.stats */
        post: operations["acl.audit.stats"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/acl.evaluate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** acl.evaluate */
        post: operations["acl.evaluate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/acl.policies.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** acl.policies.create */
        post: operations["acl.policies.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/acl.policies.delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** acl.policies.delete */
        post: operations["acl.policies.delete"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/acl.policies.disable": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** acl.policies.disable */
        post: operations["acl.policies.disable"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/acl.policies.enable": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** acl.policies.enable */
        post: operations["acl.policies.enable"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/acl.policies.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** acl.policies.get */
        post: operations["acl.policies.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/acl.policies.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** acl.policies.list */
        post: operations["acl.policies.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/acl.policies.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** acl.policies.update */
        post: operations["acl.policies.update"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/acl.requests.approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** acl.requests.approve */
        post: operations["acl.requests.approve"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/acl.requests.deny": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** acl.requests.deny */
        post: operations["acl.requests.deny"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/acl.requests.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** acl.requests.list */
        post: operations["acl.requests.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/acl.requests.show": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** acl.requests.show */
        post: operations["acl.requests.show"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/adapter.connections.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** adapter.connections.list */
        post: operations["adapter.connections.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/adapter.health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** adapter.health */
        post: operations["adapter.health"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/adapter.info": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** adapter.info */
        post: operations["adapter.info"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/adapter.monitor.start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** adapter.monitor.start */
        post: operations["adapter.monitor.start"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/adapter.monitor.stop": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** adapter.monitor.stop */
        post: operations["adapter.monitor.stop"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/adapter.serve.start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** adapter.serve.start */
        post: operations["adapter.serve.start"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/adapter.setup.cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** adapter.setup.cancel */
        post: operations["adapter.setup.cancel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/adapter.setup.start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** adapter.setup.start */
        post: operations["adapter.setup.start"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/adapter.setup.status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** adapter.setup.status */
        post: operations["adapter.setup.status"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/adapter.setup.submit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** adapter.setup.submit */
        post: operations["adapter.setup.submit"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/adapters.connections.backfill": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** adapters.connections.backfill */
        post: operations["adapters.connections.backfill"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/adapters.connections.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** adapters.connections.create */
        post: operations["adapters.connections.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/adapters.connections.credentials.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** adapters.connections.credentials.get */
        post: operations["adapters.connections.credentials.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/adapters.connections.custom.cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** adapters.connections.custom.cancel */
        post: operations["adapters.connections.custom.cancel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/adapters.connections.custom.start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** adapters.connections.custom.start */
        post: operations["adapters.connections.custom.start"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/adapters.connections.custom.status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** adapters.connections.custom.status */
        post: operations["adapters.connections.custom.status"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/adapters.connections.custom.submit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** adapters.connections.custom.submit */
        post: operations["adapters.connections.custom.submit"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/adapters.connections.disconnect": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** adapters.connections.disconnect */
        post: operations["adapters.connections.disconnect"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/adapters.connections.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** adapters.connections.get */
        post: operations["adapters.connections.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/adapters.connections.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** adapters.connections.list */
        post: operations["adapters.connections.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/adapters.connections.oauth.complete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** adapters.connections.oauth.complete */
        post: operations["adapters.connections.oauth.complete"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/adapters.connections.oauth.start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** adapters.connections.oauth.start */
        post: operations["adapters.connections.oauth.start"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/adapters.connections.status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** adapters.connections.status */
        post: operations["adapters.connections.status"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/adapters.connections.test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** adapters.connections.test */
        post: operations["adapters.connections.test"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/adapters.connections.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** adapters.connections.update */
        post: operations["adapters.connections.update"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/adapters.connections.upload": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** adapters.connections.upload */
        post: operations["adapters.connections.upload"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/adapters.methods": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** adapters.methods */
        post: operations["adapters.methods"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/agents.conversations.abort": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** agents.conversations.abort */
        post: operations["agents.conversations.abort"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/agents.conversations.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** agents.conversations.get */
        post: operations["agents.conversations.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/agents.conversations.history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** agents.conversations.history */
        post: operations["agents.conversations.history"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/agents.conversations.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** agents.conversations.list */
        post: operations["agents.conversations.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/agents.conversations.search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** agents.conversations.search */
        post: operations["agents.conversations.search"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/agents.conversations.send": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** agents.conversations.send */
        post: operations["agents.conversations.send"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/agents.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** agents.create */
        post: operations["agents.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/agents.delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** agents.delete */
        post: operations["agents.delete"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/agents.files.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** agents.files.get */
        post: operations["agents.files.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/agents.files.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** agents.files.list */
        post: operations["agents.files.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/agents.files.set": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** agents.files.set */
        post: operations["agents.files.set"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/agents.identity.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** agents.identity.get */
        post: operations["agents.identity.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/agents.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** agents.list */
        post: operations["agents.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/agents.sessions.archive": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** agents.sessions.archive */
        post: operations["agents.sessions.archive"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/agents.sessions.compact": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** agents.sessions.compact */
        post: operations["agents.sessions.compact"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/agents.sessions.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** agents.sessions.create */
        post: operations["agents.sessions.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/agents.sessions.fork": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** agents.sessions.fork */
        post: operations["agents.sessions.fork"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/agents.sessions.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** agents.sessions.get */
        post: operations["agents.sessions.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/agents.sessions.history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** agents.sessions.history */
        post: operations["agents.sessions.history"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/agents.sessions.import.chunk": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** agents.sessions.import.chunk */
        post: operations["agents.sessions.import.chunk"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/agents.sessions.import.execute": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** agents.sessions.import.execute */
        post: operations["agents.sessions.import.execute"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/agents.sessions.imports.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** agents.sessions.imports.list */
        post: operations["agents.sessions.imports.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/agents.sessions.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** agents.sessions.list */
        post: operations["agents.sessions.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/agents.sessions.patch": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** agents.sessions.patch */
        post: operations["agents.sessions.patch"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/agents.sessions.preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** agents.sessions.preview */
        post: operations["agents.sessions.preview"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/agents.sessions.reset": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** agents.sessions.reset */
        post: operations["agents.sessions.reset"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/agents.sessions.resolve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** agents.sessions.resolve */
        post: operations["agents.sessions.resolve"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/agents.sessions.send": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** agents.sessions.send */
        post: operations["agents.sessions.send"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/agents.sessions.transfer": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** agents.sessions.transfer */
        post: operations["agents.sessions.transfer"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/agents.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** agents.update */
        post: operations["agents.update"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/agents.wait": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** agents.wait */
        post: operations["agents.wait"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/apps.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** apps.get */
        post: operations["apps.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/apps.install": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** apps.install */
        post: operations["apps.install"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/apps.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** apps.list */
        post: operations["apps.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/apps.logs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** apps.logs */
        post: operations["apps.logs"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/apps.methods": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** apps.methods */
        post: operations["apps.methods"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/apps.start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** apps.start */
        post: operations["apps.start"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/apps.status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** apps.status */
        post: operations["apps.status"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/apps.stop": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** apps.stop */
        post: operations["apps.stop"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/apps.uninstall": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** apps.uninstall */
        post: operations["apps.uninstall"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/auth.login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** auth.login */
        post: operations["auth.login"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/auth.tokens.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** auth.tokens.create */
        post: operations["auth.tokens.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/auth.tokens.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** auth.tokens.list */
        post: operations["auth.tokens.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/auth.tokens.revoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** auth.tokens.revoke */
        post: operations["auth.tokens.revoke"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/auth.tokens.rotate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** auth.tokens.rotate */
        post: operations["auth.tokens.rotate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/auth.users.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** auth.users.create */
        post: operations["auth.users.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/auth.users.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** auth.users.list */
        post: operations["auth.users.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/auth.users.setPassword": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** auth.users.setPassword */
        post: operations["auth.users.setPassword"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/browser.request": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** browser.request */
        post: operations["browser.request"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/channels.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** channels.create */
        post: operations["channels.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/channels.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** channels.get */
        post: operations["channels.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/channels.history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** channels.history */
        post: operations["channels.history"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/channels.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** channels.list */
        post: operations["channels.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/channels.participants.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** channels.participants.get */
        post: operations["channels.participants.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/channels.participants.history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** channels.participants.history */
        post: operations["channels.participants.history"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/channels.participants.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** channels.participants.list */
        post: operations["channels.participants.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/channels.resolve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** channels.resolve */
        post: operations["channels.resolve"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/channels.search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** channels.search */
        post: operations["channels.search"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/channels.status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** channels.status */
        post: operations["channels.status"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/channels.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** channels.update */
        post: operations["channels.update"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/config.apply": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** config.apply */
        post: operations["config.apply"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/config.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** config.get */
        post: operations["config.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/config.patch": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** config.patch */
        post: operations["config.patch"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/config.schema": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** config.schema */
        post: operations["config.schema"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/config.set": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** config.set */
        post: operations["config.set"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/contacts.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** contacts.create */
        post: operations["contacts.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/contacts.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** contacts.get */
        post: operations["contacts.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/contacts.history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** contacts.history */
        post: operations["contacts.history"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/contacts.import": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** contacts.import */
        post: operations["contacts.import"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/contacts.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** contacts.list */
        post: operations["contacts.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/contacts.search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** contacts.search */
        post: operations["contacts.search"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/contacts.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** contacts.update */
        post: operations["contacts.update"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/credentials.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** credentials.create */
        post: operations["credentials.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/credentials.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** credentials.get */
        post: operations["credentials.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/credentials.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** credentials.list */
        post: operations["credentials.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/credentials.resolve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** credentials.resolve */
        post: operations["credentials.resolve"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/credentials.revoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** credentials.revoke */
        post: operations["credentials.revoke"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/credentials.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** credentials.update */
        post: operations["credentials.update"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/credentials.vault.retrieve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** credentials.vault.retrieve */
        post: operations["credentials.vault.retrieve"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/credentials.vault.store": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** credentials.vault.store */
        post: operations["credentials.vault.store"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/dags.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** dags.create */
        post: operations["dags.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/dags.delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** dags.delete */
        post: operations["dags.delete"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/dags.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** dags.get */
        post: operations["dags.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/dags.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** dags.list */
        post: operations["dags.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/dags.runs.cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** dags.runs.cancel */
        post: operations["dags.runs.cancel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/dags.runs.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** dags.runs.get */
        post: operations["dags.runs.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/dags.runs.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** dags.runs.list */
        post: operations["dags.runs.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/dags.runs.pause": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** dags.runs.pause */
        post: operations["dags.runs.pause"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/dags.runs.resume": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** dags.runs.resume */
        post: operations["dags.runs.resume"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/dags.runs.start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** dags.runs.start */
        post: operations["dags.runs.start"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/dags.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** dags.update */
        post: operations["dags.update"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/entities.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** entities.create */
        post: operations["entities.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/entities.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** entities.get */
        post: operations["entities.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/entities.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** entities.list */
        post: operations["entities.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/entities.merge.apply": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** entities.merge.apply */
        post: operations["entities.merge.apply"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/entities.merge.candidates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** entities.merge.candidates */
        post: operations["entities.merge.candidates"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/entities.merge.propose": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** entities.merge.propose */
        post: operations["entities.merge.propose"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/entities.merge.resolve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** entities.merge.resolve */
        post: operations["entities.merge.resolve"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/entities.resolve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** entities.resolve */
        post: operations["entities.resolve"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/entities.tags.add": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** entities.tags.add */
        post: operations["entities.tags.add"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/entities.tags.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** entities.tags.list */
        post: operations["entities.tags.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/entities.tags.remove": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** entities.tags.remove */
        post: operations["entities.tags.remove"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/entities.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** entities.update */
        post: operations["entities.update"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/events.publish": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** events.publish */
        post: operations["events.publish"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/events.subscribe": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** events.subscribe */
        post: operations["events.subscribe"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/events.subscriptions.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** events.subscriptions.create */
        post: operations["events.subscriptions.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/events.subscriptions.delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** events.subscriptions.delete */
        post: operations["events.subscriptions.delete"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/events.subscriptions.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** events.subscriptions.get */
        post: operations["events.subscriptions.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/events.subscriptions.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** events.subscriptions.list */
        post: operations["events.subscriptions.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/events.subscriptions.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** events.subscriptions.update */
        post: operations["events.subscriptions.update"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/events.unsubscribe": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** events.unsubscribe */
        post: operations["events.unsubscribe"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/groups.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** groups.create */
        post: operations["groups.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/groups.delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** groups.delete */
        post: operations["groups.delete"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/groups.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** groups.get */
        post: operations["groups.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/groups.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** groups.list */
        post: operations["groups.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/groups.members.add": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** groups.members.add */
        post: operations["groups.members.add"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/groups.members.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** groups.members.list */
        post: operations["groups.members.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/groups.members.remove": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** groups.members.remove */
        post: operations["groups.members.remove"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/groups.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** groups.update */
        post: operations["groups.update"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/jobs.cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** jobs.cancel */
        post: operations["jobs.cancel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/jobs.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** jobs.create */
        post: operations["jobs.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/jobs.delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** jobs.delete */
        post: operations["jobs.delete"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/jobs.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** jobs.get */
        post: operations["jobs.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/jobs.idempotency.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** jobs.idempotency.list */
        post: operations["jobs.idempotency.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/jobs.invoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** jobs.invoke */
        post: operations["jobs.invoke"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/jobs.lanes.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** jobs.lanes.list */
        post: operations["jobs.lanes.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/jobs.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** jobs.list */
        post: operations["jobs.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/jobs.queue.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** jobs.queue.get */
        post: operations["jobs.queue.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/jobs.queue.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** jobs.queue.list */
        post: operations["jobs.queue.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/jobs.requeue": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** jobs.requeue */
        post: operations["jobs.requeue"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/jobs.retry": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** jobs.retry */
        post: operations["jobs.retry"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/jobs.runs.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** jobs.runs.get */
        post: operations["jobs.runs.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/jobs.runs.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** jobs.runs.list */
        post: operations["jobs.runs.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/jobs.status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** jobs.status */
        post: operations["jobs.status"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/jobs.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** jobs.update */
        post: operations["jobs.update"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/logs.tail": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** logs.tail */
        post: operations["logs.tail"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.elements.consolidate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.elements.consolidate */
        post: operations["memory.elements.consolidate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.elements.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.elements.create */
        post: operations["memory.elements.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.elements.definitions.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.elements.definitions.create */
        post: operations["memory.elements.definitions.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.elements.definitions.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.elements.definitions.get */
        post: operations["memory.elements.definitions.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.elements.definitions.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.elements.definitions.list */
        post: operations["memory.elements.definitions.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.elements.entities.link": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.elements.entities.link */
        post: operations["memory.elements.entities.link"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.elements.entities.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.elements.entities.list */
        post: operations["memory.elements.entities.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.elements.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.elements.get */
        post: operations["memory.elements.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.elements.links.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.elements.links.create */
        post: operations["memory.elements.links.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.elements.links.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.elements.links.list */
        post: operations["memory.elements.links.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.elements.links.traverse": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.elements.links.traverse */
        post: operations["memory.elements.links.traverse"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.elements.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.elements.list */
        post: operations["memory.elements.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.elements.resolve_head": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.elements.resolve_head */
        post: operations["memory.elements.resolve_head"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.elements.search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.elements.search */
        post: operations["memory.elements.search"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.elements.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.elements.update */
        post: operations["memory.elements.update"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.entities.confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.entities.confirm */
        post: operations["memory.entities.confirm"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.entities.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.entities.create */
        post: operations["memory.entities.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.entities.propose_merge": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.entities.propose_merge */
        post: operations["memory.entities.propose_merge"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.recall": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.recall */
        post: operations["memory.recall"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.review.entity.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.review.entity.get */
        post: operations["memory.review.entity.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.review.episode.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.review.episode.get */
        post: operations["memory.review.episode.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.review.episode.outputs.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.review.episode.outputs.get */
        post: operations["memory.review.episode.outputs.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.review.fact.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.review.fact.get */
        post: operations["memory.review.fact.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.review.observation.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.review.observation.get */
        post: operations["memory.review.observation.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.review.quality.items.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.review.quality.items.list */
        post: operations["memory.review.quality.items.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.review.quality.summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.review.quality.summary */
        post: operations["memory.review.quality.summary"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.review.run.episodes.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.review.run.episodes.list */
        post: operations["memory.review.run.episodes.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.review.run.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.review.run.get */
        post: operations["memory.review.run.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.review.runs.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.review.runs.list */
        post: operations["memory.review.runs.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.review.search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.review.search */
        post: operations["memory.review.search"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.sets.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.sets.create */
        post: operations["memory.sets.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.sets.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.sets.get */
        post: operations["memory.sets.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.sets.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.sets.list */
        post: operations["memory.sets.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.sets.members.add": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.sets.members.add */
        post: operations["memory.sets.members.add"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/memory.sets.members.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** memory.sets.members.list */
        post: operations["memory.sets.members.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/models.catalog.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** models.catalog.get */
        post: operations["models.catalog.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/models.catalog.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** models.catalog.list */
        post: operations["models.catalog.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/models.configs.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** models.configs.create */
        post: operations["models.configs.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/models.configs.delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** models.configs.delete */
        post: operations["models.configs.delete"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/models.configs.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** models.configs.get */
        post: operations["models.configs.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/models.configs.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** models.configs.list */
        post: operations["models.configs.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/models.configs.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** models.configs.update */
        post: operations["models.configs.update"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/models.connections.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** models.connections.create */
        post: operations["models.connections.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/models.connections.disconnect": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** models.connections.disconnect */
        post: operations["models.connections.disconnect"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/models.connections.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** models.connections.get */
        post: operations["models.connections.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/models.connections.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** models.connections.list */
        post: operations["models.connections.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/models.connections.status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** models.connections.status */
        post: operations["models.connections.status"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/models.connections.test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** models.connections.test */
        post: operations["models.connections.test"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/models.connections.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** models.connections.update */
        post: operations["models.connections.update"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/models.defaults.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** models.defaults.get */
        post: operations["models.defaults.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/models.defaults.put": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** models.defaults.put */
        post: operations["models.defaults.put"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/models.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** models.get */
        post: operations["models.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/models.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** models.list */
        post: operations["models.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/models.providers.delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** models.providers.delete */
        post: operations["models.providers.delete"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/models.providers.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** models.providers.get */
        post: operations["models.providers.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/models.providers.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** models.providers.list */
        post: operations["models.providers.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/models.providers.put": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** models.providers.put */
        post: operations["models.providers.put"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/models.providers.test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** models.providers.test */
        post: operations["models.providers.test"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/operator.packages.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** operator.packages.get */
        post: operations["operator.packages.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/operator.packages.health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** operator.packages.health */
        post: operations["operator.packages.health"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/operator.packages.install": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** operator.packages.install */
        post: operations["operator.packages.install"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/operator.packages.uninstall": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** operator.packages.uninstall */
        post: operations["operator.packages.uninstall"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/operator.packages.upgrade": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** operator.packages.upgrade */
        post: operations["operator.packages.upgrade"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/orientation.contracts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** orientation.contracts */
        post: operations["orientation.contracts"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/orientation.inventory": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** orientation.inventory */
        post: operations["orientation.inventory"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/orientation.schemas": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** orientation.schemas */
        post: operations["orientation.schemas"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/orientation.summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** orientation.summary */
        post: operations["orientation.summary"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/orientation.taxonomy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** orientation.taxonomy */
        post: operations["orientation.taxonomy"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/productControlPlane.call": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** productControlPlane.call */
        post: operations["productControlPlane.call"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/record.ingest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** record.ingest */
        post: operations["record.ingest"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/records.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** records.get */
        post: operations["records.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/records.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** records.list */
        post: operations["records.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/records.search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** records.search */
        post: operations["records.search"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/roles.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** roles.create */
        post: operations["roles.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/roles.delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** roles.delete */
        post: operations["roles.delete"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/roles.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** roles.get */
        post: operations["roles.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/roles.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** roles.list */
        post: operations["roles.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/roles.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** roles.update */
        post: operations["roles.update"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/runtime.health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** runtime.health */
        post: operations["runtime.health"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/sandboxes.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** sandboxes.create */
        post: operations["sandboxes.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/sandboxes.destroy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** sandboxes.destroy */
        post: operations["sandboxes.destroy"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/sandboxes.exec": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** sandboxes.exec */
        post: operations["sandboxes.exec"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/sandboxes.fork": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** sandboxes.fork */
        post: operations["sandboxes.fork"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/sandboxes.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** sandboxes.get */
        post: operations["sandboxes.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/sandboxes.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** sandboxes.list */
        post: operations["sandboxes.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/sandboxes.resume": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** sandboxes.resume */
        post: operations["sandboxes.resume"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/sandboxes.retain": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** sandboxes.retain */
        post: operations["sandboxes.retain"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/schedules.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** schedules.create */
        post: operations["schedules.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/schedules.delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** schedules.delete */
        post: operations["schedules.delete"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/schedules.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** schedules.get */
        post: operations["schedules.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/schedules.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** schedules.list */
        post: operations["schedules.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/schedules.trigger": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** schedules.trigger */
        post: operations["schedules.trigger"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/schedules.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** schedules.update */
        post: operations["schedules.update"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/search.rebuild": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** search.rebuild */
        post: operations["search.rebuild"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/search.status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** search.status */
        post: operations["search.status"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/skills.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** skills.list */
        post: operations["skills.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/skills.search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** skills.search */
        post: operations["skills.search"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/skills.use": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** skills.use */
        post: operations["skills.use"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** status */
        post: operations["status"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/system-presence": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** system-presence */
        post: operations["system-presence"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/talk.mode": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** talk.mode */
        post: operations["talk.mode"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/tools.catalog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** tools.catalog */
        post: operations["tools.catalog"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/tools.invoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** tools.invoke */
        post: operations["tools.invoke"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/update.run": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** update.run */
        post: operations["update.run"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/wizard.cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** wizard.cancel */
        post: operations["wizard.cancel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/wizard.next": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** wizard.next */
        post: operations["wizard.next"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/wizard.start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** wizard.start */
        post: operations["wizard.start"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/wizard.status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** wizard.status */
        post: operations["wizard.status"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/workspaces.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** workspaces.create */
        post: operations["workspaces.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/workspaces.delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** workspaces.delete */
        post: operations["workspaces.delete"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/workspaces.files.delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** workspaces.files.delete */
        post: operations["workspaces.files.delete"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/workspaces.files.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** workspaces.files.get */
        post: operations["workspaces.files.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/workspaces.files.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** workspaces.files.list */
        post: operations["workspaces.files.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/workspaces.files.set": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** workspaces.files.set */
        post: operations["workspaces.files.set"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/workspaces.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** workspaces.get */
        post: operations["workspaces.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/workspaces.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** workspaces.list */
        post: operations["workspaces.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/workspaces.manifest.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** workspaces.manifest.get */
        post: operations["workspaces.manifest.get"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/runtime/operations/workspaces.manifest.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** workspaces.manifest.update */
        post: operations["workspaces.manifest.update"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tools/catalog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** tools.catalog HTTP alias */
        post: operations["tools.catalog.alias.tools.catalog"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tools/invoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** tools.invoke HTTP alias */
        post: operations["tools.invoke.alias.tools.invoke"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
};
export type webhooks = Record<string, never>;
export type components = {
    schemas: {
        AclApprovalRequestParamsSchema: {
            context?: unknown;
            id?: string;
            kind?: string | null;
            nexusRequestId?: string | null;
            originalMessage?: string | null;
            reason?: string | null;
            requesterChannel?: string | null;
            requesterId?: string | null;
            resources: string[];
            sessionId?: string | null;
            summary?: string | null;
            timeoutMs?: number;
            toolCallId?: string | null;
            toolName?: string | null;
        };
        AclApprovalRequestResultSchema: {
            /** Format: int64 */
            createdAtMs: number;
            decision?: string | null;
            /** Format: int64 */
            expiresAtMs: number;
            id: string;
        };
        AclRequestsApproveParamsSchema: {
            id: string;
            mode?: "once" | "day" | "forever";
            platform?: string;
            reason?: string;
            responder?: string;
            responseChannel?: string;
            session?: string;
        };
        AclRequestsApproveResultSchema: {
            grantId?: string | null;
            /** @constant */
            ok: true;
            request: {
                context?: unknown;
                /** Format: int64 */
                createdAtMs: number;
                /** Format: int64 */
                expiresAtMs: number;
                grantId?: string | null;
                id: string;
                kind?: string | null;
                nexusRequestId?: string | null;
                reason?: string | null;
                requesterChannel?: string | null;
                requesterId?: string | null;
                resources: string[];
                responder?: string | null;
                /** Format: int64 */
                responseAtMs?: number | null;
                responseChannel?: string | null;
                sessionId?: string | null;
                status: "pending" | "approved" | "denied" | "expired";
                summary?: string | null;
                toolCallId?: string | null;
                toolName?: string | null;
            };
        };
        AclRequestsDenyParamsSchema: {
            id: string;
            responder?: string;
            responseChannel?: string;
        };
        AclRequestsDenyResultSchema: {
            /** @constant */
            ok: true;
            request: {
                context?: unknown;
                /** Format: int64 */
                createdAtMs: number;
                /** Format: int64 */
                expiresAtMs: number;
                grantId?: string | null;
                id: string;
                kind?: string | null;
                nexusRequestId?: string | null;
                reason?: string | null;
                requesterChannel?: string | null;
                requesterId?: string | null;
                resources: string[];
                responder?: string | null;
                /** Format: int64 */
                responseAtMs?: number | null;
                responseChannel?: string | null;
                sessionId?: string | null;
                status: "pending" | "approved" | "denied" | "expired";
                summary?: string | null;
                toolCallId?: string | null;
                toolName?: string | null;
            };
        };
        AclRequestsListParamsSchema: {
            includeExpired?: boolean;
            limit?: number;
            offset?: number;
            requesterId?: string;
            status?: string;
        };
        AclRequestsListResultSchema: {
            requests: {
                context?: unknown;
                /** Format: int64 */
                createdAtMs: number;
                /** Format: int64 */
                expiresAtMs: number;
                grantId?: string | null;
                id: string;
                kind?: string | null;
                nexusRequestId?: string | null;
                reason?: string | null;
                requesterChannel?: string | null;
                requesterId?: string | null;
                resources: string[];
                responder?: string | null;
                /** Format: int64 */
                responseAtMs?: number | null;
                responseChannel?: string | null;
                sessionId?: string | null;
                status: "pending" | "approved" | "denied" | "expired";
                summary?: string | null;
                toolCallId?: string | null;
                toolName?: string | null;
            }[];
        };
        AclRequestsShowParamsSchema: {
            id: string;
        };
        AclRequestsShowResultSchema: {
            request: {
                context?: unknown;
                /** Format: int64 */
                createdAtMs: number;
                /** Format: int64 */
                expiresAtMs: number;
                grantId?: string | null;
                id: string;
                kind?: string | null;
                nexusRequestId?: string | null;
                reason?: string | null;
                requesterChannel?: string | null;
                requesterId?: string | null;
                resources: string[];
                responder?: string | null;
                /** Format: int64 */
                responseAtMs?: number | null;
                responseChannel?: string | null;
                sessionId?: string | null;
                status: "pending" | "approved" | "denied" | "expired";
                summary?: string | null;
                toolCallId?: string | null;
                toolName?: string | null;
            };
        };
        AdapterConnectionsBackfillParamsSchema: {
            connectionId: string;
            since: string;
            to?: string;
        };
        AdapterConnectionsBackfillResultSchema: {
            account?: string;
            connectionId: string;
            existing_run?: boolean;
            job_definition_id: string;
            job_run_id: string;
            queue_entry_id: string;
            service?: string;
            since: string;
            status: "queued" | "running";
        };
        AdapterConnectionsCreateParamsSchema: {
            adapter: string;
            authMethodId?: string;
            config?: {
                [key: string]: unknown;
            };
            fields: {
                [key: string]: string;
            };
        };
        AdapterConnectionsCredentialGetParamsSchema: {
            connection_id: string;
        };
        AdapterConnectionsCredentialGetResultSchema: {
            adapter: string;
            authMethodId?: string | null;
            connection_id: string;
            credential: {
                fields: {
                    [key: string]: string;
                };
                metadata?: {
                    [key: string]: unknown;
                };
            };
            service: string;
        };
        AdapterConnectionsCustomCancelParamsSchema: {
            adapter: string;
            sessionId: string;
        };
        AdapterConnectionsCustomStartParamsSchema: {
            adapter: string;
            authMethodId?: string;
            payload?: {
                [key: string]: unknown;
            };
        };
        AdapterConnectionsCustomStatusParamsSchema: {
            adapter: string;
            sessionId: string;
        };
        AdapterConnectionsCustomSubmitParamsSchema: {
            adapter: string;
            payload?: {
                [key: string]: unknown;
            };
            sessionId: string;
        };
        AdapterConnectionsDisconnectParamsSchema: {
            connectionId: string;
        };
        AdapterConnectionsListParamsSchema: Record<string, never>;
        AdapterConnectionsListResultSchema: {
            connections: {
                account?: string | null;
                adapter: string;
                auth?: unknown;
                authMethod: "oauth2" | "api_key" | "file_upload" | "custom_flow" | null;
                authMethodId?: string | null;
                connectionId: string;
                error?: string | null;
                /** Format: int64 */
                lastSync?: number | null;
                metadata?: {
                    [key: string]: unknown;
                };
                name: string;
                service?: string;
                status: "connected" | "disconnected" | "error" | "expired";
                summary?: {
                    backfill?: {
                        jobRunId: string;
                        queueEntryId: string;
                        status: "queued" | "running";
                    };
                    channelCount: number;
                    contactCount: number;
                    containers: string[];
                    /** Format: int64 */
                    firstRecordAt?: number | null;
                    /** Format: int64 */
                    lastRecordAt?: number | null;
                    participantCount: number;
                    recordCount: number;
                    spaces: string[];
                };
            }[];
        };
        AdapterConnectionsOAuthCompleteParamsSchema: {
            adapter: string;
            code: string;
            state: string;
        };
        AdapterConnectionsOAuthStartParamsSchema: {
            adapter: string;
            authMethodId?: string;
            managedProfileId?: string;
            redirectBaseUrl?: string;
        };
        AdapterConnectionsOAuthStartResultSchema: {
            /** Format: int64 */
            expiresAt: number;
            redirectUrl: string;
            state: string;
        };
        AdapterConnectionsStatusParamsSchema: {
            connectionId: string;
        };
        AdapterConnectionsStatusResultSchema: {
            account?: string | null;
            adapter: string;
            auth?: unknown;
            authMethod: "oauth2" | "api_key" | "file_upload" | "custom_flow" | null;
            authMethodId?: string | null;
            connectionId: string;
            error?: string | null;
            /** Format: int64 */
            lastSync?: number | null;
            metadata?: {
                [key: string]: unknown;
            };
            name: string;
            service?: string;
            status: "connected" | "disconnected" | "error" | "expired";
            summary?: {
                backfill?: {
                    jobRunId: string;
                    queueEntryId: string;
                    status: "queued" | "running";
                };
                channelCount: number;
                contactCount: number;
                containers: string[];
                /** Format: int64 */
                firstRecordAt?: number | null;
                /** Format: int64 */
                lastRecordAt?: number | null;
                participantCount: number;
                recordCount: number;
                spaces: string[];
            };
        };
        AdapterConnectionsTestParamsSchema: {
            connectionId: string;
        };
        AdapterConnectionsUpdateParamsSchema: {
            adapter: string;
            authMethodId?: string;
            config?: {
                [key: string]: unknown;
            };
            connectionId: string;
            fields: {
                [key: string]: string;
            };
        };
        AdapterConnectionsUploadParamsSchema: {
            adapter: string;
            authMethodId?: string;
            fileName: string;
            filePath: string;
        };
        AgentIdentityParamsSchema: {
            agentId?: string;
            sessionId?: string;
        };
        AgentIdentityResultSchema: {
            agentId: string;
            avatar?: string;
            emoji?: string;
            name?: string;
        };
        AgentsCreateParamsSchema: {
            avatar?: string;
            emoji?: string;
            name: string;
            workspace: string;
        };
        AgentsCreateResultSchema: {
            agentId: string;
            name: string;
            /** @constant */
            ok: true;
            workspace: string;
        };
        AgentsDeleteParamsSchema: {
            agentId: string;
            deleteFiles?: boolean;
        };
        AgentsDeleteResultSchema: {
            agentId: string;
            /** @constant */
            ok: true;
        };
        AgentsFilesGetParamsSchema: {
            agentId: string;
            name: string;
        };
        AgentsFilesGetResultSchema: {
            agentId: string;
            file: {
                content?: string;
                missing: boolean;
                name: string;
                path: string;
                size?: number;
                /** Format: int64 */
                updatedAtMs?: number;
            };
            workspace: string;
        };
        AgentsFilesListParamsSchema: {
            agentId: string;
        };
        AgentsFilesListResultSchema: {
            agentId: string;
            files: {
                content?: string;
                missing: boolean;
                name: string;
                path: string;
                size?: number;
                /** Format: int64 */
                updatedAtMs?: number;
            }[];
            workspace: string;
        };
        AgentsFilesSetParamsSchema: {
            agentId: string;
            content: string;
            name: string;
        };
        AgentsFilesSetResultSchema: {
            agentId: string;
            file: {
                content?: string;
                missing: boolean;
                name: string;
                path: string;
                size?: number;
                /** Format: int64 */
                updatedAtMs?: number;
            };
            /** @constant */
            ok: true;
            workspace: string;
        };
        AgentsListParamsSchema: Record<string, never>;
        AgentsListResultSchema: {
            agents: {
                id: string;
                identity?: {
                    avatar?: string;
                    avatarUrl?: string;
                    emoji?: string;
                    name?: string;
                    theme?: string;
                };
                name?: string;
            }[];
            defaultId: string;
            mainKey: string;
            scope: "per-sender" | "global";
        };
        AgentsSessionDeliveryContextSchema: {
            accountId?: string;
            platform?: string;
            threadId?: string | number;
            to?: string;
        };
        AgentsSessionOriginSchema: {
            label?: string;
            provider: string;
        };
        AgentsSessionPreviewItemSchema: {
            /** @enum {string} */
            role: "user" | "assistant" | "tool" | "system" | "other";
            text: string;
        };
        AgentsSessionRowSchema: {
            abortedLastRun?: boolean;
            agentId?: string;
            chatType?: string;
            contextTokens?: number;
            conversationId?: string;
            deliveryContext?: components["schemas"]["AgentsSessionDeliveryContextSchema"];
            derivedTitle?: string;
            displayName?: string;
            elevatedLevel?: string;
            groupChannel?: string;
            inputTokens?: number;
            key: string;
            /** @enum {string} */
            kind: "direct" | "group" | "global" | "unknown";
            label?: string;
            lastAccountId?: string;
            lastMessagePreview?: string;
            lastPlatform?: string;
            lastThreadId?: string | number;
            lastTo?: string;
            model?: string;
            modelProvider?: string;
            origin?: components["schemas"]["AgentsSessionOriginSchema"];
            outputTokens?: number;
            platform?: string;
            reasoningLevel?: string;
            /** @enum {string} */
            responseUsage?: "on" | "off" | "tokens" | "full";
            /** @enum {string} */
            sendPolicy?: "allow" | "deny";
            sessionId?: string;
            space?: string;
            subject?: string;
            systemSent?: boolean;
            thinkingLevel?: string;
            totalTokens?: number;
            updatedAt?: number | null;
            verboseLevel?: string;
        };
        AgentsSessionsDefaultsSchema: {
            contextTokens?: number | null;
            model?: string | null;
            modelProvider?: string | null;
        };
        AgentsSessionsListResultSchema: {
            count: number;
            defaults: components["schemas"]["AgentsSessionsDefaultsSchema"];
            path: string;
            sessions: components["schemas"]["AgentsSessionRowSchema"][];
            ts: number;
        };
        AgentsSessionsPreviewEntrySchema: {
            items: components["schemas"]["AgentsSessionPreviewItemSchema"][];
            key: string;
            /** @enum {string} */
            status: "ok" | "empty" | "missing" | "error";
        };
        AgentsSessionsPreviewResultSchema: {
            previews: components["schemas"]["AgentsSessionsPreviewEntrySchema"][];
            ts: number;
        };
        AgentsSessionsResolveResultSchema: {
            key: string;
            /** @enum {boolean} */
            ok: true;
        };
        AgentsUpdateParamsSchema: {
            agentId: string;
            avatar?: string;
            model?: string;
            name?: string;
            workspace?: string;
        };
        AgentsUpdateResultSchema: {
            agentId: string;
            /** @constant */
            ok: true;
        };
        AgentWaitParamsSchema: {
            runId: string;
            timeoutMs?: number;
        };
        AppsAppSummarySchema: {
            description?: string | null;
            display_name: string;
            id: string;
            package_dir: string;
            /** @enum {string} */
            status: "installed";
            version: string;
        };
        AppsGetResultSchema: {
            app: components["schemas"]["AppsAppSummarySchema"];
            manifest: {
                [key: string]: unknown;
            };
        };
        AppsMethodContextHintsSchema: {
            params: {
                [key: string]: components["schemas"]["AppsMethodContextHintValueSchema"];
            };
        };
        AppsMethodContextHintValueSchema: {
            /** @enum {string} */
            confidence: "exact" | "derived" | "weak";
            source: string;
            value: unknown;
        };
        AppsMethodDescriptorSchema: {
            /** @enum {string} */
            action: "read" | "write";
            connection_required: boolean;
            context_hints: components["schemas"]["AppsMethodContextHintsSchema"];
            description?: string | null;
            mutates_remote: boolean;
            name: string;
            origin: components["schemas"]["AppsMethodOriginSchema"];
            params?: {
                [key: string]: unknown;
            } | null;
            response?: {
                [key: string]: unknown;
            } | null;
        };
        AppsMethodOriginSchema: {
            /** @enum {string} */
            declaration_mode: "manifest" | "openapi" | "builtin";
            declaration_source: string;
            namespace: string;
            package_id?: string | null;
            package_version?: string | null;
        };
        AppsMethodsResultSchema: {
            methods: components["schemas"]["AppsMethodDescriptorSchema"][];
            package: components["schemas"]["AppsPackageSchema"];
        };
        AppsPackageSchema: {
            id: string;
            /** @enum {string} */
            kind: "app";
            /** @enum {string} */
            status: "active";
            version: string;
        };
        AppsStatusResultSchema: {
            app: {
                description?: string | null;
                display_name: string;
                has_adapters: boolean;
                has_methods: boolean;
                has_services: boolean;
                has_ui: boolean;
                id: string;
                package_dir: string;
                /** @enum {string} */
                status: "installed";
                version: string;
            };
        };
        AuthLoginParamsSchema: {
            password: string;
            username: string;
        };
        AuthLoginResultSchema: {
            entity_id: string;
            expires_at: number;
            /** @enum {boolean} */
            ok: true;
            scopes: string[];
            token: string;
            token_id: string;
        };
        AuthUsersCreateParamsSchema: {
            displayName?: string;
            entityId?: string;
            isOwner?: boolean;
            password: string;
            relationship?: string;
            tags?: string[];
            username: string;
        };
        AuthUsersCreateResultSchema: {
            /** @constant */
            ok: true;
            user: {
                displayName?: string;
                entityId: string;
                isOwner: boolean;
                relationship?: string;
                tags?: string[];
                username: string;
            };
        };
        AuthUsersListParamsSchema: Record<string, never>;
        AuthUsersListResultSchema: {
            users: {
                displayName?: string;
                entityId: string;
                isOwner: boolean;
                relationship?: string;
                tags?: string[];
                username: string;
            }[];
        };
        AuthUsersSetPasswordParamsSchema: {
            entityId?: string;
            password: string;
            username?: string;
        };
        AuthUsersSetPasswordResultSchema: {
            /** @constant */
            ok: true;
        };
        BooleanDeletedResultSchema: {
            deleted: boolean;
            /** @enum {boolean} */
            ok: true;
        };
        ChannelParticipantHistoryRowSchema: {
            avatar_url?: string | null;
            canonical_entity_id?: string | null;
            channel_id: string;
            contact_id: string;
            contact_name?: string | null;
            id: string;
            message_count: number;
            observed_at: number;
            observed_entity_id?: string | null;
            participant_id: string;
            role?: string | null;
            status?: string | null;
        };
        ChannelParticipantRowSchema: {
            avatar_url?: string | null;
            canonical_entity_id?: string | null;
            channel_id: string;
            contact_id: string;
            contact_name?: string | null;
            created_at: number;
            id: string;
            message_count: number;
            observed_entity_id?: string | null;
            role?: string | null;
            status: string;
            updated_at: number;
        };
        ChannelRowSchema: {
            connection_id: string;
            container_id: string;
            container_kind: string;
            container_name?: string | null;
            created_at: number;
            deleted_at?: number | null;
            id: string;
            metadata?: {
                [key: string]: unknown;
            } | null;
            platform: string;
            space_id?: string | null;
            space_name?: string | null;
            thread_id?: string | null;
            thread_name?: string | null;
        };
        ChannelsGetResultSchema: {
            channel: components["schemas"]["ChannelRowSchema"];
        };
        ChannelsHistoryResultSchema: {
            channel_id: string;
            history: components["schemas"]["ChannelRowSchema"][];
        };
        ChannelsListResultSchema: {
            channels: components["schemas"]["ChannelRowSchema"][];
            limit: number;
            offset: number;
        };
        ChannelsMutationResultSchema: {
            channel: components["schemas"]["ChannelRowSchema"];
            previous_channel_id?: string;
            unchanged?: boolean;
        };
        ChannelsParticipantsGetResultSchema: {
            participant: components["schemas"]["ChannelParticipantRowSchema"];
        };
        ChannelsParticipantsHistoryResultSchema: {
            history: components["schemas"]["ChannelParticipantHistoryRowSchema"][];
            limit: number;
        };
        ChannelsParticipantsListResultSchema: {
            participants: components["schemas"]["ChannelParticipantRowSchema"][];
        };
        ChannelsResolveResultSchema: {
            channel?: components["schemas"]["ChannelRowSchema"];
            /** @enum {string} */
            resolution: "resolved" | "materialized" | "unresolved";
            target?: {
                connection_id: string;
                container_id: string;
                container_kind?: string | null;
                platform: string;
                space_id?: string | null;
                thread_id?: string | null;
            };
        };
        ChannelsStatusDataResultSchema: {
            active: boolean;
            channel_id: string;
            connection_id: string;
            container_kind: string;
            participant_count: number;
            platform: string;
        };
        ChannelsStatusParamsSchema: {
            probe?: boolean;
            timeoutMs?: number;
        };
        ChannelsStatusResultSchema: {
            channelConnections: {
                [key: string]: ({
                    allowFrom?: string[];
                    allowUnmentionedGroups?: boolean;
                    application?: unknown;
                    appTokenSource?: string;
                    audit?: unknown;
                    baseUrl?: string;
                    botTokenSource?: string;
                    cliPath?: string | null;
                    configured?: boolean;
                    connected?: boolean;
                    connectionId: string;
                    dbPath?: string | null;
                    dmPolicy?: string;
                    enabled?: boolean;
                    lastConnectedAt?: number;
                    lastError?: string;
                    lastInboundAt?: number;
                    lastOutboundAt?: number;
                    lastProbeAt?: number;
                    lastStartAt?: number;
                    lastStopAt?: number;
                    linked?: boolean;
                    mode?: string;
                    name?: string;
                    port?: number | null;
                    probe?: unknown;
                    reconnectAttempts?: number;
                    running?: boolean;
                    tokenSource?: string;
                } & {
                    [key: string]: unknown;
                })[];
            };
            channelDefaultConnectionId: {
                [key: string]: string;
            };
            channelDetailLabels?: {
                [key: string]: string;
            };
            channelLabels: {
                [key: string]: string;
            };
            channelMeta?: {
                detailLabel: string;
                id: string;
                label: string;
                systemImage?: string;
            }[];
            channelOrder: string[];
            channels: {
                [key: string]: unknown;
            };
            channelSystemImages?: {
                [key: string]: string;
            };
            ts: number;
        };
        ConfigApplyParamsSchema: {
            baseHash?: string;
            note?: string;
            raw: string;
            restartDelayMs?: number;
            sessionId?: string;
        };
        ConfigFileSnapshotSchema: {
            config: {
                [key: string]: unknown;
            };
            exists: boolean;
            hash?: string;
            issues: components["schemas"]["ConfigValidationIssueSchema"][];
            legacyIssues: components["schemas"]["ConfigValidationIssueSchema"][];
            parsed: unknown;
            path: string;
            raw?: string | null;
            valid: boolean;
            warnings: components["schemas"]["ConfigValidationIssueSchema"][];
        };
        ConfigGetParamsSchema: Record<string, never>;
        ConfigPatchParamsSchema: {
            baseHash?: string;
            note?: string;
            raw: string;
            restartDelayMs?: number;
            sessionId?: string;
        };
        ConfigSchemaParamsSchema: Record<string, never>;
        ConfigSchemaResponseSchema: {
            generatedAt: string;
            schema: unknown;
            uiHints: {
                [key: string]: {
                    advanced?: boolean;
                    group?: string;
                    help?: string;
                    itemTemplate?: unknown;
                    label?: string;
                    order?: number;
                    placeholder?: string;
                    sensitive?: boolean;
                };
            };
            version: string;
        };
        ConfigSetParamsSchema: {
            baseHash?: string;
            raw: string;
        };
        ConfigValidationIssueSchema: {
            message: string;
            path: string;
        };
        ConfigWriteResultSchema: {
            config: {
                [key: string]: unknown;
            };
            /** @enum {boolean} */
            ok: true;
            path: string;
            restart?: components["schemas"]["RuntimeRestartAttemptSchema"];
            sentinel?: components["schemas"]["RestartSentinelSchema"];
        };
        ContactGetResultSchema: {
            contact: components["schemas"]["IdentityContactRowSchema"];
        };
        ContactMutationResultSchema: {
            contact: components["schemas"]["IdentityContactRowSchema"];
        };
        ContactsHistoryResultSchema: {
            history: components["schemas"]["IdentityContactRowSchema"][];
        };
        ContactsImportResultSchema: {
            errors?: string[];
            imported: number;
        };
        ContactsListResultSchema: {
            contacts: components["schemas"]["IdentityContactRowSchema"][];
        };
        CredentialsGetResultSchema: {
            credential: components["schemas"]["CredentialViewSchema"];
        };
        CredentialsListResultSchema: {
            credentials: components["schemas"]["CredentialViewSchema"][];
        };
        CredentialsMutationResultSchema: {
            credential: components["schemas"]["CredentialViewSchema"];
            /** @enum {boolean} */
            ok: true;
        };
        CredentialsResolveResultSchema: {
            credentialId: string;
            type: string;
            value: string;
        };
        CredentialsRevokeResultSchema: {
            /** @enum {boolean} */
            ok: true;
            /** @enum {boolean} */
            revoked: true;
        };
        CredentialsVaultRetrieveResultSchema: {
            value: string;
        };
        CredentialsVaultStoreResultSchema: {
            /** @enum {boolean} */
            ok: true;
            vaultEntryId: string;
        };
        CredentialViewSchema: {
            account: string;
            createdAt: number;
            entityId?: string | null;
            expiresAt?: number | null;
            id: string;
            label?: string | null;
            lastValidatedAt?: number | null;
            metadata: unknown;
            revokedAt?: number | null;
            service: string;
            status: string;
            storagePointer?: string;
            storageType: string;
            type: string;
            updatedAt: number;
        };
        EntitiesListResultSchema: {
            entities: components["schemas"]["IdentityEntityRowSchema"][];
        };
        EntityGetResultSchema: {
            entity: components["schemas"]["IdentityEntityRowSchema"];
        };
        EntityMergeCandidatesResultSchema: {
            candidates: components["schemas"]["MergeCandidateRowSchema"][];
        };
        EntityMergeProposeResultSchema: {
            candidate: components["schemas"]["MergeCandidateRowSchema"];
        };
        EntityMergeResolveResultSchema: {
            candidate: components["schemas"]["MergeCandidateRowSchema"];
            merged: boolean;
        };
        EntityMergeResultSchema: {
            /** @enum {boolean} */
            merged: true;
            source_id: string;
            target_id: string;
        };
        EntityMutationResultSchema: {
            entity: components["schemas"]["IdentityEntityRowSchema"];
        };
        EntityResolveResultSchema: {
            canonical_id: string;
            hops: number;
        };
        EntityTagAddResultSchema: {
            created_at?: number;
            entity_id: string;
            id?: string;
            message?: string;
            tag: string;
        };
        EntityTagRemoveResultSchema: {
            deleted: boolean;
        };
        EntityTagsListResultSchema: {
            tags: string[];
        };
        ErrorShapeSchema: {
            code: string;
            details?: unknown;
            message: string;
            retryable?: boolean;
            retryAfterMs?: number;
        };
        EventsPublishResultSchema: {
            /** @enum {boolean} */
            ok: true;
            type: string;
        };
        EventSubscriptionsCreateParamsSchema: {
            enabled?: boolean | number;
            event_type: string;
            job_definition_id: string;
            match?: {
                [key: string]: unknown;
            };
            match_json?: string;
        };
        EventSubscriptionsCreateResultSchema: {
            subscription: {
                created_at: string;
                enabled: number;
                event_type: string;
                id: string;
                job_definition_id: string;
                match_json?: string | null;
                updated_at: string;
            };
        };
        EventSubscriptionsDeleteParamsSchema: {
            id: string;
        };
        EventSubscriptionsDeleteResultSchema: {
            deleted: boolean;
            ok: boolean;
        };
        EventSubscriptionsGetParamsSchema: {
            id: string;
        };
        EventSubscriptionsGetResultSchema: {
            subscription: {
                created_at: string;
                enabled: number;
                event_type: string;
                id: string;
                job_definition_id: string;
                match_json?: string | null;
                updated_at: string;
            };
        };
        EventSubscriptionsListParamsSchema: {
            enabled?: boolean | number;
            event_type?: string;
            job_definition_id?: string;
            limit?: number;
            offset?: number;
        };
        EventSubscriptionsListResultSchema: {
            subscriptions: {
                created_at: string;
                enabled: number;
                event_type: string;
                id: string;
                job_definition_id: string;
                match_json?: string | null;
                updated_at: string;
            }[];
        };
        EventSubscriptionsUpdateParamsSchema: {
            enabled?: boolean | number;
            event_type?: string;
            id: string;
            job_definition_id?: string;
            match?: {
                [key: string]: unknown;
            };
            match_json?: string | null;
        };
        EventSubscriptionsUpdateResultSchema: {
            subscription: {
                created_at: string;
                enabled: number;
                event_type: string;
                id: string;
                job_definition_id: string;
                match_json?: string | null;
                updated_at: string;
            };
        };
        EventsUnsubscribeResultSchema: {
            /** @enum {boolean} */
            ok: true;
        };
        GroupDeleteResultSchema: {
            deleted_at: number;
            id: string;
        };
        GroupGetResultSchema: {
            group: components["schemas"]["IdentityGroupRowSchema"];
        };
        GroupMemberMutationResultSchema: {
            entity_id?: string;
            group_id?: string;
            member?: components["schemas"]["IdentityGroupMemberRowSchema"];
        };
        GroupMembersListResultSchema: {
            members: components["schemas"]["IdentityGroupMemberRowSchema"][];
        };
        GroupMutationResultSchema: {
            group: components["schemas"]["IdentityGroupRowSchema"];
        };
        GroupsListResultSchema: {
            groups: components["schemas"]["IdentityGroupRowSchema"][];
            limit: number;
            offset: number;
        };
        IdentityContactRowSchema: {
            avatar_url?: string | null;
            canonical_entity_id: string;
            contact_id: string;
            contact_name?: string | null;
            created_at: number;
            deleted_at?: number | null;
            id: string;
            observed_entity_id: string;
            origin: string;
            platform: string;
            space_id: string;
        };
        IdentityEntityRowSchema: {
            created_at: number;
            deleted_at?: number | null;
            id: string;
            is_agent?: number | boolean | null;
            is_user?: number | boolean | null;
            merged_into?: string | null;
            model_config_id?: string | null;
            name: string;
            normalized?: string | null;
            origin?: string | null;
            role_config_id?: string | null;
            type: string;
            updated_at?: number | null;
        };
        IdentityGroupMemberRowSchema: {
            created_at: number;
            entity_id: string;
            entity_name?: string;
            entity_type?: string;
            group_id: string;
            id: string;
            role?: string | null;
            updated_at: number;
        };
        IdentityGroupRowSchema: {
            created_at: number;
            description?: string | null;
            id: string;
            member_count: number | string;
            name: string;
            parent_group_id?: string | null;
            updated_at: number;
        };
        IngressCredentialsCreateParamsSchema: {
            entityId: string;
            /** Format: int64 */
            expiresAt?: number | null;
            label?: string | null;
            role?: string;
            scopes?: string[];
        };
        IngressCredentialsCreateResultSchema: {
            credential: {
                /** Format: int64 */
                createdAt: number;
                entityId: string;
                /** Format: int64 */
                expiresAt?: number | null;
                id: string;
                label?: string | null;
                /** Format: int64 */
                lastUsedAt?: number | null;
                /** Format: int64 */
                revokedAt?: number | null;
                role: string;
                scopes: string[];
            };
            /** @constant */
            ok: true;
            token: string;
        };
        IngressCredentialsListParamsSchema: {
            entityId?: string;
            includeExpired?: boolean;
            includeRevoked?: boolean;
            limit?: number;
            offset?: number;
        };
        IngressCredentialsListResultSchema: {
            credentials: {
                /** Format: int64 */
                createdAt: number;
                entityId: string;
                /** Format: int64 */
                expiresAt?: number | null;
                id: string;
                label?: string | null;
                /** Format: int64 */
                lastUsedAt?: number | null;
                /** Format: int64 */
                revokedAt?: number | null;
                role: string;
                scopes: string[];
            }[];
        };
        IngressCredentialsRevokeParamsSchema: {
            id: string;
        };
        IngressCredentialsRevokeResultSchema: {
            /** @constant */
            ok: true;
            revoked: boolean;
        };
        IngressCredentialsRotateParamsSchema: {
            /** Format: int64 */
            expiresAt?: number | null;
            id: string;
            label?: string | null;
            role?: string;
            scopes?: string[];
        };
        IngressCredentialsRotateResultSchema: {
            credential: {
                /** Format: int64 */
                createdAt: number;
                entityId: string;
                /** Format: int64 */
                expiresAt?: number | null;
                id: string;
                label?: string | null;
                /** Format: int64 */
                lastUsedAt?: number | null;
                /** Format: int64 */
                revokedAt?: number | null;
                role: string;
                scopes: string[];
            };
            /** @constant */
            ok: true;
            previousId: string;
            token: string;
        };
        JobDefinitionSchema: {
            config_json?: string | null;
            created_at: string;
            created_by?: string | null;
            description?: string | null;
            hook_points?: string | null;
            id: string;
            lane_id: string;
            name: string;
            previous_version_id?: string | null;
            script_hash?: string | null;
            script_path: string;
            status: string;
            timeout_ms?: number | null;
            updated_at: string;
            version: number;
            workspace_id?: string | null;
        };
        JobGetParamsSchema: {
            id: string;
        };
        JobGetResultSchema: {
            job: components["schemas"]["JobDefinitionSchema"];
        };
        JobIdempotencyRowSchema: {
            active_run_id?: string | null;
            active_run_status?: string | null;
            created_at: string;
            first_run_id?: string | null;
            idempotency_key: string;
            job_definition_id: string;
            job_definition_name?: string | null;
            latest_run_id?: string | null;
            latest_run_status?: string | null;
            request_fingerprint?: string | null;
            status: string;
            updated_at: string;
        };
        JobMutationResultSchema: {
            job: components["schemas"]["JobDefinitionSchema"];
        };
        JobQueueRowSchema: {
            attempt_count: number;
            available_at: string;
            created_at: string;
            execution_envelope_json?: string | null;
            id: string;
            idempotency_key?: string | null;
            input_json?: string | null;
            job_definition_id: string;
            job_run_id: string;
            last_failure_detail?: string | null;
            lease_expires_at?: string | null;
            lease_owner?: string | null;
            leased_at?: string | null;
            max_attempts: number;
            queue_status: string;
            source_run_id?: string | null;
            updated_at: string;
        };
        JobRunGetParamsSchema: {
            id: string;
        };
        JobRunGetResultSchema: {
            run: components["schemas"]["JobRunSchema"];
        };
        JobRunSchema: {
            completed_at?: string | null;
            created_at: string;
            dag_node_id?: string | null;
            dag_run_id?: string | null;
            duration_ms?: number | null;
            error?: string | null;
            execution_envelope_json?: string | null;
            id: string;
            input_json?: string | null;
            job_definition_id: string;
            job_schedule_id?: string | null;
            metrics_json?: string | null;
            output_json?: string | null;
            started_at?: string | null;
            status: string;
            trigger_source?: string | null;
            turn_ids?: string | null;
        };
        JobRunsListParamsSchema: {
            dag_run_id?: string;
            job_definition_id?: string;
            job_schedule_id?: string;
            limit?: number;
            offset?: number;
            status?: string;
            trigger_source?: string;
        };
        JobRunsListResultSchema: {
            runs: components["schemas"]["JobRunSchema"][];
        };
        JobsCancelResultSchema: {
            cancelled?: boolean;
            queue_entry?: components["schemas"]["JobQueueRowSchema"];
            reason?: string;
            run: components["schemas"]["JobRunSchema"];
        };
        JobsIdempotencyListParamsSchema: {
            active_run_id?: string;
            job_definition_id?: string;
            latest_run_id?: string;
            limit?: number;
            offset?: number;
            status?: string;
        };
        JobsIdempotencyListResultSchema: {
            idempotency: components["schemas"]["JobIdempotencyRowSchema"][];
        };
        JobsInvokeResultSchema: {
            queue_entry: components["schemas"]["JobQueueRowSchema"];
            run: components["schemas"]["JobRunSchema"];
        };
        JobsLanesListParamsSchema: {
            status?: string;
        };
        JobsLanesListResultSchema: {
            lanes: components["schemas"]["WorkLaneStatusSchema"][];
        };
        JobsListParamsSchema: {
            limit?: number;
            offset?: number;
            status?: string;
            workspace_id?: string;
        };
        JobsListResultSchema: {
            jobs: components["schemas"]["JobDefinitionSchema"][];
        };
        JobsQueueGetResultSchema: {
            queue_entry: components["schemas"]["JobQueueRowSchema"];
        };
        JobsQueueListResultSchema: {
            queue_entries: components["schemas"]["JobQueueRowSchema"][];
        };
        JobsRequeueResultSchema: {
            queue_entry: components["schemas"]["JobQueueRowSchema"];
            run: components["schemas"]["JobRunSchema"];
        };
        JobsRetryResultSchema: {
            queue_entry: components["schemas"]["JobQueueRowSchema"];
            run: components["schemas"]["JobRunSchema"];
        };
        JobsStatusParamsSchema: Record<string, never>;
        JobsStatusResultSchema: {
            generated_at: string;
            global: {
                configured_concurrency_budget: number;
                dead_lettered_count: number;
                delayed_count: number;
                effective_concurrency_budget: number;
                eligible_count: number;
                lane_count: number;
                leased_count: number;
                queue_delay_avg_ms?: number | null;
                queue_delay_max_ms?: number | null;
                queued_count: number;
                running_count: number;
                saturated_lane_count: number;
                throttled_lane_count: number;
                throughput_per_minute: number;
            };
            idempotency: {
                active: number;
                cancelled: number;
                completed: number;
                failed: number;
                other: number;
            };
            lanes: components["schemas"]["WorkLaneStatusSchema"][];
            lookback_window_ms: number;
        };
        LogsTailParamsSchema: {
            cursor?: number;
            limit?: number;
            maxBytes?: number;
        };
        LogsTailResultSchema: {
            cursor: number;
            file: string;
            lines: string[];
            reset?: boolean;
            size: number;
            truncated?: boolean;
        };
        MergeCandidateRowSchema: {
            confidence: number;
            created_at: number;
            entity_a_id?: string;
            entity_b_id?: string;
            id: string;
            reason?: string | null;
            resolved_at?: number | null;
            source_entity_id?: string;
            status?: string | null;
            target_entity_id?: string;
        };
        ModelsGetResultSchema: {
            model: {
                [key: string]: unknown;
            };
        };
        ModelsListParamsSchema: Record<string, never>;
        ModelsListResultSchema: {
            models: {
                contextWindow?: number;
                id: string;
                name: string;
                provider: string;
                reasoning?: boolean;
            }[];
        };
        ProductControlPlaneCallResultSchema: {
            body?: string;
            error?: string;
            ok: boolean;
            result?: {
                [key: string]: unknown;
            };
        } & {
            [key: string]: unknown;
        };
        RecordIngestParamsSchema: {
            payload: {
                attachments?: {
                    content_type: string;
                    filename?: string;
                    id: string;
                    metadata?: {
                        [key: string]: unknown;
                    };
                    path?: string;
                    size_bytes?: number;
                    url?: string;
                }[];
                content: string;
                content_type: "text" | "reaction" | "membership";
                external_record_id: string;
                metadata?: {
                    [key: string]: unknown;
                };
                recipients?: string[];
                timestamp: number;
            };
            routing: {
                adapter?: string;
                connection_id: string;
                container_id: string;
                container_kind: "direct" | "group";
                container_name?: string;
                metadata?: {
                    [key: string]: unknown;
                };
                platform: string;
                receiver_id?: string;
                receiver_name?: string;
                reply_to_id?: string;
                sender_id: string;
                sender_name?: string;
                space_id?: string;
                space_name?: string;
                thread_id?: string;
                thread_name?: string;
            };
        };
        RecordRowSchema: {
            id: string;
        } & {
            [key: string]: unknown;
        };
        RecordsGetResultSchema: {
            record: components["schemas"]["RecordRowSchema"];
        };
        RecordsListResultSchema: {
            records: components["schemas"]["RecordRowSchema"][];
        };
        RestartSentinelPayloadSchema: {
            deliveryContext?: {
                [key: string]: unknown;
            };
            doctorHint?: string | null;
            /** @enum {string} */
            kind: "config-apply" | "update" | "restart";
            message?: string | null;
            sessionId?: string;
            stats?: components["schemas"]["RestartSentinelStatsSchema"] | null;
            /** @enum {string} */
            status: "ok" | "error" | "skipped";
            threadId?: string;
            ts: number;
        };
        RestartSentinelSchema: {
            path?: string | null;
            payload: components["schemas"]["RestartSentinelPayloadSchema"];
        };
        RestartSentinelStatsSchema: {
            after?: {
                [key: string]: unknown;
            } | null;
            before?: {
                [key: string]: unknown;
            } | null;
            durationMs?: number | null;
            mode?: string;
            reason?: string | null;
            root?: string;
            steps?: {
                [key: string]: unknown;
            }[];
        };
        RuntimeHealthResultSchema: {
            status: string;
            ts: number;
        } & {
            [key: string]: unknown;
        };
        RuntimeRestartAttemptSchema: {
            delayMs: number;
            /** @enum {string} */
            mode: "emit" | "signal";
            ok: boolean;
            pid: number;
            reason?: string;
            /** @enum {string} */
            signal: "SIGUSR1";
        };
        SandboxesCreateParamsSchema: {
            backend: "container" | "vm" | "remote_vm";
            config_json?: {
                [key: string]: unknown;
            };
            id?: string;
            image?: string;
            lineage_root_id?: string;
            linkage?: {
                [key: string]: unknown;
            };
            mounts?: {
                read_only?: boolean;
                source_path: string;
                target_path: string;
            }[];
            parent_sandbox_id?: string;
            profile?: string;
            workspace_source_path?: string;
        };
        SandboxesDestroyParamsSchema: {
            id: string;
        };
        SandboxesExecParamsSchema: {
            command: string;
            cwd?: string;
            env?: {
                [key: string]: string;
            };
            id: string;
            timeout_ms?: number;
        };
        SandboxesExecResultSchema: {
            exec: components["schemas"]["SandboxExecSchema"];
            sandbox: components["schemas"]["SandboxSchema"];
        };
        SandboxesForkParamsSchema: {
            id: string;
            image?: string;
            new_id?: string;
            profile?: string;
        };
        SandboxesGetParamsSchema: {
            id: string;
        };
        SandboxesGetResultSchema: {
            sandbox: components["schemas"]["SandboxSchema"];
        };
        SandboxesListParamsSchema: {
            backend?: string;
            limit?: number;
            state?: string;
        };
        SandboxesListResultSchema: {
            sandboxes: components["schemas"]["SandboxSchema"][];
        };
        SandboxesResumeParamsSchema: {
            id: string;
        };
        SandboxesRetainParamsSchema: {
            id: string;
        };
        SandboxExecSchema: {
            command: string;
            completed_at?: string | null;
            created_at: string;
            cwd?: string | null;
            env_json?: string | null;
            error?: string | null;
            exit_code?: number | null;
            id: string;
            sandbox_id: string;
            started_at?: string | null;
            status: string;
            stderr_path?: string | null;
            stdout_path?: string | null;
        };
        SandboxSchema: {
            artifacts_path: string;
            backend: string;
            config_json?: string | null;
            created_at: string;
            destroyed_at?: string | null;
            id: string;
            image?: string | null;
            lineage_root_id?: string | null;
            linkage_json?: string | null;
            mounts_json?: string | null;
            parent_sandbox_id?: string | null;
            profile?: string | null;
            retained: number;
            retained_at?: string | null;
            runtime_state_json?: string | null;
            state: string;
            updated_at: string;
            workspace_path: string;
            workspace_source_path?: string | null;
        };
        ScheduleCreateParamsSchema: {
            active_from?: string;
            active_until?: string;
            enabled?: boolean;
            expression: string;
            job_definition_id: string;
            name?: string;
            timezone?: string;
        };
        ScheduleDeleteParamsSchema: {
            id: string;
        };
        ScheduleGetParamsSchema: {
            id: string;
        };
        ScheduleGetResultSchema: {
            schedule: components["schemas"]["ScheduleRecordSchema"];
        };
        ScheduleMutationResultSchema: {
            schedule: components["schemas"]["ScheduleRecordSchema"];
        };
        ScheduleRecordSchema: {
            active_from?: string | null;
            active_until?: string | null;
            created_at: string;
            enabled: number;
            expression: string;
            id: string;
            job_definition_id: string;
            last_run_at?: string | null;
            name?: string | null;
            next_run_at?: string | null;
            timezone?: string | null;
            updated_at: string;
        };
        SchedulesListParamsSchema: {
            enabled?: boolean;
            job_definition_id?: string;
            limit?: number;
            offset?: number;
        };
        SchedulesListResultSchema: {
            schedules: components["schemas"]["ScheduleRecordSchema"][];
        };
        ScheduleTriggerParamsSchema: {
            id: string;
            mode?: "due" | "force";
        };
        ScheduleTriggerResultSchema: {
            queue_entry: components["schemas"]["JobQueueRowSchema"];
            run: components["schemas"]["JobRunSchema"];
        };
        ScheduleUpdateParamsSchema: {
            active_from?: string;
            active_until?: string;
            enabled?: boolean;
            expression?: string;
            id: string;
            last_run_at?: string;
            name?: string;
            timezone?: string;
        };
        SessionsCompactParamsSchema: {
            maxLines?: number;
            sessionId: string;
        };
        SessionsDeleteParamsSchema: {
            deleteTranscript?: boolean;
            sessionId: string;
        };
        SessionsImportChunkParamsSchema: {
            aixSourceId?: string;
            chunkIndex: number;
            chunkTotal: number;
            data: string;
            /** @constant */
            encoding: "gzip+base64";
            idempotencyKey: string;
            mode: "backfill" | "tail";
            runId?: string;
            /** @constant */
            source: "aix";
            sourceContactId?: string;
            sourceEntityId: string;
            sourceProvider: string;
            sourceSessionFingerprint: string;
            sourceSessionId: string;
            uploadId: string;
            workspaceId?: string;
        };
        SessionsImportParamsSchema: {
            aixSourceId?: string;
            idempotencyKey: string;
            items: {
                artifacts?: {
                    agentPath: string;
                    bytes: number;
                    contentType?: string | null;
                    /** Format: int64 */
                    createdAtMs: number;
                    encoding?: string | null;
                    hostPath: string;
                    id: string;
                    kind: string;
                    metadataJson?: unknown;
                    relativePath?: string | null;
                    sha256?: string | null;
                }[];
                /** Format: int64 */
                importedAtMs: number;
                messages: {
                    content?: string;
                    contextJson?: unknown;
                    /** Format: int64 */
                    createdAtMs: number;
                    metadataJson?: unknown;
                    role: "user" | "assistant" | "system" | "tool";
                    sequence: number;
                    sourceMessageId: string;
                    sourceTurnId?: string;
                    thinking?: string;
                }[];
                session: {
                    /** Format: int64 */
                    createdAtMs?: number;
                    isSubagent?: boolean;
                    metadata?: {
                        [key: string]: unknown;
                    };
                    model?: string;
                    parentSourceMessageId?: string;
                    parentSourceSessionId?: string;
                    project?: string;
                    provider?: string;
                    spawnToolCallId?: string;
                    taskDescription?: string;
                    taskStatus?: string;
                    /** Format: int64 */
                    updatedAtMs?: number;
                    workspacePath?: string;
                };
                sourceProvider: string;
                sourceSessionFingerprint: string;
                sourceSessionId: string;
                systemContextProfiles?: {
                    contextJson?: unknown;
                    /** Format: int64 */
                    createdAtMs: number;
                    hash: string;
                    id: string;
                    metadataJson?: unknown;
                    systemPrompt: string;
                    /** Format: int64 */
                    updatedAtMs: number;
                }[];
                toolCalls?: {
                    /** Format: int64 */
                    completedAtMs?: number;
                    error?: string;
                    paramsJson?: unknown;
                    resultArtifactId?: string;
                    resultJson?: unknown;
                    resultPreviewText?: string;
                    sequence: number;
                    sourceMessageId?: string;
                    sourceToolCallId: string;
                    sourceTurnId?: string;
                    spawnedSourceSessionId?: string;
                    /** Format: int64 */
                    startedAtMs: number;
                    status?: "pending" | "running" | "completed" | "failed";
                    toolName: string;
                    toolNumber?: number;
                }[];
                turns: {
                    cachedInputTokens?: number;
                    cacheWriteTokens?: number;
                    /** Format: int64 */
                    completedAtMs?: number;
                    inputArtifactId?: string;
                    inputTokens?: number;
                    metadata?: {
                        [key: string]: unknown;
                    };
                    model?: string;
                    outputArtifactId?: string;
                    outputTokens?: number;
                    parentSourceTurnId?: string;
                    provider?: string;
                    queryMessageSourceIds?: string[];
                    reasoningTokens?: number;
                    responseMessageSourceId?: string;
                    sourceTurnId: string;
                    /** Format: int64 */
                    startedAtMs: number;
                    systemContextProfileId?: string;
                    totalTokens?: number;
                }[];
            }[];
            mode: "backfill" | "tail";
            runId?: string;
            /** @constant */
            source: "aix";
            sourceContactId?: string;
            sourceEntityId: string;
            workspaceId?: string;
        };
        SessionsImportsListItemSchema: {
            aixSourceId: string;
            sessionId: string;
            sourceEntityId: string;
            sourceProvider: string;
            sourceSessionId: string;
            title?: string | null;
            updatedAt: number;
            workspaceId?: string | null;
        };
        SessionsImportsListParamsSchema: {
            aixSourceId?: string;
            cursor?: string;
            limit?: number;
            sourceEntityId?: string;
            sourceProvider?: string;
            workspaceId: string;
        };
        SessionsImportsListResultSchema: {
            items: components["schemas"]["SessionsImportsListItemSchema"][];
            nextCursor?: string;
        };
        SessionsListParamsSchema: {
            activeMinutes?: number;
            agentId?: string;
            includeDerivedTitles?: boolean;
            includeGlobal?: boolean;
            includeLastMessage?: boolean;
            includeUnknown?: boolean;
            limit?: number;
            parentSessionId?: string;
            search?: string;
        };
        SessionsPatchParamsSchema: {
            elevatedLevel?: string | null;
            entity_id?: string | null;
            execAsk?: string | null;
            execHost?: string | null;
            execNode?: string | null;
            execSecurity?: string | null;
            execution_host_config_json?: unknown | null;
            execution_host_kind?: "host.runtime" | "host.node" | "sandbox" | null;
            groupActivation?: "mention" | "always" | null;
            label?: string | null;
            model?: string | null;
            model_config_id?: string | null;
            parentSessionId?: string | null;
            reasoningLevel?: string | null;
            responseUsage?: "off" | "tokens" | "full" | "on" | null;
            role_config_id?: string | null;
            sandbox_id?: string | null;
            sendPolicy?: "allow" | "deny" | null;
            session_id: string;
            thinkingLevel?: string | null;
            verboseLevel?: string | null;
        };
        SessionsPreviewParamsSchema: {
            keys: string[];
            limit?: number;
            maxChars?: number;
        };
        SessionsResetParamsSchema: {
            sessionId: string;
        };
        SessionsResolveParamsSchema: {
            agentId?: string;
            includeGlobal?: boolean;
            includeUnknown?: boolean;
            key?: string;
            parentSessionId?: string;
        };
        SessionsSendParamsSchema: {
            attachments?: unknown[];
            deliver?: boolean;
            idempotency_key: string;
            message: string;
            sessionId?: string;
            thinking?: string;
            timeout_ms?: number;
        };
        SkillsListResultSchema: {
            skills: {
                [key: string]: unknown;
            }[];
        } & {
            [key: string]: unknown;
        };
        SkillsSearchResultSchema: {
            results: {
                [key: string]: unknown;
            }[];
        };
        SkillsUseResultSchema: {
            content: string;
        };
        TalkModeParamsSchema: {
            enabled: boolean;
            phase?: string;
        };
        TalkModeResultSchema: {
            enabled: boolean;
            phase?: string | null;
            ts: number;
        };
        UpdateRunParamsSchema: {
            note?: string;
            restartDelayMs?: number;
            sessionId?: string;
            timeoutMs?: number;
        };
        WizardCancelParamsSchema: {
            sessionId: string;
        };
        WizardCancelResultSchema: {
            error?: string | null;
            status: string;
        };
        WizardNextParamsSchema: {
            answer?: {
                stepId: string;
                value?: unknown;
            };
            sessionId: string;
        };
        WizardNextResultSchema: {
            done: boolean;
            error?: string;
            status?: "running" | "done" | "cancelled" | "error";
            step?: {
                executor?: "runtime" | "client";
                id: string;
                initialValue?: unknown;
                message?: string;
                options?: {
                    hint?: string;
                    label: string;
                    value: unknown;
                }[];
                placeholder?: string;
                sensitive?: boolean;
                title?: string;
                type: "note" | "select" | "text" | "confirm" | "multiselect" | "progress" | "action";
            };
        };
        WizardStartParamsSchema: {
            mode?: "local" | "remote";
            workspace?: string;
        };
        WizardStartResultSchema: {
            done: boolean;
            error?: string;
            sessionId: string;
            status?: "running" | "done" | "cancelled" | "error";
            step?: {
                executor?: "runtime" | "client";
                id: string;
                initialValue?: unknown;
                message?: string;
                options?: {
                    hint?: string;
                    label: string;
                    value: unknown;
                }[];
                placeholder?: string;
                sensitive?: boolean;
                title?: string;
                type: "note" | "select" | "text" | "confirm" | "multiselect" | "progress" | "action";
            };
        };
        WizardStatusParamsSchema: {
            sessionId: string;
        };
        WizardStatusResultSchema: {
            error?: string;
            status: "running" | "done" | "cancelled" | "error";
        };
        WorkLaneStatusSchema: {
            adaptive_mode: string;
            adaptive_reason?: string | null;
            batched_writes_enabled: number;
            completed_runs_recent: number;
            concurrency_budget: number;
            config_json?: string | null;
            created_at: string;
            dead_lettered_count: number;
            delayed_count: number;
            description?: string | null;
            effective_concurrency_budget: number;
            eligible_count: number;
            failed_runs_recent: number;
            id: string;
            last_adjusted_at?: string | null;
            lease_batch_size: number;
            lease_recoveries_recent: number;
            leased_count: number;
            max_attempts_default: number;
            name: string;
            oldest_eligible_wait_ms?: number | null;
            priority: number;
            queue_delay_avg_ms?: number | null;
            queue_delay_max_ms?: number | null;
            queued_count: number;
            running_count: number;
            saturated: number;
            status: string;
            throttled: number;
            throughput_per_minute: number;
            updated_at: string;
        };
        WorkspaceCreateResultSchema: {
            id: string;
            name: string;
            /** @enum {boolean} */
            ok: true;
            path: string;
        };
        WorkspaceDeleteResultSchema: {
            deleted: boolean;
            /** @enum {boolean} */
            ok: true;
        };
        WorkspaceDetailResultSchema: {
            createdAt: number;
            id: string;
            manifest?: {
                [key: string]: unknown;
            } | null;
            name: string;
            path: string;
        };
        WorkspaceFileDeleteResultSchema: {
            deleted: boolean;
            filename: string;
            id: string;
            /** @enum {boolean} */
            ok: true;
        };
        WorkspaceFileGetResultSchema: {
            content: string;
            filename: string;
            id: string;
            size: number;
            updatedAtMs: number;
        };
        WorkspaceFileSetResultSchema: {
            filename: string;
            id: string;
            /** @enum {boolean} */
            ok: true;
        };
        WorkspaceFilesListResultSchema: {
            files: string[];
            id: string;
            path: string;
        };
        WorkspaceManifestResultSchema: {
            id: string;
            manifest?: {
                [key: string]: unknown;
            } | null;
            /** @enum {boolean} */
            ok?: true;
        };
        WorkspacesListResultSchema: {
            workspaces: components["schemas"]["WorkspaceSummarySchema"][];
        };
        WorkspaceSummarySchema: {
            createdAt: number;
            hasManifest: boolean;
            id: string;
            name: string;
            path: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
};
export type $defs = Record<string, never>;
export interface operations {
    "apps.list.alias.api.apps": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful runtime HTTP alias response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "apps.install.alias.api.apps.install": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime HTTP alias response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "apps.uninstall.alias.api.apps.uninstall": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime HTTP alias response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "auth.login.alias.api.auth.login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    password: string;
                    username: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime HTTP alias response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        entity_id: string;
                        expires_at: number;
                        /** @enum {boolean} */
                        ok: true;
                        scopes: string[];
                        token: string;
                        token_id: string;
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "events.subscribe.alias.api.events.subscribe": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Runtime event stream */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": string;
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "operator.packages.install.alias.api.operator.packages.install": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime HTTP alias response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "operator.packages.uninstall.alias.api.operator.packages.uninstall": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime HTTP alias response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "operator.packages.upgrade.alias.api.operator.packages.upgrade": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime HTTP alias response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "runtime.health.alias.health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful runtime HTTP alias response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "acl.approval.request": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    context?: unknown;
                    id?: string;
                    kind?: string | null;
                    nexusRequestId?: string | null;
                    originalMessage?: string | null;
                    reason?: string | null;
                    requesterChannel?: string | null;
                    requesterId?: string | null;
                    resources: string[];
                    sessionId?: string | null;
                    summary?: string | null;
                    timeoutMs?: number;
                    toolCallId?: string | null;
                    toolName?: string | null;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            /** Format: int64 */
                            createdAtMs: number;
                            decision?: string | null;
                            /** Format: int64 */
                            expiresAtMs: number;
                            id: string;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "acl.audit.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "acl.audit.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "acl.audit.stats": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "acl.evaluate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "acl.policies.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "acl.policies.delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "acl.policies.disable": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "acl.policies.enable": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "acl.policies.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "acl.policies.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "acl.policies.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "acl.requests.approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                    mode?: "once" | "day" | "forever";
                    platform?: string;
                    reason?: string;
                    responder?: string;
                    responseChannel?: string;
                    session?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            grantId?: string | null;
                            /** @constant */
                            ok: true;
                            request: {
                                context?: unknown;
                                /** Format: int64 */
                                createdAtMs: number;
                                /** Format: int64 */
                                expiresAtMs: number;
                                grantId?: string | null;
                                id: string;
                                kind?: string | null;
                                nexusRequestId?: string | null;
                                reason?: string | null;
                                requesterChannel?: string | null;
                                requesterId?: string | null;
                                resources: string[];
                                responder?: string | null;
                                /** Format: int64 */
                                responseAtMs?: number | null;
                                responseChannel?: string | null;
                                sessionId?: string | null;
                                status: "pending" | "approved" | "denied" | "expired";
                                summary?: string | null;
                                toolCallId?: string | null;
                                toolName?: string | null;
                            };
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "acl.requests.deny": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                    responder?: string;
                    responseChannel?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            /** @constant */
                            ok: true;
                            request: {
                                context?: unknown;
                                /** Format: int64 */
                                createdAtMs: number;
                                /** Format: int64 */
                                expiresAtMs: number;
                                grantId?: string | null;
                                id: string;
                                kind?: string | null;
                                nexusRequestId?: string | null;
                                reason?: string | null;
                                requesterChannel?: string | null;
                                requesterId?: string | null;
                                resources: string[];
                                responder?: string | null;
                                /** Format: int64 */
                                responseAtMs?: number | null;
                                responseChannel?: string | null;
                                sessionId?: string | null;
                                status: "pending" | "approved" | "denied" | "expired";
                                summary?: string | null;
                                toolCallId?: string | null;
                                toolName?: string | null;
                            };
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "acl.requests.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    includeExpired?: boolean;
                    limit?: number;
                    offset?: number;
                    requesterId?: string;
                    status?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            requests: {
                                context?: unknown;
                                /** Format: int64 */
                                createdAtMs: number;
                                /** Format: int64 */
                                expiresAtMs: number;
                                grantId?: string | null;
                                id: string;
                                kind?: string | null;
                                nexusRequestId?: string | null;
                                reason?: string | null;
                                requesterChannel?: string | null;
                                requesterId?: string | null;
                                resources: string[];
                                responder?: string | null;
                                /** Format: int64 */
                                responseAtMs?: number | null;
                                responseChannel?: string | null;
                                sessionId?: string | null;
                                status: "pending" | "approved" | "denied" | "expired";
                                summary?: string | null;
                                toolCallId?: string | null;
                                toolName?: string | null;
                            }[];
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "acl.requests.show": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            request: {
                                context?: unknown;
                                /** Format: int64 */
                                createdAtMs: number;
                                /** Format: int64 */
                                expiresAtMs: number;
                                grantId?: string | null;
                                id: string;
                                kind?: string | null;
                                nexusRequestId?: string | null;
                                reason?: string | null;
                                requesterChannel?: string | null;
                                requesterId?: string | null;
                                resources: string[];
                                responder?: string | null;
                                /** Format: int64 */
                                responseAtMs?: number | null;
                                responseChannel?: string | null;
                                sessionId?: string | null;
                                status: "pending" | "approved" | "denied" | "expired";
                                summary?: string | null;
                                toolCallId?: string | null;
                                toolName?: string | null;
                            };
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "adapter.connections.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "adapter.health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "adapter.info": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "adapter.monitor.start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "adapter.monitor.stop": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "adapter.serve.start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "adapter.setup.cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "adapter.setup.start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "adapter.setup.status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "adapter.setup.submit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "adapters.connections.backfill": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    connectionId: string;
                    since: string;
                    to?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            account?: string;
                            connectionId: string;
                            existing_run?: boolean;
                            job_definition_id: string;
                            job_run_id: string;
                            queue_entry_id: string;
                            service?: string;
                            since: string;
                            status: "queued" | "running";
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "adapters.connections.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    adapter: string;
                    authMethodId?: string;
                    config?: {
                        [key: string]: unknown;
                    };
                    fields: {
                        [key: string]: string;
                    };
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "adapters.connections.credentials.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    connection_id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            adapter: string;
                            authMethodId?: string | null;
                            connection_id: string;
                            credential: {
                                fields: {
                                    [key: string]: string;
                                };
                                metadata?: {
                                    [key: string]: unknown;
                                };
                            };
                            service: string;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "adapters.connections.custom.cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    adapter: string;
                    sessionId: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "adapters.connections.custom.start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    adapter: string;
                    authMethodId?: string;
                    payload?: {
                        [key: string]: unknown;
                    };
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "adapters.connections.custom.status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    adapter: string;
                    sessionId: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "adapters.connections.custom.submit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    adapter: string;
                    payload?: {
                        [key: string]: unknown;
                    };
                    sessionId: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "adapters.connections.disconnect": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    connectionId: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "adapters.connections.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "adapters.connections.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": Record<string, never>;
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            connections: {
                                account?: string | null;
                                adapter: string;
                                auth?: unknown;
                                authMethod: "oauth2" | "api_key" | "file_upload" | "custom_flow" | null;
                                authMethodId?: string | null;
                                connectionId: string;
                                error?: string | null;
                                /** Format: int64 */
                                lastSync?: number | null;
                                metadata?: {
                                    [key: string]: unknown;
                                };
                                name: string;
                                service?: string;
                                status: "connected" | "disconnected" | "error" | "expired";
                                summary?: {
                                    backfill?: {
                                        jobRunId: string;
                                        queueEntryId: string;
                                        status: "queued" | "running";
                                    };
                                    channelCount: number;
                                    contactCount: number;
                                    containers: string[];
                                    /** Format: int64 */
                                    firstRecordAt?: number | null;
                                    /** Format: int64 */
                                    lastRecordAt?: number | null;
                                    participantCount: number;
                                    recordCount: number;
                                    spaces: string[];
                                };
                            }[];
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "adapters.connections.oauth.complete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    adapter: string;
                    code: string;
                    state: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "adapters.connections.oauth.start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    adapter: string;
                    authMethodId?: string;
                    managedProfileId?: string;
                    redirectBaseUrl?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            /** Format: int64 */
                            expiresAt: number;
                            redirectUrl: string;
                            state: string;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "adapters.connections.status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    connectionId: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            account?: string | null;
                            adapter: string;
                            auth?: unknown;
                            authMethod: "oauth2" | "api_key" | "file_upload" | "custom_flow" | null;
                            authMethodId?: string | null;
                            connectionId: string;
                            error?: string | null;
                            /** Format: int64 */
                            lastSync?: number | null;
                            metadata?: {
                                [key: string]: unknown;
                            };
                            name: string;
                            service?: string;
                            status: "connected" | "disconnected" | "error" | "expired";
                            summary?: {
                                backfill?: {
                                    jobRunId: string;
                                    queueEntryId: string;
                                    status: "queued" | "running";
                                };
                                channelCount: number;
                                contactCount: number;
                                containers: string[];
                                /** Format: int64 */
                                firstRecordAt?: number | null;
                                /** Format: int64 */
                                lastRecordAt?: number | null;
                                participantCount: number;
                                recordCount: number;
                                spaces: string[];
                            };
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "adapters.connections.test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    connectionId: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "adapters.connections.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    adapter: string;
                    authMethodId?: string;
                    config?: {
                        [key: string]: unknown;
                    };
                    connectionId: string;
                    fields: {
                        [key: string]: string;
                    };
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "adapters.connections.upload": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    adapter: string;
                    authMethodId?: string;
                    fileName: string;
                    filePath: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "adapters.methods": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "agents.conversations.abort": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "agents.conversations.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "agents.conversations.history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "agents.conversations.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "agents.conversations.search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "agents.conversations.send": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "agents.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    avatar?: string;
                    emoji?: string;
                    name: string;
                    workspace: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            agentId: string;
                            name: string;
                            /** @constant */
                            ok: true;
                            workspace: string;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "agents.delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    agentId: string;
                    deleteFiles?: boolean;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            agentId: string;
                            /** @constant */
                            ok: true;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "agents.files.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    agentId: string;
                    name: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            agentId: string;
                            file: {
                                content?: string;
                                missing: boolean;
                                name: string;
                                path: string;
                                size?: number;
                                /** Format: int64 */
                                updatedAtMs?: number;
                            };
                            workspace: string;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "agents.files.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    agentId: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            agentId: string;
                            files: {
                                content?: string;
                                missing: boolean;
                                name: string;
                                path: string;
                                size?: number;
                                /** Format: int64 */
                                updatedAtMs?: number;
                            }[];
                            workspace: string;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "agents.files.set": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    agentId: string;
                    content: string;
                    name: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            agentId: string;
                            file: {
                                content?: string;
                                missing: boolean;
                                name: string;
                                path: string;
                                size?: number;
                                /** Format: int64 */
                                updatedAtMs?: number;
                            };
                            /** @constant */
                            ok: true;
                            workspace: string;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "agents.identity.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    agentId?: string;
                    sessionId?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            agentId: string;
                            avatar?: string;
                            emoji?: string;
                            name?: string;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "agents.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": Record<string, never>;
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            agents: {
                                id: string;
                                identity?: {
                                    avatar?: string;
                                    avatarUrl?: string;
                                    emoji?: string;
                                    name?: string;
                                    theme?: string;
                                };
                                name?: string;
                            }[];
                            defaultId: string;
                            mainKey: string;
                            scope: "per-sender" | "global";
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "agents.sessions.archive": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    deleteTranscript?: boolean;
                    sessionId: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "agents.sessions.compact": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    maxLines?: number;
                    sessionId: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "agents.sessions.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "agents.sessions.fork": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "agents.sessions.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "agents.sessions.history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "agents.sessions.import.chunk": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    aixSourceId?: string;
                    chunkIndex: number;
                    chunkTotal: number;
                    data: string;
                    /** @constant */
                    encoding: "gzip+base64";
                    idempotencyKey: string;
                    mode: "backfill" | "tail";
                    runId?: string;
                    /** @constant */
                    source: "aix";
                    sourceContactId?: string;
                    sourceEntityId: string;
                    sourceProvider: string;
                    sourceSessionFingerprint: string;
                    sourceSessionId: string;
                    uploadId: string;
                    workspaceId?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "agents.sessions.import.execute": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    aixSourceId?: string;
                    idempotencyKey: string;
                    items: {
                        artifacts?: {
                            agentPath: string;
                            bytes: number;
                            contentType?: string | null;
                            /** Format: int64 */
                            createdAtMs: number;
                            encoding?: string | null;
                            hostPath: string;
                            id: string;
                            kind: string;
                            metadataJson?: unknown;
                            relativePath?: string | null;
                            sha256?: string | null;
                        }[];
                        /** Format: int64 */
                        importedAtMs: number;
                        messages: {
                            content?: string;
                            contextJson?: unknown;
                            /** Format: int64 */
                            createdAtMs: number;
                            metadataJson?: unknown;
                            role: "user" | "assistant" | "system" | "tool";
                            sequence: number;
                            sourceMessageId: string;
                            sourceTurnId?: string;
                            thinking?: string;
                        }[];
                        session: {
                            /** Format: int64 */
                            createdAtMs?: number;
                            isSubagent?: boolean;
                            metadata?: {
                                [key: string]: unknown;
                            };
                            model?: string;
                            parentSourceMessageId?: string;
                            parentSourceSessionId?: string;
                            project?: string;
                            provider?: string;
                            spawnToolCallId?: string;
                            taskDescription?: string;
                            taskStatus?: string;
                            /** Format: int64 */
                            updatedAtMs?: number;
                            workspacePath?: string;
                        };
                        sourceProvider: string;
                        sourceSessionFingerprint: string;
                        sourceSessionId: string;
                        systemContextProfiles?: {
                            contextJson?: unknown;
                            /** Format: int64 */
                            createdAtMs: number;
                            hash: string;
                            id: string;
                            metadataJson?: unknown;
                            systemPrompt: string;
                            /** Format: int64 */
                            updatedAtMs: number;
                        }[];
                        toolCalls?: {
                            /** Format: int64 */
                            completedAtMs?: number;
                            error?: string;
                            paramsJson?: unknown;
                            resultArtifactId?: string;
                            resultJson?: unknown;
                            resultPreviewText?: string;
                            sequence: number;
                            sourceMessageId?: string;
                            sourceToolCallId: string;
                            sourceTurnId?: string;
                            spawnedSourceSessionId?: string;
                            /** Format: int64 */
                            startedAtMs: number;
                            status?: "pending" | "running" | "completed" | "failed";
                            toolName: string;
                            toolNumber?: number;
                        }[];
                        turns: {
                            cachedInputTokens?: number;
                            cacheWriteTokens?: number;
                            /** Format: int64 */
                            completedAtMs?: number;
                            inputArtifactId?: string;
                            inputTokens?: number;
                            metadata?: {
                                [key: string]: unknown;
                            };
                            model?: string;
                            outputArtifactId?: string;
                            outputTokens?: number;
                            parentSourceTurnId?: string;
                            provider?: string;
                            queryMessageSourceIds?: string[];
                            reasoningTokens?: number;
                            responseMessageSourceId?: string;
                            sourceTurnId: string;
                            /** Format: int64 */
                            startedAtMs: number;
                            systemContextProfileId?: string;
                            totalTokens?: number;
                        }[];
                    }[];
                    mode: "backfill" | "tail";
                    runId?: string;
                    /** @constant */
                    source: "aix";
                    sourceContactId?: string;
                    sourceEntityId: string;
                    workspaceId?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "agents.sessions.imports.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    aixSourceId?: string;
                    cursor?: string;
                    limit?: number;
                    sourceEntityId?: string;
                    sourceProvider?: string;
                    workspaceId: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["SessionsImportsListResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "agents.sessions.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    activeMinutes?: number;
                    agentId?: string;
                    includeDerivedTitles?: boolean;
                    includeGlobal?: boolean;
                    includeLastMessage?: boolean;
                    includeUnknown?: boolean;
                    limit?: number;
                    parentSessionId?: string;
                    search?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["AgentsSessionsListResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "agents.sessions.patch": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    elevatedLevel?: string | null;
                    entity_id?: string | null;
                    execAsk?: string | null;
                    execHost?: string | null;
                    execNode?: string | null;
                    execSecurity?: string | null;
                    execution_host_config_json?: unknown | null;
                    execution_host_kind?: "host.runtime" | "host.node" | "sandbox" | null;
                    groupActivation?: "mention" | "always" | null;
                    label?: string | null;
                    model?: string | null;
                    model_config_id?: string | null;
                    parentSessionId?: string | null;
                    reasoningLevel?: string | null;
                    responseUsage?: "off" | "tokens" | "full" | "on" | null;
                    role_config_id?: string | null;
                    sandbox_id?: string | null;
                    sendPolicy?: "allow" | "deny" | null;
                    session_id: string;
                    thinkingLevel?: string | null;
                    verboseLevel?: string | null;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "agents.sessions.preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    keys: string[];
                    limit?: number;
                    maxChars?: number;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["AgentsSessionsPreviewResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "agents.sessions.reset": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    sessionId: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "agents.sessions.resolve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    agentId?: string;
                    includeGlobal?: boolean;
                    includeUnknown?: boolean;
                    key?: string;
                    parentSessionId?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["AgentsSessionsResolveResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "agents.sessions.send": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    attachments?: unknown[];
                    deliver?: boolean;
                    idempotency_key: string;
                    message: string;
                    sessionId?: string;
                    thinking?: string;
                    timeout_ms?: number;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "agents.sessions.transfer": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "agents.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    agentId: string;
                    avatar?: string;
                    model?: string;
                    name?: string;
                    workspace?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            agentId: string;
                            /** @constant */
                            ok: true;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "agents.wait": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    runId: string;
                    timeoutMs?: number;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "apps.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["AppsGetResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "apps.install": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "apps.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": Record<string, never>;
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            apps: components["schemas"]["AppsAppSummarySchema"][];
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "apps.logs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "apps.methods": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["AppsMethodsResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "apps.start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "apps.status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["AppsStatusResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "apps.stop": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "apps.uninstall": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "auth.login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    password: string;
                    username: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["AuthLoginResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "auth.tokens.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    entityId: string;
                    /** Format: int64 */
                    expiresAt?: number | null;
                    label?: string | null;
                    role?: string;
                    scopes?: string[];
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            credential: {
                                /** Format: int64 */
                                createdAt: number;
                                entityId: string;
                                /** Format: int64 */
                                expiresAt?: number | null;
                                id: string;
                                label?: string | null;
                                /** Format: int64 */
                                lastUsedAt?: number | null;
                                /** Format: int64 */
                                revokedAt?: number | null;
                                role: string;
                                scopes: string[];
                            };
                            /** @constant */
                            ok: true;
                            token: string;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "auth.tokens.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    entityId?: string;
                    includeExpired?: boolean;
                    includeRevoked?: boolean;
                    limit?: number;
                    offset?: number;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            credentials: {
                                /** Format: int64 */
                                createdAt: number;
                                entityId: string;
                                /** Format: int64 */
                                expiresAt?: number | null;
                                id: string;
                                label?: string | null;
                                /** Format: int64 */
                                lastUsedAt?: number | null;
                                /** Format: int64 */
                                revokedAt?: number | null;
                                role: string;
                                scopes: string[];
                            }[];
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "auth.tokens.revoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            /** @constant */
                            ok: true;
                            revoked: boolean;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "auth.tokens.rotate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    /** Format: int64 */
                    expiresAt?: number | null;
                    id: string;
                    label?: string | null;
                    role?: string;
                    scopes?: string[];
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            credential: {
                                /** Format: int64 */
                                createdAt: number;
                                entityId: string;
                                /** Format: int64 */
                                expiresAt?: number | null;
                                id: string;
                                label?: string | null;
                                /** Format: int64 */
                                lastUsedAt?: number | null;
                                /** Format: int64 */
                                revokedAt?: number | null;
                                role: string;
                                scopes: string[];
                            };
                            /** @constant */
                            ok: true;
                            previousId: string;
                            token: string;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "auth.users.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    displayName?: string;
                    entityId?: string;
                    isOwner?: boolean;
                    password: string;
                    relationship?: string;
                    tags?: string[];
                    username: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            /** @constant */
                            ok: true;
                            user: {
                                displayName?: string;
                                entityId: string;
                                isOwner: boolean;
                                relationship?: string;
                                tags?: string[];
                                username: string;
                            };
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "auth.users.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": Record<string, never>;
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            users: {
                                displayName?: string;
                                entityId: string;
                                isOwner: boolean;
                                relationship?: string;
                                tags?: string[];
                                username: string;
                            }[];
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "auth.users.setPassword": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    entityId?: string;
                    password: string;
                    username?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            /** @constant */
                            ok: true;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "browser.request": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "channels.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    connection_id: string;
                    container_id: string;
                    container_kind: string;
                    container_name?: string;
                    id?: string;
                    metadata?: {
                        [key: string]: unknown;
                    };
                    metadata_json?: string;
                    platform: string;
                    space_id?: string;
                    space_name?: string;
                    thread_id?: string;
                    thread_name?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["ChannelsGetResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "channels.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["ChannelsGetResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "channels.history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    channel_id?: string;
                    id?: string;
                    limit?: number;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["ChannelsHistoryResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "channels.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    connection_id?: string;
                    container_kind?: string;
                    limit?: number;
                    offset?: number;
                    platform?: string;
                    space_id?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["ChannelsListResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "channels.participants.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["ChannelsParticipantsGetResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "channels.participants.history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    channel_id: string;
                    limit?: number;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["ChannelsParticipantsHistoryResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "channels.participants.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    channel_id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["ChannelsParticipantsListResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "channels.resolve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    channel_id?: string;
                    connection_id?: string;
                    container_id?: string;
                    container_kind?: string;
                    container_name?: string;
                    id?: string;
                    materialize?: boolean;
                    materialize_if_missing?: boolean;
                    metadata?: {
                        [key: string]: unknown;
                    };
                    metadata_json?: string;
                    platform?: string;
                    space_id?: string;
                    space_name?: string;
                    thread_id?: string;
                    thread_name?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["ChannelsResolveResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "channels.search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    connection_id?: string;
                    limit?: number;
                    platform?: string;
                    query?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            channels: components["schemas"]["ChannelRowSchema"][];
                            limit: number;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "channels.status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    probe?: boolean;
                    timeoutMs?: number;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["ChannelsStatusDataResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "channels.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    channel_id?: string;
                    connection_id?: string;
                    container_id?: string;
                    container_kind?: string;
                    container_name?: string;
                    id?: string;
                    metadata?: {
                        [key: string]: unknown;
                    };
                    metadata_json?: string;
                    platform?: string;
                    space_id?: string;
                    space_name?: string;
                    thread_id?: string;
                    thread_name?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["ChannelsMutationResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "config.apply": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    baseHash?: string;
                    note?: string;
                    raw: string;
                    restartDelayMs?: number;
                    sessionId?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["ConfigWriteResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "config.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": Record<string, never>;
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["ConfigFileSnapshotSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "config.patch": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    baseHash?: string;
                    note?: string;
                    raw: string;
                    restartDelayMs?: number;
                    sessionId?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["ConfigWriteResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "config.schema": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": Record<string, never>;
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            generatedAt: string;
                            schema: unknown;
                            uiHints: {
                                [key: string]: {
                                    advanced?: boolean;
                                    group?: string;
                                    help?: string;
                                    itemTemplate?: unknown;
                                    label?: string;
                                    order?: number;
                                    placeholder?: string;
                                    sensitive?: boolean;
                                };
                            };
                            version: string;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "config.set": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    baseHash?: string;
                    raw: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["ConfigWriteResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "contacts.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    avatar_url?: string;
                    contact_id: string;
                    contact_name?: string;
                    entity_id: string;
                    origin: string;
                    platform: string;
                    space_id?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["ContactMutationResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "contacts.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["ContactGetResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "contacts.history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    contact_id: string;
                    platform: string;
                    space_id?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["ContactsHistoryResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "contacts.import": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    contacts: {
                        avatar_url?: string;
                        contact_id: string;
                        contact_name?: string;
                        entity_id: string;
                        origin: string;
                        platform: string;
                        space_id?: string;
                    }[];
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["ContactsImportResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "contacts.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    entity_id?: string;
                    limit?: number;
                    offset?: number;
                    origin?: string;
                    platform?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["ContactsListResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "contacts.search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    entity_id?: string;
                    limit?: number;
                    name?: string;
                    offset?: number;
                    platform?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["ContactsListResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "contacts.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    avatar_url?: string;
                    contact_name?: string;
                    entity_id?: string;
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["ContactMutationResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "credentials.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    account: string;
                    entityId?: string;
                    expiresAt?: number;
                    label?: string;
                    metadata?: {
                        [key: string]: unknown;
                    };
                    secret?: string;
                    service: string;
                    storagePointer?: string;
                    storageType: string;
                    type: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["CredentialsMutationResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "credentials.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["CredentialsGetResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "credentials.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    entityId?: string;
                    limit?: number;
                    offset?: number;
                    service?: string;
                    status?: string;
                    type?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["CredentialsListResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "credentials.resolve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                } | {
                    account: string;
                    service: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["CredentialsResolveResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "credentials.revoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["CredentialsRevokeResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "credentials.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    expiresAt?: number | null;
                    id: string;
                    label?: string;
                    metadata?: {
                        [key: string]: unknown;
                    } | null;
                    secret?: string;
                    status?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["CredentialsMutationResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "credentials.vault.retrieve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    credentialId: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["CredentialsVaultRetrieveResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "credentials.vault.store": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    credentialId: string;
                    secret: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["CredentialsVaultStoreResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "dags.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "dags.delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "dags.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "dags.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "dags.runs.cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "dags.runs.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "dags.runs.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "dags.runs.pause": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "dags.runs.resume": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "dags.runs.start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "dags.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "entities.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    is_agent?: boolean;
                    is_user?: boolean;
                    name: string;
                    normalized?: string;
                    origin?: string;
                    type: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["EntityMutationResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "entities.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["EntityGetResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "entities.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    is_agent?: boolean;
                    is_user?: boolean;
                    limit?: number;
                    merged?: boolean;
                    offset?: number;
                    tags?: string[];
                    type?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["EntitiesListResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "entities.merge.apply": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    source_id: string;
                    target_id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["EntityMergeResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "entities.merge.candidates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    limit?: number;
                    offset?: number;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["EntityMergeCandidatesResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "entities.merge.propose": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    confidence?: number;
                    reason?: string;
                    source_id: string;
                    target_id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["EntityMergeProposeResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "entities.merge.resolve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                    /** @enum {string} */
                    status: "approved" | "rejected";
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["EntityMergeResolveResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "entities.resolve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    entity_id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["EntityResolveResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "entities.tags.add": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    entity_id: string;
                    tag: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["EntityTagAddResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "entities.tags.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    entity_id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["EntityTagsListResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "entities.tags.remove": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    entity_id: string;
                    tag: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["EntityTagRemoveResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "entities.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                    is_agent?: boolean;
                    is_user?: boolean;
                    name?: string;
                    normalized?: string | null;
                    type?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["EntityMutationResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "events.publish": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    properties?: {
                        [key: string]: unknown;
                    };
                    type: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["EventsPublishResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "events.subscribe": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "events.subscriptions.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    enabled?: boolean | number;
                    event_type: string;
                    job_definition_id: string;
                    match?: {
                        [key: string]: unknown;
                    };
                    match_json?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            subscription: {
                                created_at: string;
                                enabled: number;
                                event_type: string;
                                id: string;
                                job_definition_id: string;
                                match_json?: string | null;
                                updated_at: string;
                            };
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "events.subscriptions.delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            deleted: boolean;
                            ok: boolean;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "events.subscriptions.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            subscription: {
                                created_at: string;
                                enabled: number;
                                event_type: string;
                                id: string;
                                job_definition_id: string;
                                match_json?: string | null;
                                updated_at: string;
                            };
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "events.subscriptions.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    enabled?: boolean | number;
                    event_type?: string;
                    job_definition_id?: string;
                    limit?: number;
                    offset?: number;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            subscriptions: {
                                created_at: string;
                                enabled: number;
                                event_type: string;
                                id: string;
                                job_definition_id: string;
                                match_json?: string | null;
                                updated_at: string;
                            }[];
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "events.subscriptions.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    enabled?: boolean | number;
                    event_type?: string;
                    id: string;
                    job_definition_id?: string;
                    match?: {
                        [key: string]: unknown;
                    };
                    match_json?: string | null;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            subscription: {
                                created_at: string;
                                enabled: number;
                                event_type: string;
                                id: string;
                                job_definition_id: string;
                                match_json?: string | null;
                                updated_at: string;
                            };
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "events.unsubscribe": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": Record<string, never>;
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["EventsUnsubscribeResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "groups.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    description?: string | null;
                    name: string;
                    parent_group_id?: string | null;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["GroupMutationResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "groups.delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["GroupDeleteResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "groups.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["GroupGetResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "groups.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    limit?: number;
                    offset?: number;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["GroupsListResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "groups.members.add": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    entity_id: string;
                    group_id: string;
                    role?: string | null;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["GroupMemberMutationResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "groups.members.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    group_id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["GroupMembersListResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "groups.members.remove": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    entity_id: string;
                    group_id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["GroupMemberMutationResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "groups.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    description?: string | null;
                    id: string;
                    name?: string | null;
                    parent_group_id?: string | null;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["GroupMutationResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "jobs.cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    run_id: string;
                } | {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["JobsCancelResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "jobs.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    config_json?: string;
                    created_by?: string;
                    description?: string;
                    hook_points?: string | string[];
                    lane_id?: string;
                    name: string;
                    script_path: string;
                    status?: string;
                    timeout_ms?: number;
                    workspace_id?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["JobMutationResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "jobs.delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["BooleanDeletedResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "jobs.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["JobGetResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "jobs.idempotency.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    active_run_id?: string;
                    job_definition_id?: string;
                    latest_run_id?: string;
                    limit?: number;
                    offset?: number;
                    status?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["JobsIdempotencyListResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "jobs.invoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    available_at?: string;
                    delay_ms?: number;
                    idempotency_key?: string;
                    input?: string | {
                        [key: string]: unknown;
                    };
                    job_id: string;
                    max_attempts?: number;
                    trigger_source?: string;
                    workspace_id?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["JobsInvokeResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "jobs.lanes.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    status?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["JobsLanesListResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "jobs.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    limit?: number;
                    offset?: number;
                    status?: string;
                    workspace_id?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["JobsListResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "jobs.queue.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                } | {
                    job_run_id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["JobsQueueGetResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "jobs.queue.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    job_definition_id?: string;
                    job_run_id?: string;
                    limit?: number;
                    offset?: number;
                    queue_status?: string;
                    source_run_id?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["JobsQueueListResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "jobs.requeue": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    run_id: string;
                } | {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["JobsRequeueResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "jobs.retry": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    run_id: string;
                } | {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["JobsRetryResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "jobs.runs.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["JobRunGetResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "jobs.runs.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    dag_run_id?: string;
                    job_definition_id?: string;
                    job_schedule_id?: string;
                    limit?: number;
                    offset?: number;
                    status?: string;
                    trigger_source?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["JobRunsListResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "jobs.status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": Record<string, never>;
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["JobsStatusResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "jobs.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    config_json?: string;
                    created_by?: string;
                    description?: string;
                    hook_points?: string | string[];
                    id: string;
                    lane_id?: string;
                    name?: string;
                    script_hash?: string;
                    script_path?: string;
                    status?: string;
                    timeout_ms?: number;
                    workspace_id?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["JobMutationResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "logs.tail": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    cursor?: number;
                    limit?: number;
                    maxBytes?: number;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            cursor: number;
                            file: string;
                            lines: string[];
                            reset?: boolean;
                            size: number;
                            truncated?: boolean;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.elements.consolidate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.elements.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.elements.definitions.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.elements.definitions.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.elements.definitions.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.elements.entities.link": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.elements.entities.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.elements.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.elements.links.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.elements.links.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.elements.links.traverse": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.elements.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.elements.resolve_head": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.elements.search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.elements.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.entities.confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.entities.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.entities.propose_merge": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.recall": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.review.entity.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.review.episode.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.review.episode.outputs.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.review.fact.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.review.observation.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.review.quality.items.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.review.quality.summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.review.run.episodes.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.review.run.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.review.runs.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.review.search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.sets.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.sets.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.sets.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.sets.members.add": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "memory.sets.members.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "models.catalog.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "models.catalog.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "models.configs.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "models.configs.delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "models.configs.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "models.configs.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "models.configs.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "models.connections.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "models.connections.disconnect": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "models.connections.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "models.connections.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "models.connections.status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "models.connections.test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "models.connections.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "models.defaults.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "models.defaults.put": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "models.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["ModelsGetResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "models.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": Record<string, never>;
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            models: {
                                contextWindow?: number;
                                id: string;
                                name: string;
                                provider: string;
                                reasoning?: boolean;
                            }[];
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "models.providers.delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "models.providers.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "models.providers.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "models.providers.put": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "models.providers.test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "operator.packages.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "operator.packages.health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "operator.packages.install": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "operator.packages.uninstall": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "operator.packages.upgrade": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "orientation.contracts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "orientation.inventory": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "orientation.schemas": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "orientation.summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "orientation.taxonomy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "productControlPlane.call": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    appId?: string;
                    operation: string;
                    payload?: {
                        [key: string]: unknown;
                    };
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["ProductControlPlaneCallResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "record.ingest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    payload: {
                        attachments?: {
                            content_type: string;
                            filename?: string;
                            id: string;
                            metadata?: {
                                [key: string]: unknown;
                            };
                            path?: string;
                            size_bytes?: number;
                            url?: string;
                        }[];
                        content: string;
                        content_type: "text" | "reaction" | "membership";
                        external_record_id: string;
                        metadata?: {
                            [key: string]: unknown;
                        };
                        recipients?: string[];
                        timestamp: number;
                    };
                    routing: {
                        adapter?: string;
                        connection_id: string;
                        container_id: string;
                        container_kind: "direct" | "group";
                        container_name?: string;
                        metadata?: {
                            [key: string]: unknown;
                        };
                        platform: string;
                        receiver_id?: string;
                        receiver_name?: string;
                        reply_to_id?: string;
                        sender_id: string;
                        sender_name?: string;
                        space_id?: string;
                        space_name?: string;
                        thread_id?: string;
                        thread_name?: string;
                    };
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "records.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["RecordsGetResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "records.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    limit?: number;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["RecordsListResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "records.search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    limit?: number;
                    platform?: string;
                    query?: string;
                    sender_id?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["RecordsListResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "roles.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "roles.delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "roles.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "roles.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "roles.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "runtime.health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    probe?: boolean;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["RuntimeHealthResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "sandboxes.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    backend: "container" | "vm" | "remote_vm";
                    config_json?: {
                        [key: string]: unknown;
                    };
                    id?: string;
                    image?: string;
                    linkage?: {
                        [key: string]: unknown;
                    };
                    mounts?: {
                        read_only?: boolean;
                        source_path: string;
                        target_path: string;
                    }[];
                    profile?: string;
                    workspace_source_path?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["SandboxesGetResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "sandboxes.destroy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["SandboxesGetResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "sandboxes.exec": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    command: string;
                    cwd?: string;
                    env?: {
                        [key: string]: string;
                    };
                    id: string;
                    timeout_ms?: number;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["SandboxesExecResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "sandboxes.fork": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                    image?: string;
                    new_id?: string;
                    profile?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["SandboxesGetResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "sandboxes.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["SandboxesGetResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "sandboxes.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    backend?: string;
                    limit?: number;
                    state?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["SandboxesListResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "sandboxes.resume": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["SandboxesGetResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "sandboxes.retain": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["SandboxesGetResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "schedules.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    active_from?: string;
                    active_until?: string;
                    enabled?: boolean;
                    expression: string;
                    job_definition_id: string;
                    name?: string;
                    timezone?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["ScheduleMutationResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "schedules.delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["BooleanDeletedResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "schedules.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["ScheduleGetResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "schedules.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    enabled?: boolean;
                    job_definition_id?: string;
                    limit?: number;
                    offset?: number;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["SchedulesListResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "schedules.trigger": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                    mode?: "due" | "force";
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["ScheduleTriggerResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "schedules.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    active_from?: string;
                    active_until?: string;
                    enabled?: boolean;
                    expression?: string;
                    id: string;
                    last_run_at?: string;
                    name?: string;
                    timezone?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["ScheduleMutationResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "search.rebuild": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "search.status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "skills.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    agentId?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["SkillsListResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "skills.search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    agentId?: string;
                    query: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["SkillsSearchResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "skills.use": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    agentId?: string;
                    name: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["SkillsUseResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    status: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "system-presence": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "talk.mode": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    enabled: boolean;
                    phase?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["TalkModeResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "tools.catalog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "tools.invoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "update.run": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    note?: string;
                    restartDelayMs?: number;
                    sessionId?: string;
                    timeoutMs?: number;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            [key: string]: unknown;
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "wizard.cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    sessionId: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["WizardCancelResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "wizard.next": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    answer?: {
                        stepId: string;
                        value?: unknown;
                    };
                    sessionId: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            done: boolean;
                            error?: string;
                            status?: "running" | "done" | "cancelled" | "error";
                            step?: {
                                executor?: "runtime" | "client";
                                id: string;
                                initialValue?: unknown;
                                message?: string;
                                options?: {
                                    hint?: string;
                                    label: string;
                                    value: unknown;
                                }[];
                                placeholder?: string;
                                sensitive?: boolean;
                                title?: string;
                                type: "note" | "select" | "text" | "confirm" | "multiselect" | "progress" | "action";
                            };
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "wizard.start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    mode?: "local" | "remote";
                    workspace?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            done: boolean;
                            error?: string;
                            sessionId: string;
                            status?: "running" | "done" | "cancelled" | "error";
                            step?: {
                                executor?: "runtime" | "client";
                                id: string;
                                initialValue?: unknown;
                                message?: string;
                                options?: {
                                    hint?: string;
                                    label: string;
                                    value: unknown;
                                }[];
                                placeholder?: string;
                                sensitive?: boolean;
                                title?: string;
                                type: "note" | "select" | "text" | "confirm" | "multiselect" | "progress" | "action";
                            };
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "wizard.status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    sessionId: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: {
                            error?: string;
                            status: "running" | "done" | "cancelled" | "error";
                        };
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "workspaces.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    name: string;
                    path: string;
                    template?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["WorkspaceCreateResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "workspaces.delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["WorkspaceDeleteResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "workspaces.files.delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    filename: string;
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["WorkspaceFileDeleteResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "workspaces.files.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    filename: string;
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["WorkspaceFileGetResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "workspaces.files.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["WorkspaceFilesListResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "workspaces.files.set": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    content?: string;
                    filename: string;
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["WorkspaceFileSetResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "workspaces.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["WorkspaceDetailResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "workspaces.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    namePattern?: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["WorkspacesListResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "workspaces.manifest.get": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["WorkspaceManifestResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "workspaces.manifest.update": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    id: string;
                    manifest?: {
                        [key: string]: unknown;
                    } | null;
                };
            };
        };
        responses: {
            /** @description Successful runtime operation response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: true;
                        payload?: components["schemas"]["WorkspaceManifestResultSchema"];
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "tools.catalog.alias.tools.catalog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime HTTP alias response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
    "tools.invoke.alias.tools.invoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful runtime HTTP alias response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: components["schemas"]["ErrorShapeSchema"];
                        meta?: {
                            [key: string]: unknown;
                        } | null;
                        /** @enum {boolean} */
                        ok: false;
                    };
                };
            };
        };
    };
}
