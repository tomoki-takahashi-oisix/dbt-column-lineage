import {FcGoogle} from 'react-icons/fc'

export default function Login() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border bg-white p-8 shadow-sm text-center">
        <h1 className="text-2xl font-semibold text-gray-900">
          dbt column lineage
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Sign in to visualize your column-level lineage
        </p>

        <a href="/oauth" className="mt-8 block">
          <button
            type="button"
            className="w-full flex items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors duration-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
          >
            <FcGoogle className="h-5 w-5" />
            <span>Sign in with Google</span>
          </button>
        </a>
      </div>
    </main>
  )
}
