import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white">
      {/* Header */}
      <header className="container mx-auto px-4 py-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold">Arkon</h1>
        <nav className="flex items-center gap-4">
          <Link href="/login" className="text-gray-300 hover:text-white">
            Sign in
          </Link>
          <Link
            href="/register"
            className="px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            Get Started
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-20 text-center">
        <div className="inline-block px-4 py-1 bg-blue-600/20 rounded-full text-blue-400 text-sm font-medium mb-6">
          Now in Private Beta
        </div>
        <h2 className="text-5xl font-bold mb-6">
          AI Agent Gateway Platform
        </h2>
        <p className="text-xl text-gray-300 max-w-2xl mx-auto mb-8">
          Monitor, secure, and manage your AI agents with comprehensive observability,
          cost tracking, and workflow automation. Privacy-first by design.
        </p>
        <div className="flex justify-center gap-4">
          <Link
            href="/register"
            className="px-6 py-3 bg-blue-600 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Start Free Trial
          </Link>
          <Link
            href="#features"
            className="px-6 py-3 border border-gray-600 rounded-lg font-semibold hover:bg-gray-800 transition-colors"
          >
            Learn More
          </Link>
        </div>
        <p className="text-gray-500 text-sm mt-4">
          No credit card required. Get started in minutes.
        </p>
      </section>

      {/* Features */}
      <section id="features" className="container mx-auto px-4 py-20">
        <h3 className="text-3xl font-bold text-center mb-12">Key Features</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-gray-800 rounded-lg p-6">
            <span className="text-4xl mb-4 block">📊</span>
            <h4 className="text-xl font-semibold mb-2">Dashboard</h4>
            <p className="text-gray-400">
              Real-time overview of all your AI agents with key metrics and trends.
            </p>
          </div>
          <div className="bg-gray-800 rounded-lg p-6">
            <span className="text-4xl mb-4 block">🛡️</span>
            <h4 className="text-xl font-semibold mb-2">Security</h4>
            <p className="text-gray-400">
              ThreatGuard detects and alerts you to security threats and anomalies.
            </p>
          </div>
          <div className="bg-gray-800 rounded-lg p-6">
            <span className="text-4xl mb-4 block">💰</span>
            <h4 className="text-xl font-semibold mb-2">Cost Tracking</h4>
            <p className="text-gray-400">
              Track spending by agent and model with budget alerts.
            </p>
          </div>
          <div className="bg-gray-800 rounded-lg p-6">
            <span className="text-4xl mb-4 block">⚡</span>
            <h4 className="text-xl font-semibold mb-2">Workflows</h4>
            <p className="text-gray-400">
              Automate tasks and responses with event-driven workflows.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-16 text-center">
        <h3 className="text-3xl font-bold mb-4">Ready to get started?</h3>
        <p className="text-gray-400 mb-8 max-w-xl mx-auto">
          Join teams using Arkon to manage their AI infrastructure with confidence.
        </p>
        <Link
          href="/register"
          className="inline-block px-8 py-4 bg-blue-600 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          Create Free Account
        </Link>
      </section>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-8 border-t border-gray-700">
        <div className="flex justify-between items-center">
          <p className="text-gray-400">Arkon - AI Agent Gateway Platform</p>
          <div className="flex gap-4">
            <Link href="/login" className="text-gray-400 hover:text-white text-sm">
              Sign In
            </Link>
            <Link href="/admin" className="text-gray-400 hover:text-white text-sm">
              Admin
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
