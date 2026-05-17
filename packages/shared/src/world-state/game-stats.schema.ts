import { z } from 'zod';

const gameStatValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const gameStatsSchema = z.record(gameStatValueSchema).default({});

export type GameStatsRecord = z.infer<typeof gameStatsSchema>;
