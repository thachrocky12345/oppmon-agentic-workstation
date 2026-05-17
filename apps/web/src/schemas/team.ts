// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Team form validation schemas
 *
 * Uses Zod for client and server-side validation.
 */

import { z } from 'zod'

export const createTeamSchema = z.object({
  name: z.string()
    .min(1, 'Team name is required')
    .max(100, 'Team name must be under 100 characters')
    .regex(/^[a-zA-Z0-9\s-]+$/, 'Only letters, numbers, spaces, and hyphens allowed'),
  description: z.string().max(500, 'Description must be under 500 characters').optional(),
})

export const updateTeamSchema = z.object({
  name: z.string()
    .min(1, 'Team name is required')
    .max(100, 'Team name must be under 100 characters')
    .regex(/^[a-zA-Z0-9\s-]+$/, 'Only letters, numbers, spaces, and hyphens allowed')
    .optional(),
  description: z.string().max(500, 'Description must be under 500 characters').optional(),
})

export const addMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['admin', 'member'], {
    required_error: 'Please select a role',
  }),
})

export const changeMemberRoleSchema = z.object({
  role: z.enum(['admin', 'member'], {
    required_error: 'Please select a role',
  }),
})

// Type exports
export type CreateTeamInput = z.infer<typeof createTeamSchema>
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>
export type AddMemberInput = z.infer<typeof addMemberSchema>
export type ChangeMemberRoleInput = z.infer<typeof changeMemberRoleSchema>
