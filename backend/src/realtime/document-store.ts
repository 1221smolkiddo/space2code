import type { SupabaseClient } from '@supabase/supabase-js'

export interface DocumentStore {
  load(documentName: string): Promise<Uint8Array | null>
  store(documentName: string, state: Uint8Array): Promise<void>
  history(documentName: string, limit: number): Promise<DocumentRevision[]>
}

export interface DocumentRevision { capturedAt: string; state: Uint8Array }

export class SupabaseDocumentStore implements DocumentStore {
  constructor(private readonly client: SupabaseClient) {}

  async load(documentName: string): Promise<Uint8Array | null> {
    const { data, error } = await this.client.rpc('space2code_load_document', { p_document_name: documentName })
    if (error) throw error
    if (typeof data !== 'string') return null
    return Uint8Array.from(Buffer.from(data, 'base64'))
  }

  async store(documentName: string, state: Uint8Array): Promise<void> {
    const { error } = await this.client.rpc('space2code_store_document', {
      p_document_name: documentName,
      p_state_base64: Buffer.from(state).toString('base64'),
    })
    if (error) throw error
  }

  async history(documentName: string, limit: number): Promise<DocumentRevision[]> {
    const { data, error } = await this.client.rpc('space2code_document_history', { p_document_name: documentName, p_limit: limit })
    if (error) throw error
    if (!Array.isArray(data)) return []
    return data.map((row: { captured_at: string; y_state_base64: string }) => ({ capturedAt: row.captured_at, state: Uint8Array.from(Buffer.from(row.y_state_base64, 'base64')) }))
  }
}

export class InMemoryDocumentStore implements DocumentStore {
  private readonly documents = new Map<string, Uint8Array>()
  private readonly revisions = new Map<string, DocumentRevision[]>()

  async load(documentName: string): Promise<Uint8Array | null> {
    const state = this.documents.get(documentName)
    return state ? new Uint8Array(state) : null
  }

  async store(documentName: string, state: Uint8Array): Promise<void> {
    this.documents.set(documentName, new Uint8Array(state))
    const entries = this.revisions.get(documentName) ?? []
    entries.push({ capturedAt: new Date().toISOString(), state: new Uint8Array(state) })
    this.revisions.set(documentName, entries)
  }

  async history(documentName: string, limit: number): Promise<DocumentRevision[]> {
    return (this.revisions.get(documentName) ?? []).slice(-limit).map((entry) => ({ capturedAt: entry.capturedAt, state: new Uint8Array(entry.state) }))
  }
}
