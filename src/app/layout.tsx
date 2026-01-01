// src/app/layout.tsx (FINAL SIMPLE VERSION)
import './globals.css';
import RealtimeNotifications from '@/components/Notifications/RealtimeNotifications';
import The24FitBot from '@/components/Chatbot/The24FitBot';
import { Inter } from 'next/font/google';
import { AdminAuthProvider } from '@/contexts/AdminAuthContext';
import { TrainerAuthProvider } from '@/contexts/TrainerAuthContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  metadataBase: new URL('https://www.the24fitness.co.in'),
  title: {
    default: 'The 24 Fitness Gym - Premium Gym & Fitness Center',
    template: '%s | The 24 Fitness Gym',
  },
  description: 'Join The 24 Fitness Gym for premium gym facilities, personal training, and fitness classes. 24/6 gym access, expert trainers, modern equipment, and flexible membership plans.',
  keywords: ['gym', 'fitness center', '24 fitness', 'gym membership', 'personal trainer', 'fitness classes', 'gym near me', 'the 24 fitness', 'the24fitness'],
  authors: [{ name: 'The 24 Fitness Gym' }],
  creator: 'The 24 Fitness Gym',
  publisher: 'The 24 Fitness Gym',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: 'https://www.the24fitness.co.in',
    siteName: 'The 24 Fitness Gym',
    title: 'The 24 Fitness Gym - Premium Gym & Fitness Center',
    description: 'Join The 24 Fitness Gym for premium gym facilities, personal training, and fitness classes. 24/6 gym access, expert trainers, modern equipment.',
    images: [
      {
        url: '/Brand LOGO.png',
        width: 1200,
        height: 630,
        alt: 'The 24 Fitness Gym Logo',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
  title: 'The 24 Fitness Gym - Premium Gym & Fitness Center',
    description: 'Join The 24 Fitness Gym for premium gym facilities, personal training, and fitness classes.',
    images: ['/Brand LOGO.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    // Add Google Search Console verification code here after setup
    // google: 'your-google-verification-code',
  },
  alternates: {
    canonical: 'https://www.the24fitness.co.in',
  },
  icons: {
    icon: '/icon.png',
    shortcut: '/icon.png',
    apple: '/icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <AdminAuthProvider>
          <TrainerAuthProvider>
            {children}
            <RealtimeNotifications mode="user" />
            <The24FitBot />
          </TrainerAuthProvider>
        </AdminAuthProvider>
      </body>
    </html>
  );
}