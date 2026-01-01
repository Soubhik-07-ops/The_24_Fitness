// src/app/signup/page.tsx

import { Suspense } from 'react';
import AuthForm from '@/components/Auth/AuthForm';

function SignUpContent() {
    return (
        <main>
            <AuthForm />
        </main>
    );
}

export default function SignUpPage() {
    return (
        <Suspense fallback={<main><div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>Loading...</div></main>}>
            <SignUpContent />
        </Suspense>
    );
}