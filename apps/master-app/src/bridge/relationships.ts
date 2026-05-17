import {
  entityKindSchema,
  relationTypeSchema,
  relationshipSchema,
  type Relationship,
} from '@amber/shared';
import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';

import { parseBridgeInput } from './parse-bridge-input.js';

type CampaignId = Relationship['campaignId'];
type RelationshipId = Relationship['id'];

const createRelationshipInputSchema = z.object({
  campaignId: z.string().min(1),
  fromKind: entityKindSchema,
  fromId: z.string().min(1),
  toKind: entityKindSchema,
  toId: z.string().min(1),
  relationType: relationTypeSchema,
  strength: z.number().int().min(-100).max(100).default(0),
  bidirectional: z.boolean().default(false),
  description: z.string().nullable().optional(),
});

const updateRelationshipInputSchema = createRelationshipInputSchema
  .omit({ campaignId: true })
  .extend({ id: z.string().min(1) });

export type CreateRelationshipInput = z.infer<typeof createRelationshipInputSchema>;
export type UpdateRelationshipInput = z.infer<typeof updateRelationshipInputSchema>;

export { entityKindSchema, relationTypeSchema };

function parse(raw: unknown): Relationship {
  return relationshipSchema.parse(raw);
}

export async function listRelationships(campaignId: CampaignId): Promise<Relationship[]> {
  const raw = await invoke<unknown[]>('list_relationships', { campaignId });
  return raw.map(parse);
}

export async function getRelationship(id: RelationshipId): Promise<Relationship | null> {
  const raw: unknown = await invoke('get_relationship', { id });
  return raw === null ? null : parse(raw);
}

export async function createRelationship(input: CreateRelationshipInput): Promise<Relationship> {
  const payload = parseBridgeInput(createRelationshipInputSchema, input);
const raw = await invoke<unknown>('create_relationship', { input: payload });
  return parse(raw);
}

export async function updateRelationship(input: UpdateRelationshipInput): Promise<Relationship> {
  const payload = parseBridgeInput(updateRelationshipInputSchema, input);
const raw = await invoke<unknown>('update_relationship', { input: payload });
  return parse(raw);
}

export async function deleteRelationship(id: RelationshipId): Promise<void> {
  return invoke<void>('delete_relationship', { id });
}
