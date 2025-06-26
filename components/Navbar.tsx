'use client'

import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'

export default function Navbar() {
  const { data: session, status } = useSession()

  // Handler for the logout button
  const handleLogout = async () => {
    // Call signOut and explicitly tell it to redirect to the /login page
    // The signOut function itself will handle the navigation and session clearing
    await signOut({ callbackUrl: '/login' });
  };

  return (
    <nav className="bg-white shadow-lg">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex justify-between">
          <div className="flex space-x-7">
            <div>
              <Link href="/" className="flex items-center py-4 px-2">
                <span className="font-semibold text-gray-500 text-lg">Theralert</span>
              </Link>
            </div>
          </div>
          <div className="hidden md:flex items-center space-x-3">
            {status === 'authenticated' ? (
              <>
                <Link href="/dashboard" className="py-2 px-2 font-medium text-gray-500 rounded hover:bg-green-500 hover:text-white transition duration-300">Dashboard</Link>
                {/* New: Link to Profile Page */}
                <Link href="/profile" className="py-2 px-2 font-medium text-gray-500 rounded hover:bg-green-500 hover:text-white transition duration-300">Profile</Link>
                {/* Removed the <a> tag and used a simple button with onClick handler */}
                <button
                  onClick={handleLogout}
                  className="py-2 px-2 font-medium text-white bg-green-500 rounded hover:bg-green-400 transition duration-300 transform transition-all duration-200 hover:scale-105"
                >
                  Log Out
                </button>
              </>
            ) : (
              <Link href="/login" className="py-2 px-2 font-medium text-white bg-green-500 rounded hover:bg-green-400 transition duration-300 transform transition-all duration-200 hover:scale-105">Log In</Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
