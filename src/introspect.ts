import {
	buildClientSchema,
	getIntrospectionQuery,
	type IntrospectionQuery,
} from 'graphql'

interface CondensedField {
	name: string
	type: string
	isRequired: boolean
}

interface CondensedRelation {
	name: string
	targetEntity: string
	isList: boolean
}

interface CondensedEntity {
	name: string
	fields: CondensedField[]
	relations: CondensedRelation[]
}

interface CondensedEnum {
	name: string
	values: string[]
}

export interface CondensedSchema {
	entities: CondensedEntity[]
	enums: CondensedEnum[]
}

const SCALAR_TYPES = new Set([
	'String',
	'Int',
	'Float',
	'Boolean',
	'ID',
	'DateTime',
	'Date',
	'Json',
	'UUID',
])

const IGNORED_TYPE_PREFIXES = ['_', 'Mutation', 'Query', 'Info', 'S3']
const IGNORED_TYPE_NAMES = new Set([
	'Query',
	'Mutation',
	'Subscription',
	'__Schema',
	'__Type',
	'__Field',
	'__InputValue',
	'__EnumValue',
	'__Directive',
	'S3SignedUpload',
	'S3SignedRead',
	'S3Header',
])

function unwrapType(type: {
	kind: string
	name?: string | null
	ofType?: { kind: string; name?: string | null; ofType?: unknown } | null
}): { name: string; isList: boolean; isRequired: boolean } {
	let isList = false
	let isRequired = false
	let current: typeof type | null = type

	while (current) {
		if (current.kind === 'NON_NULL') {
			isRequired = true
			current = current.ofType as typeof type | null
		} else if (current.kind === 'LIST') {
			isList = true
			current = current.ofType as typeof type | null
		} else {
			return { name: current.name ?? 'Unknown', isList, isRequired }
		}
	}

	return { name: 'Unknown', isList, isRequired }
}

function shouldIncludeType(name: string): boolean {
	if (IGNORED_TYPE_NAMES.has(name)) {
		return false
	}
	for (const prefix of IGNORED_TYPE_PREFIXES) {
		if (name.startsWith(prefix)) {
			return false
		}
	}
	return true
}

function isEntityType(typeName: string, entityTypeNames: Set<string>): boolean {
	return entityTypeNames.has(typeName)
}

export async function introspectAndCondense(
	apiUrl: string,
	token: string,
): Promise<CondensedSchema> {
	const response = await fetch(apiUrl, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify({ query: getIntrospectionQuery() }),
	})

	if (!response.ok) {
		const body = await response.text()
		throw new Error(
			`Introspection failed: ${response.status} ${response.statusText}\n${body.slice(0, 500)}`,
		)
	}

	const text = await response.text()
	let json: { data: IntrospectionQuery }
	try {
		json = JSON.parse(text) as { data: IntrospectionQuery }
	} catch {
		throw new Error(
			`Introspection returned non-JSON response:\n${text.slice(0, 500)}`,
		)
	}
	const schema = buildClientSchema(json.data)
	const typeMap = schema.getTypeMap()

	const objectTypes = Object.values(typeMap).filter(
		(type) =>
			type.constructor.name === 'GraphQLObjectType' &&
			shouldIncludeType(type.name),
	) as Array<import('graphql').GraphQLObjectType>

	const entityTypeNames = new Set(
		objectTypes
			.filter((type) => {
				const fields = type.getFields()
				return 'id' in fields
			})
			.map((type) => type.name),
	)

	const entities: CondensedEntity[] = []

	for (const type of objectTypes) {
		const fields = type.getFields()
		if (!('id' in fields)) {
			continue
		}

		const condensedFields: CondensedField[] = []
		const condensedRelations: CondensedRelation[] = []

		for (const [fieldName, field] of Object.entries(fields)) {
			const unwrapped = unwrapType(field.type.toJSON() as never)

			if (isEntityType(unwrapped.name, entityTypeNames)) {
				condensedRelations.push({
					name: fieldName,
					targetEntity: unwrapped.name,
					isList: unwrapped.isList,
				})
			} else if (
				SCALAR_TYPES.has(unwrapped.name) ||
				unwrapped.name === 'Numeric'
			) {
				condensedFields.push({
					name: fieldName,
					type: unwrapped.name + (unwrapped.isRequired ? '!' : ''),
					isRequired: unwrapped.isRequired,
				})
			} else {
				condensedFields.push({
					name: fieldName,
					type: unwrapped.name + (unwrapped.isRequired ? '!' : ''),
					isRequired: unwrapped.isRequired,
				})
			}
		}

		entities.push({
			name: type.name,
			fields: condensedFields,
			relations: condensedRelations,
		})
	}

	const enumTypes = Object.values(typeMap).filter(
		(type) =>
			type.constructor.name === 'GraphQLEnumType' &&
			shouldIncludeType(type.name),
	) as Array<import('graphql').GraphQLEnumType>

	const enums: CondensedEnum[] = enumTypes.map((enumType) => ({
		name: enumType.name,
		values: enumType.getValues().map((v) => v.name),
	}))

	entities.sort((a, b) => a.name.localeCompare(b.name))
	enums.sort((a, b) => a.name.localeCompare(b.name))

	return { entities, enums }
}

export function formatCondensedSchema(schema: CondensedSchema): string {
	const lines: string[] = []

	lines.push('# Entities\n')

	for (const entity of schema.entities) {
		lines.push(`## ${entity.name}`)

		if (entity.fields.length > 0) {
			const fieldList = entity.fields
				.map((f) => `${f.name}: ${f.type}`)
				.join(', ')
			lines.push(`  Fields: ${fieldList}`)
		}

		if (entity.relations.length > 0) {
			const relList = entity.relations
				.map(
					(r) =>
						`${r.name} -> ${r.isList ? `[${r.targetEntity}]` : r.targetEntity}`,
				)
				.join(', ')
			lines.push(`  Relations: ${relList}`)
		}

		lines.push('')
	}

	if (schema.enums.length > 0) {
		lines.push('# Enums\n')
		for (const enumType of schema.enums) {
			const maxValues = 20
			const values = enumType.values.slice(0, maxValues)
			const suffix =
				enumType.values.length > maxValues
					? `, ... (${enumType.values.length} total)`
					: ''
			lines.push(`${enumType.name}: ${values.join(' | ')}${suffix}`)
		}
	}

	return lines.join('\n')
}
