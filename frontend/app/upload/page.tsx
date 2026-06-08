'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../lib/auth-context'
import { apiUpload } from '../../lib/api'
import { saveDraft, loadDraft, clearDraft } from '../../lib/indexeddb'

const BUSINESS_TYPES = [
  'บริษัทจำกัด',
  'บริษัทมหาชนจำกัด',
  'ห้างหุ้นส่วนจำกัด',
  'ห้างหุ้นส่วนสามัญ',
  'บุคคลธรรมดา',
  'อื่นๆ',
]

export default function UploadPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [companyName, setCompanyName] = useState('')
  const [taxId, setTaxId] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [draftLoaded, setDraftLoaded] = useState(false)

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [loading, user, router])

  // Load draft from IndexedDB on mount
  useEffect(() => {
    if (!user || draftLoaded) return

    async function restore() {
      if (!user) return
      const draft = await loadDraft(user.cognitoSub)
      if (!draft) {
        setDraftLoaded(true)
        return
      }
      setCompanyName(draft.companyName)
      setTaxId(draft.taxId)
      setBusinessType(draft.businessType)

      if (draft.file) {
        const blob = new Blob([draft.file.data], { type: draft.file.type })
        const file = new File([blob], draft.file.name, { type: draft.file.type })
        setSelectedFile(file)
        setPreviewUrl(URL.createObjectURL(blob))
      }
      setDraftLoaded(true)
    }
    restore()
  }, [user, draftLoaded])

  // Save draft whenever fields change
  useEffect(() => {
    if (!user || !draftLoaded) return

    async function persist() {
      if (!user) return
      const draftFile = selectedFile
        ? {
            name: selectedFile.name,
            type: selectedFile.type,
            data: await selectedFile.arrayBuffer(),
          }
        : undefined

      await saveDraft(user.cognitoSub, {
        companyName,
        taxId,
        businessType,
        file: draftFile,
      })
    }
    persist()
  }, [companyName, taxId, businessType, selectedFile, user, draftLoaded])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !selectedFile) return

    setError('')
    setSubmitting(true)

    try {
      const formData = new FormData()
      formData.append('companyName', companyName)
      formData.append('taxId', taxId)
      formData.append('businessType', businessType)
      formData.append('file', selectedFile)

      await apiUpload('/api/forms', formData)
      await clearDraft(user.cognitoSub)
      router.push('/status')
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-gray-500">กำลังโหลด...</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-bold text-gray-900">ยื่นเอกสาร KYC</h1>
      <p className="mt-2 text-sm text-gray-600">
        กรอกข้อมูลบริษัทและอัปโหลดสำเนาบัตรประชาชน
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            ชื่อบริษัท <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="เช่น บริษัท ABC จำกัด"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            เลขประจำตัวผู้เสียภาษี (TAX ID) <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={taxId}
            onChange={(e) => setTaxId(e.target.value.replace(/\D/g, '').slice(0, 13))}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="13 หลัก"
            maxLength={13}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            ประเภทธุรกิจ <span className="text-red-500">*</span>
          </label>
          <select
            required
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">เลือกประเภทธุรกิจ</option>
            {BUSINESS_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            ไฟล์บัตรประชาชน <span className="text-red-500">*</span>
          </label>
          <div
            className="mt-1 cursor-pointer rounded-md border-2 border-dashed border-gray-300 p-6 text-center hover:border-blue-400"
            onClick={() => fileInputRef.current?.click()}
          >
            {previewUrl ? (
              <div className="space-y-2">
                <img
                  src={previewUrl}
                  alt="ID card preview"
                  className="mx-auto max-h-40 rounded object-contain"
                />
                <p className="text-xs text-gray-500">{selectedFile?.name}</p>
                <p className="text-xs text-blue-600">คลิกเพื่อเปลี่ยนไฟล์</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-3xl">📎</div>
                <p className="text-sm text-gray-600">คลิกเพื่อเลือกไฟล์</p>
                <p className="text-xs text-gray-400">PNG, JPG ขนาดไม่เกิน 5MB</p>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting || !selectedFile}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'กำลังส่ง...' : 'ส่งเอกสาร'}
        </button>
      </form>
    </div>
  )
}
