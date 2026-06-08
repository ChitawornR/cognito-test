'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'

export default function Navbar() {
  const { user, loading, logout } = useAuth()
  const router = useRouter()

  async function handleLogout() {
    await logout()
    router.push('/')
  }

  return (
    <nav className="w-full border-b border-gray-200 bg-white px-6 py-4">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <Link href="/" className="text-xl font-bold text-blue-600">
          KYC Platform
        </Link>

        {!loading && (
          <div className="flex items-center gap-6">
            {user ? (
              <>
                <Link
                  href="/upload"
                  className="text-sm font-medium text-gray-700 hover:text-blue-600"
                >
                  Upload File
                </Link>
                <Link
                  href="/status"
                  className="text-sm font-medium text-gray-700 hover:text-blue-600"
                >
                  ติดตามสถานะ
                </Link>
                <button
                  onClick={handleLogout}
                  className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm font-medium text-gray-700 hover:text-blue-600"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Register
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}
