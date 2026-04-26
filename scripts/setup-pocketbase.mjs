import process from 'node:process'

const pbUrl = (process.env.PB_URL || process.env.VITE_POCKETBASE_URL || 'http://127.0.0.1:8090').replace(/\/$/, '')
const adminEmail = process.env.PB_ADMIN_EMAIL
const adminPassword = process.env.PB_ADMIN_PASSWORD

if (!adminEmail || !adminPassword) {
  console.error('Missing env vars: PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD are required.')
  process.exit(1)
}

const authEndpoints = ['/api/admins/auth-with-password', '/api/collections/_superusers/auth-with-password']

async function authenticate() {
  let lastError = null
  for (const endpoint of authEndpoints) {
    try {
      const response = await fetch(`${pbUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: adminEmail, password: adminPassword }),
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(`${endpoint} -> ${response.status} ${text}`)
      }
      const json = await response.json()
      if (!json?.token) throw new Error(`${endpoint} -> missing token in response`)
      return json.token
    } catch (error) {
      lastError = error
    }
  }
  throw lastError ?? new Error('Failed to authenticate superuser')
}

async function api(token, path, options = {}) {
  const response = await fetch(`${pbUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`${options.method || 'GET'} ${path} -> ${response.status} ${text}`)
  }
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) return response.json()
  return null
}

function textField(name, required = false) {
  return { name, type: 'text', required }
}

function relationField(name, collectionId, required = false, maxSelect = 1) {
  return {
    name,
    type: 'relation',
    required,
    options: {
      collectionId,
      cascadeDelete: false,
      minSelect: required ? 1 : null,
      maxSelect,
    },
  }
}

function boolField(name, required = false) {
  return { name, type: 'bool', required }
}

function dateField(name, required = false) {
  return { name, type: 'date', required }
}

function jsonField(name, required = false) {
  return { name, type: 'json', required }
}

function fileField(name, maxSelect = 1) {
  return {
    name,
    type: 'file',
    required: false,
    options: {
      mimeTypes: [],
      thumbs: [],
      protected: false,
      maxSelect,
      maxSize: 5 * 1024 * 1024,
    },
  }
}

function mergeFields(existingFields, desiredFields) {
  const existingByName = new Map(existingFields.map((field) => [field.name, field]))
  const merged = [...existingFields]
  for (const desired of desiredFields) {
    if (!existingByName.has(desired.name)) merged.push(desired)
  }
  return merged
}

async function loadCollections(token) {
  const data = await api(token, '/api/collections?perPage=200&page=1')
  return data.items || []
}

async function ensureCollection(token, existingByName, config) {
  const existing = existingByName.get(config.name)
  if (!existing) {
    const created = await api(token, '/api/collections', {
      method: 'POST',
      body: JSON.stringify(config),
    })
    console.log(`Created collection: ${config.name}`)
    return created
  }

  const mergedFields = mergeFields(existing.fields || [], config.fields || [])
  const updated = await api(token, `/api/collections/${existing.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      listRule: config.listRule,
      viewRule: config.viewRule,
      createRule: config.createRule,
      updateRule: config.updateRule,
      deleteRule: config.deleteRule,
      fields: mergedFields,
    }),
  })
  console.log(`Updated collection: ${config.name}`)
  return updated
}

async function main() {
  console.log(`Connecting PocketBase at ${pbUrl}`)
  const token = await authenticate()
  const initialCollections = await loadCollections(token)
  const initialByName = new Map(initialCollections.map((collection) => [collection.name, collection]))

  const usersCollection = initialByName.get('users')
  if (!usersCollection) {
    throw new Error('System collection "users" not found.')
  }

  const usersFields = usersCollection.fields || []
  const hasInstrument = usersFields.some((field) => field.name === 'instrument')
  if (!hasInstrument) {
    await api(token, `/api/collections/${usersCollection.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        fields: [...usersFields, textField('instrument')],
      }),
    })
    console.log('Added users.instrument field')
  } else {
    console.log('users.instrument already exists')
  }

  const bands = await ensureCollection(token, initialByName, {
    name: 'bands',
    type: 'base',
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != ""',
    deleteRule: '@request.auth.id != ""',
    fields: [textField('name', true), textField('description'), relationField('owner', usersCollection.id)],
  })

  const bandsId = bands.id
  const refreshedCollections = await loadCollections(token)
  const refreshedByName = new Map(refreshedCollections.map((collection) => [collection.name, collection]))

  await ensureCollection(token, refreshedByName, {
    name: 'band_members',
    type: 'base',
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != ""',
    deleteRule: '@request.auth.id != ""',
    fields: [
      relationField('band', bandsId, true),
      relationField('user', usersCollection.id, true),
      textField('role'),
      textField('memberName'),
      textField('memberEmail'),
      textField('memberInstrument'),
      fileField('memberAvatar'),
      textField('memberAvatarUrl'),
    ],
  })

  await ensureCollection(token, refreshedByName, {
    name: 'band_data',
    type: 'base',
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != ""',
    deleteRule: '@request.auth.id != ""',
    fields: [relationField('band', bandsId, true), jsonField('payload')],
  })

  await ensureCollection(token, refreshedByName, {
    name: 'band_invites',
    type: 'base',
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != ""',
    deleteRule: '@request.auth.id != ""',
    fields: [
      relationField('band', bandsId, true),
      textField('token', true),
      boolField('isActive'),
      dateField('expiresAt'),
      relationField('invitedBy', usersCollection.id),
    ],
  })

  console.log('PocketBase setup complete.')
}

main().catch((error) => {
  console.error('Setup failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
