import { forwardToServer } from "../_shared/server-proxy.ts";

Deno.serve((request) => forwardToServer(request, "/api/mobile/device-token-ios"));
