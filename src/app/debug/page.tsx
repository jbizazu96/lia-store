export default function DebugPage() {
  return (
    <div style={{ padding: 20 }}>
      <h1>Debug</h1>

      <p>
        Project ID:
        {process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}
      </p>

      <p>
        Auth Domain:
        {process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}
      </p>

      <p>
        Storage Bucket:
        {process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}
      </p>
    </div>
  );
}