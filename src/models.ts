import type { LanguageModel } from 'ai'

type Provider = 'google' | 'openai'

const defaultModels: Record<Provider, string> = {
	google: 'gemini-2.5-flash',
	openai: 'gpt-4o-mini',
}

export async function createModel(
	provider: Provider,
	apiKey: string,
	modelId?: string,
): Promise<LanguageModel> {
	const model = modelId ?? defaultModels[provider]

	switch (provider) {
		case 'google': {
			const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
			return createGoogleGenerativeAI({ apiKey })(model)
		}
		case 'openai': {
			const { createOpenAI } = await import('@ai-sdk/openai')
			return createOpenAI({ apiKey })(model)
		}
	}
}
