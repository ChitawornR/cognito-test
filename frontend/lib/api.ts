const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

export async function apiRequest<T = unknown>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(body.error ?? `HTTP ${response.status}`)
  }

  return response.json() as Promise<T>
}

export async function apiUpload<T = unknown>(
  path: string,
  formData: FormData
): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Upload failed' }))
    throw new Error(body.error ?? `HTTP ${response.status}`)
  }

  return response.json() as Promise<T>
}
