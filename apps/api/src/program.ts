import { Layer } from "effect";

import { ServerLive } from "./http/server.js";

export const program = Layer.launch(ServerLive);
