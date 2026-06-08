import { openDB } from 'idb'

const DB_NAME = 'kyc-drafts'
const STORE_NAME = 'drafts'

interface KycDraft {
  companyName: string
  taxId: string
  businessType: string
  file?: {
    name: string
    type: string
    data: ArrayBuffer
  }
}

async function getDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE_NAME)
    },
  })
}

export async function saveDraft(cognitoSub: string, draft: KycDraft): Promise<void> {
  const db = await getDB()
  await db.put(STORE_NAME, draft, cognitoSub)
}

export async function loadDraft(cognitoSub: string): Promise<KycDraft | undefined> {
  const db = await getDB()
  return db.get(STORE_NAME, cognitoSub)
}

export async function clearDraft(cognitoSub: string): Promise<void> {
  const db = await getDB()
  await db.delete(STORE_NAME, cognitoSub)
}
