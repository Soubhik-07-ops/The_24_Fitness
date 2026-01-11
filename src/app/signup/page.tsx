// src/app/signup/page.tsx

import { Suspense } from 'react';
import AuthForm from '@/components/Auth/AuthForm';

function AuthFormContent() {
    return <AuthForm />;
}

export default function SignUpPage() {
    return (
        <main>
            <Suspense fallback={<div>Loading...</div>}>
                <AuthFormContent />
            </Suspense>
        </main>
    );
}