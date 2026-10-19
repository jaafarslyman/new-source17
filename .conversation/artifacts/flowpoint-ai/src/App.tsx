import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import LoginPage from '@/pages/login';
import DashboardPage from '@/pages/dashboard';
import InboxPage from '@/pages/inbox';
import ContactsPage from '@/pages/contacts';
import TeamPage from '@/pages/team';
import BusinessPoliciesPage from '@/pages/business-policies';
import AgentPage from '@/pages/agent';
import PropertiesPage from '@/pages/properties';
import PropertyDetailPage from '@/pages/property-detail';
import ServicesPage from '@/pages/services';
import RequestsPage from '@/pages/requests';
import { SettingsProvider } from '@/contexts/SettingsContext';
import FlowPointLogo from '@/components/FlowPointLogo';
import { isSupabaseConfigured } from '@/lib/supabase';

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={LoginPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/inbox" component={InboxPage} />
      <Route path="/contacts" component={ContactsPage} />
      <Route path="/team" component={TeamPage} />
      <Route path="/business-policies" component={BusinessPoliciesPage} />
      <Route path="/agent" component={AgentPage} />
      <Route path="/properties" component={PropertiesPage} />
      <Route path="/properties/:id" component={PropertyDetailPage} />
      <Route path="/services" component={ServicesPage} />
      <Route path="/requests" component={RequestsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function ConfigurationRequired() {
  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-white px-6 text-black">
      <div className="absolute inset-0 animate-breathing-mesh" />
      <div className="bg-noise mix-blend-overlay" />
      <section className="relative z-10 w-full max-w-xl rounded-[24px] bg-white p-10 shadow-[0_40px_120px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.04)] sm:p-12">
        <div className="mb-8 flex items-center gap-4">
          <FlowPointLogo className="h-11 w-11" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/40">
              FlowPoint AI
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">Finish setup to continue</h1>
          </div>
        </div>
        <p className="max-w-lg text-[15px] leading-7 text-black/60">
          The app is ready, but it needs your Supabase project settings before sign-in and workspace
          data can be enabled.
        </p>
        <div className="mt-8 rounded-2xl border border-black/10 bg-black/[0.03] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-black/45">
            Add these environment variables
          </p>
          <pre className="mt-4 overflow-x-auto text-sm leading-7 text-black/75">
            <code>{`VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key`}</code>
          </pre>
        </div>
        <p className="mt-6 text-xs leading-5 text-black/45">
          After adding them, restart the app so Vite can include the build-time values.
        </p>
      </section>
    </main>
  );
}

function App() {
  if (!isSupabaseConfigured) {
    return <ConfigurationRequired />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          {/* SettingsProvider at root so every page can read context correctly */}
          <SettingsProvider>
            <Router />
          </SettingsProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
