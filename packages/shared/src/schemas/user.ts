import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(100),
  avatarUrl: z.string().url().nullable(),
  demoMode: z.boolean().default(false),
  timezone: z.string().default('America/Los_Angeles'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type User = z.infer<typeof UserSchema>;

export const UserPublicSchema = UserSchema.pick({
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  demoMode: true,
  timezone: true,
});

export type UserPublic = z.infer<typeof UserPublicSchema>;
