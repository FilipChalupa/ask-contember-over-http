import { tool } from 'ai'
import { z } from 'zod'

const MAX_RESPONSE_LENGTH = 50_000

export const createExecuteGraphQLTool = (apiUrl: string, token: string) =>
	tool({
		description:
			'Execute a GraphQL query against the Contember content API. Use Contember-style queries: listEntity for lists, getEntity for lookup by unique field, paginateEntity for counts.',
		inputSchema: z.object({
			query: z.string().describe('GraphQL query string'),
			variables: z
				.record(z.unknown())
				.optional()
				.describe('Optional query variables'),
		}),
		execute: async ({ query, variables }) => {
			const response = await fetch(apiUrl, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					Accept: 'application/json',
				},
				body: JSON.stringify({ query, variables: variables ?? {} }),
			})

			if (!response.ok) {
				return {
					error: `HTTP ${response.status}: ${response.statusText}`,
				}
			}

			const json = (await response.json()) as {
				data?: unknown
				errors?: Array<{ message: string }>
			}

			if (json.errors) {
				return {
					error: json.errors.map((e) => e.message).join('\n'),
				}
			}

			const serialized = JSON.stringify(json.data)
			if (serialized.length > MAX_RESPONSE_LENGTH) {
				return {
					data: JSON.parse(serialized.slice(0, MAX_RESPONSE_LENGTH)),
					warning: `Response truncated from ${serialized.length} to ${MAX_RESPONSE_LENGTH} characters. Use more specific queries or add limits.`,
				}
			}

			return json.data
		},
	})
