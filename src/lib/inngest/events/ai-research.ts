import { z } from "zod";

export const AI_RESEARCH_REQUESTED_EVENT = "gp/ai.research-job.requested" as const;

export const aiResearchRequestedEventDataSchema = z.object({ jobId: z.string().uuid() }).strict();

export type AiResearchRequestedEventData = z.infer<typeof aiResearchRequestedEventDataSchema>;
