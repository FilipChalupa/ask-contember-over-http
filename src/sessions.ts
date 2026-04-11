import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ModelMessage } from 'ai'

const sessionsDir = process.env.SESSIONS_DIR ?? './sessions'

const sessionPath = (sessionId: string) =>
	join(sessionsDir, `${sessionId}.json`)

export async function loadSession(sessionId: string): Promise<ModelMessage[]> {
	try {
		const data = await readFile(sessionPath(sessionId), 'utf-8')
		return JSON.parse(data) as ModelMessage[]
	} catch {
		return []
	}
}

export async function saveSession(
	sessionId: string,
	messages: ModelMessage[],
): Promise<void> {
	await mkdir(sessionsDir, { recursive: true })
	await writeFile(sessionPath(sessionId), JSON.stringify(messages))
}
