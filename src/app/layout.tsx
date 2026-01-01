// src/app/layout.tsx (FINAL SIMPLE VERSION)
import './globals.css';
import RealtimeNotifications from '@/components/Notifications/RealtimeNotifications';
import The24FitBot from '@/components/Chatbot/The24FitBot';
import { Inter } from 'next/font/google';
import { AdminAuthProvider } from '@/contexts/AdminAuthContext';
import { TrainerAuthProvider } from '@/contexts/TrainerAuthContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'The 24 Fitness Gym - Premium Gym & Fitness Center',
  description: 'Join The 24 Fitness Gym for premium gym facilities, personal training, and fitness classes',
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