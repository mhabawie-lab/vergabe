import { redirect } from 'next/navigation';

/** The application entry point is the dashboard; auth is enforced there. */
export default function RootPage() {
  redirect('/dashboard');
}
