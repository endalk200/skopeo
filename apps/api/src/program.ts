import { Layer } from "effect";
import { makeServerLayer } from "./http/server.js";

export const program = makeServerLayer().pipe(Layer.launch);
