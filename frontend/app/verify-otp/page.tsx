'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiRequest } from '../../lib/api'

function VerifyOtpForm() {
  const router = useRouter()
  const params = useSearchParams()
  const email = params.get('email') ?? ''
  const context = params.get('context') ?? 'login'
  const session = params.get('session') ?? ''

  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (context === 'register') {
        await apiRequest('/api/auth/verify-email', {
          method: 'POST',
          body: JSON.stringify({ email, code }),
        })
        router.push('/login')
      } else {
        await apiRequest('/api/auth/verify-login-otp', {
          method: 'POST',
          body: JSON.stringify({ email, code, session }),
        })
        router.push('/')
      }
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const isRegister = context === 'register'

  return (
    <div className="mx-auto mt-20 max-w-sm px-6">
      <h1 className="text-2xl font-bold text-gray-900">
        {isRegister ? 'ยืนยัน Email' : 'ยืนยันตัวตน'}
      </h1>
      <p className="mt-2 text-sm text-gray-600">
        ระบบส่งรหัส OTP ไปที่{' '}
        <span className="font-medium text-gray-900">{email}</span>
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">รหัส OTP</label>
          <input
            type="text"
            required
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-center text-lg tracking-widest focus:border-blue-500 focus:outline-none"
          />
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || code.length < 6}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'กำลังตรวจสอบ...' : 'ยืนยัน'}
        </button>
      </form>
    </div>
  )
}

export default function VerifyOtpPage() {
  return (
    <Suspense>
      <VerifyOtpForm />
    </Suspense>
  )
}
