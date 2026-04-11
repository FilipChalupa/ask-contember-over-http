import { createServer } from 'node:http'
import { generateText, stepCountIs } from 'ai'
import { z } from 'zod'
import { createExecuteGraphQLTool } from './executeGraphQL.js'
import { formatCondensedSchema, introspectAndCondense } from './introspect.js'
import { createModel } from './models.js'
import { buildSystemPrompt } from './systemPrompt.js'

const env = z
	.object({
		CONTEMBER_CONTENT_API_URL: z.string().url(),
		CONTEMBER_TOKEN: z.string().min(1),
		AI_PROVIDER: z.enum(['google', 'openai']).default('google'),
		AI_API_KEY: z.string().min(1),
		AI_MODEL: z.string().optional(),
		PORT: z.coerce.number().default(3000),
	})
	.parse(process.env)

const {
	CONTEMBER_CONTENT_API_URL: contemberApiUrl,
	CONTEMBER_TOKEN: contemberToken,
	AI_PROVIDER: aiProvider,
	AI_API_KEY: aiApiKey,
	AI_MODEL: aiModelId,
	PORT: port,
} = env

const readBody = (req: import('node:http').IncomingMessage): Promise<string> =>
	new Promise((resolve, reject) => {
		const chunks: Buffer[] = []
		req.on('data', (chunk: Buffer) => chunks.push(chunk))
		req.on('end', () => resolve(Buffer.concat(chunks).toString()))
		req.on('error', reject)
	})

const json = (
	res: import('node:http').ServerResponse,
	data: unknown,
	status = 200,
) => {
	res.writeHead(status, { 'Content-Type': 'application/json' })
	res.end(JSON.stringify(data))
}

// biome-ignore lint/suspicious/noConsole: standalone server logging
console.log(`Introspecting schema from ${contemberApiUrl}...`)
const condensedSchema = await introspectAndCondense(
	contemberApiUrl,
	contemberToken,
)
const schemaText = formatCondensedSchema(condensedSchema)
// biome-ignore lint/suspicious/noConsole: standalone server logging
console.log(
	`Schema loaded: ${condensedSchema.entities.length} entities, ${condensedSchema.enums.length} enums`,
)

const systemPrompt = buildSystemPrompt(schemaText)
const model = await createModel(aiProvider, aiApiKey, aiModelId)
const executeGraphQLTool = createExecuteGraphQLTool(
	contemberApiUrl,
	contemberToken,
)

// biome-ignore lint/suspicious/noConsole: standalone server logging
console.log(`Using model: ${aiProvider}/${aiModelId ?? 'default'}`)

const server = createServer(async (req, res) => {
	const url = new URL(req.url ?? '/', `http://localhost:${port}`)

	if (req.method === 'GET' && url.pathname === '/health') {
		return json(res, {
			status: 'ok',
			entities: condensedSchema.entities.length,
			enums: condensedSchema.enums.length,
			model: aiProvider,
		})
	}

	if (req.method === 'GET' && url.pathname === '/schema') {
		res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
		return res.end(schemaText)
	}

	if (req.method === 'POST' && url.pathname === '/') {
		try {
			const rawBody = await readBody(req)
			const body = JSON.parse(rawBody) as { question?: string }
			const question = body.question

			if (!question || typeof question !== 'string') {
				return json(res, { error: 'Missing "question" field' }, 400)
			}

			// biome-ignore lint/suspicious/noConsole: standalone server logging
			console.log(`Question: ${question}`)

			const result = await generateText({
				model,
				system: systemPrompt,
				prompt: question,
				tools: { executeGraphQL: executeGraphQLTool },
				stopWhen: stepCountIs(5),
			})

			// biome-ignore lint/suspicious/noConsole: standalone server logging
			console.log(
				`Answer (${result.steps.length} steps): ${result.text.slice(0, 100)}...`,
			)

			return json(res, { answer: result.text })
		} catch (error) {
			console.error('Error processing question:', error)
			return json(
				res,
				{ error: error instanceof Error ? error.message : 'Unknown error' },
				500,
			)
		}
	}

	return json(res, { error: 'Not found' }, 404)
})

server.listen(port, () => {
	// biome-ignore lint/suspicious/noConsole: standalone server logging
	console.log(`ask-ai-server listening on http://localhost:${port}`)
})
