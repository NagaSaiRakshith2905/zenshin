import type { z } from "zod";
import type { commands, Command } from "@/lib/contracts/work";
import type { Actor } from "@/server/auth/access";
import type { DatabaseExecutor } from "@/server/db";
import type { Graph } from "./graph";
export type Input<K extends Command> = z.infer<typeof commands[K]>;
export type Context = { db: DatabaseExecutor; actor: Actor; graph: Graph; requestId: string };
export type Handlers = { [K in Command]: (context: Context, input: Input<K>) => Promise<unknown> };
