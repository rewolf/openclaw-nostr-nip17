import { z } from "zod";

const allowFromEntry = z.union([z.string(), z.number()]);

export const ReactionToggleSchema = z.object({
  receipt: z.boolean().optional(),
  onReplyStart: z.boolean().optional(),
  onToolStart: z.boolean().optional(),
  onPlanUpdate: z.boolean().optional(),
  onCompactionStart: z.boolean().optional(),
});

/** Per-account config (also doubles as top-level base config). */
export const Nip17AccountConfigSchema = z.object({
  name: z.string().optional(),
  enabled: z.boolean().optional(),
  privateKey: z.string().optional(),
  relays: z.array(z.string()).optional(),
  dmPolicy: z.enum(["pairing", "allowlist", "open", "disabled"]).optional(),
  allowFrom: z.array(allowFromEntry).optional(),
  groupAllowFrom: z.array(allowFromEntry).optional(),
  reactionToggle: ReactionToggleSchema.optional(),
});

export const Nip17ConfigSchema = Nip17AccountConfigSchema.extend({
  accounts: z.record(z.string(), Nip17AccountConfigSchema).optional(),
});

export type Nip17AccountConfig = z.infer<typeof Nip17AccountConfigSchema>;
export type Nip17Config = z.infer<typeof Nip17ConfigSchema>;
