export default function Privacy() {
  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm mb-8" style={{ color: 'var(--color-text-muted)' }}>Last updated: June 23, 2026</p>

      <div className="space-y-6 text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
        <section>
          <h2 className="text-base font-semibold mb-2" style={{ color: 'var(--color-text)' }}>Overview</h2>
          <p>ShribeTRAKR is a personal workout tracking application. This policy explains what data we collect and how we use it.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold mb-2" style={{ color: 'var(--color-text)' }}>Data We Collect</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Email address and password (for account login)</li>
            <li>Workout data you enter: plans, exercises, sets, reps, and weight</li>
            <li>Schedule entries and workout history</li>
            <li>Profile information: name, username, bio, avatar</li>
            <li>If you connect Whoop: recovery scores, HRV, resting heart rate, strain, and sleep data from your Whoop account</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold mb-2" style={{ color: 'var(--color-text)' }}>How We Use Your Data</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>To provide the workout tracking features of the app</li>
            <li>To display your Whoop health metrics within the app</li>
            <li>We do not sell, share, or distribute your data to third parties</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold mb-2" style={{ color: 'var(--color-text)' }}>Whoop Integration</h2>
          <p>If you connect your Whoop account, ShribeTRAKR accesses your Whoop data (recovery, sleep, strain, HRV, resting heart rate) solely to display it within the app. We store your Whoop access tokens securely to enable this. You can disconnect your Whoop account at any time from the Whoop tab in the app.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold mb-2" style={{ color: 'var(--color-text)' }}>Data Storage</h2>
          <p>All data is stored in a private database hosted on Railway. Your data is not accessible to other users except for profile information and workout plans you explicitly choose to share.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold mb-2" style={{ color: 'var(--color-text)' }}>Data Deletion</h2>
          <p>You can delete your workout history and plans at any time within the app. To request full account deletion, contact us.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold mb-2" style={{ color: 'var(--color-text)' }}>Contact</h2>
          <p>For any privacy questions, reach out via shribetrakr.com.</p>
        </section>
      </div>
    </div>
  );
}
