'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '../../lib/auth-context'
import { apiRequest } from '../../lib/api'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

interface FormRecord {
  id: string
  status: 'pending' | 'under_review' | 'approved' | 'rejected' | 'cancelled'
  companyName: string
  taxId: string
  businessType: string
  fileName: string
  submittedAt: string
  updatedAt: string
}

const STATUS_LABELS: Record<FormRecord['status'], string> = {
  pending: 'รอการตรวจสอบ',
  under_review: 'กำลังตรวจสอบ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ปฏิเสธ',
  cancelled: 'ยกเลิกแล้ว',
}

const STATUS_COLORS: Record<FormRecord['status'], string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  under_review: 'bg-blue-100 text-blue-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600',
}

export default function StatusPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [forms, setForms] = useState<FormRecord[]>([])
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [loading, user, router])

  useEffect(() => {
    if (!user) return

    apiRequest<FormRecord[]>('/api/forms')
      .then(setForms)
      .catch(() => setForms([]))
      .finally(() => setFetching(false))
  }, [user])

  if (loading || (!user && !fetching)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-gray-500">กำลังโหลด...</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">ติดตามสถานะ</h1>
        <Link
          href="/upload"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + ยื่นเอกสารใหม่
        </Link>
      </div>

      {fetching ? (
        <div className="mt-8 text-center text-gray-500">กำลังโหลดข้อมูล...</div>
      ) : forms.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="text-gray-500">ยังไม่มีการยื่นเอกสาร</p>
          <Link href="/upload" className="mt-4 inline-block text-blue-600 hover:underline">
            ยื่นเอกสารเลย
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {forms.map((form) => (
            <div
              key={form.id}
              className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold text-gray-900">{form.companyName}</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    TAX ID: {form.taxId} · {form.businessType}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[form.status]}`}
                >
                  {STATUS_LABELS[form.status]}
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
                <span>
                  ส่งเมื่อ{' '}
                  {new Date(form.submittedAt).toLocaleDateString('th-TH', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <a
                  href={`${API}/api/forms/${form.id}/file`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  ดูไฟล์แนบ
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
