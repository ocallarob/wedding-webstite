type AdminLoginFormProps = {
  nextPath: '/dashboard' | '/dashboard/gallery';
  error?: string;
};

export function AdminLoginForm({ nextPath, error }: AdminLoginFormProps) {
  const isGallery = nextPath === '/dashboard/gallery';

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-5">
      <form action="/api/dashboard" method="POST" className="w-full space-y-4 rounded-2xl border border-stone bg-white/90 p-6">
        <div className="space-y-1 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">{isGallery ? 'Gallery admin' : 'Dashboard'}</p>
          <h1 className="font-heading text-2xl font-light text-charcoal">Admin access</h1>
        </div>
        <input type="hidden" name="next" value={nextPath} />
        <label className="block space-y-1.5 text-sm">
          <span className="label-serif">Password</span>
          <input type="password" name="password" required className="w-full rounded-xl border border-stone bg-white px-3 py-2.5" />
        </label>
        {error === 'invalid_password' && <p className="text-xs text-red-700">Password incorrect. Try again.</p>}
        {error === 'unauthorized' && <p className="text-xs text-red-700">Your admin session is no longer valid. Try again.</p>}
        {error === 'missing_admin_secret' && (
          <p className="text-xs text-red-700">
            Admin access is not configured. Add <code>ADMIN_SECRET</code> to this environment and redeploy.
          </p>
        )}
        <button type="submit" className="btn btn-primary w-full">Open {isGallery ? 'gallery admin' : 'dashboard'}</button>
      </form>
    </div>
  );
}
